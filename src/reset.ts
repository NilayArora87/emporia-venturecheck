import { chmodSync, mkdirSync, mkdtempSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { defaultPlan } from './model.ts';
import { now, transaction, verify } from './db.ts';
import { randomUUID } from 'node:crypto';

export function resetEvent(db:DatabaseSync, eventId:string, actor:string, data:Record<string,unknown>){
  const {mode,confirmation,adminPassword,requestId,deadline}=data;
  if(confirmation!=='RESET EMPORIA 5.0'||typeof adminPassword!=='string'||adminPassword.length>200)throw Error('Enter your admin password and type RESET EMPORIA 5.0.');
  const admin=db.prepare("SELECT hash FROM users WHERE id=? AND role='organizer'").get(actor);
  if(!admin||!verify(adminPassword,String(admin.hash)))throw Error('Admin password is incorrect.');
  if(typeof requestId!=='string'||!/^[\da-f-]{36}$/i.test(requestId))throw Error('Reload the panel and try again.');
  const receipt=db.prepare('SELECT backup_file FROM reset_receipts WHERE request_id=? AND actor=? AND event_id=?').get(requestId,actor,eventId);
  if(receipt)return {backup:receipt.backup_file};
  if(!['keep','clear'].includes(String(mode)))throw Error('Choose a reset mode.');
  if(typeof deadline!=='string'||!Number.isFinite(Date.parse(deadline))||Date.parse(deadline)<=Date.now())throw Error('Choose a future submission deadline.');
  if(mode==='clear'&&db.prepare('SELECT 1 FROM events WHERE id<>?').get(eventId))throw Error('This database also holds other events. Keep shared accounts or start with a fresh database.');
  const database=String(db.prepare('PRAGMA database_list').get()?.file??'');
  if(!database)throw Error('Reset requires a file-backed database for recovery.');
  const root=resolve(dirname(database),'reset-backups');
  mkdirSync(root,{recursive:true,mode:0o700});
  const folder=mkdtempSync(join(root,'emporia-'));
  const file=join(folder,'before-reset.sqlite');
  // Synchronous snapshot and reset run consecutively on the single event server.
  db.prepare('VACUUM INTO ?').run(file);
  chmodSync(file,0o600);
  return transaction(db,()=>{
    const projects='SELECT id FROM startups WHERE event_id=?';
    const versions='SELECT id FROM submissions WHERE startup_id IN ('+projects+')';
    for(const table of ['reviews','scenarios'])db.prepare('DELETE FROM '+table+' WHERE submission_id IN ('+versions+')').run(eventId);
    for(const table of ['revision_windows','assignments','submissions'])db.prepare('DELETE FROM '+table+' WHERE startup_id IN ('+projects+')').run(eventId);
    db.prepare('DELETE FROM team_decisions WHERE event_id=?').run(eventId);
    db.prepare('DELETE FROM startups WHERE event_id=?').run(eventId);
    if(mode==='clear'){
      for(const table of ['sessions','disabled_accounts'])db.exec("DELETE FROM "+table+" WHERE user_id IN (SELECT id FROM users WHERE role<>'organizer')");
      db.exec("DELETE FROM users WHERE role<>'organizer'");
    }else{
      for(const team of db.prepare("SELECT id,name FROM users WHERE role='team'").all()){
        const plan=defaultPlan();plan.title=String(team.name);
        db.prepare('INSERT INTO startups VALUES (?,?,?,?,?,?)').run(randomUUID(),eventId,team.id,JSON.stringify(plan),0,now());
      }
    }
    db.prepare('UPDATE events SET locked=0,deadline=? WHERE id=?').run(new Date(deadline).toISOString(),eventId);
    db.prepare('INSERT INTO reset_receipts VALUES (?,?,?,?)').run(requestId,actor,eventId,file);
    db.prepare('INSERT INTO admin_activity(actor,action,subject,created) VALUES (?,?,?,?)').run(actor,'reset-'+mode,eventId,now());
    return {backup:file};
  });
}
