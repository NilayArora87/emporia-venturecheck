import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { backup } from 'node:sqlite';
import { application } from '../src/server.ts';
import { open } from '../src/db.ts';
import { seed } from '../src/seed.ts';

// Dispatch the same Node HTTP request handler without requiring a port.
function client(server:ReturnType<typeof application>['server']){
  let cookie='';
  async function request(path:string, payload?:unknown){
    const req=Object.assign(Readable.from(payload===undefined?[]:[JSON.stringify(payload)]),{
      method:payload===undefined?'GET':'POST',url:path,socket:{remoteAddress:'test'},headers:{'content-type':'application/json',cookie,host:'test.local',origin:'http://test.local'}
    });
    const headers:Record<string,string>={};
    return new Promise<{status:number;data:any;headers:Record<string,string>}>(resolve=>{
      const res={
        headersSent:false,status:200,
        setHeader(key:string,value:string){headers[key.toLowerCase()]=value;},
        writeHead(status:number,values:Record<string,string>){this.status=status; this.headersSent=true; for(const [k,v] of Object.entries(values))this.setHeader(k,v);},
        end(value:string|Buffer){if(headers['set-cookie']) cookie=headers['set-cookie'].split(';')[0];
          const valueString=value?.toString()??'';
          const data=headers['content-type']?.includes('application/json')?JSON.parse(valueString):valueString;
          resolve({status:this.status,data,headers});
        }
      };
      server.emit('request',req,res);
    });
  }
  return {request, login:async(name:string,pass='venture-demo')=>assert.equal((await request('/api/login',{email:name+'@venture.local',password:pass})).status,200)};
}

test('team draft, lock, revisions and private judge review survive restart and backup',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'venturecheck-test-'));
  const path=join(dir,'test.sqlite');
  let app=application(path);
  try{
    seed(app.db);
    const unauthed=client(app.server);
    assert.equal((await unauthed.request('/')).status,200);
    assert.equal((await unauthed.request('/api/home')).status,401);
    const owner=client(app.server),other=client(app.server),judge=client(app.server),judge2=client(app.server),admin=client(app.server);
    for(const [user,name] of [[owner,'team'],[other,'team2'],[judge,'judge'],[judge2,'judge2'],[admin,'admin']] as const)await user.login(name);
    const path='/api/project/practice-food';
    assert.equal((await other.request(path)).status,404);
    assert.equal((await judge.request(path)).status,404);
    const draft=(await owner.request(path)).data.draft;
    const partial={...draft,title:'',launch:'',target:null,evidence:[{label:'',period:'',detail:''}]};
    assert.equal((await owner.request(path+'/draft',{plan:partial,revision:0})).data.revision,1);
    assert.equal((await owner.request(path+'/submit',{revision:1})).status,400);
    assert.deepEqual((await owner.request(path)).data.draft,partial);
    draft.actuals=[{month:'2026-12',revenue:0}];
    assert.equal((await owner.request(path+'/draft',{plan:draft,revision:1})).data.revision,2);
    assert.equal((await owner.request(path+'/draft',{plan:draft,revision:1})).status,409);
    const submitted=(await owner.request(path+'/submit',{revision:2})).data;
    assert.equal(submitted.version,1);
    assert.deepEqual((await owner.request(path+'/submit',{revision:2})).data,submitted);
    draft.title='Campus Kitchen revised';
    await owner.request(path+'/draft',{plan:draft,revision:2});
    assert.equal((await owner.request(path+'/submit',{revision:3})).data.version,2);
    assert.equal((await admin.request('/api/admin',{action:'lock',eventId:'practice'})).status,200);
    assert.equal((await owner.request(path+'/draft',{plan:draft,revision:3})).status,409);
    const locked=(await judge.request(path)).data;
    assert.equal(locked.draft,null);
    assert.equal(locked.version,2);
    assert.equal((await judge.request(path+'?version=1')).status,404);
    assert.equal((await owner.request(path+'?version=1')).data.forecast.plan.title,'Campus Kitchen');
    assert.equal(locked.forecast.plan.title,'Campus Kitchen revised');
    assert.equal(locked.forecast.result.revenue,67200000);
    assert.equal(locked.forecast.result.months[0].growthReason,'No prior revenue');
    assert.equal((await judge.request(path+'/draft',{plan:draft,revision:3})).status,403);
    const scenario={caseName:'base',overrides:{capacity:50,demand:50},name:'Growth case',calendar:draft.calendar};
    scenario.calendar[0].capex=20000;
    assert.equal((await judge.request(path+'/calculate',scenario)).data.result.revenue,120000000);
    assert.equal((await judge.request(path+'/scenario',scenario)).status,200);
    assert.equal((await judge.request(path+'/scenario',scenario)).status,200);
    assert.equal((await judge.request(path+'/review',{scores:{customers:5},notes:'Private note'})).data.total,null);
    const review={scores:{customers:5,economics:4,growth:4,execution:4,risks:4},notes:'Private note'};
    assert.equal((await judge.request(path+'/review',review)).data.total,85);
    assert.equal((await judge.request(path+'/review',review)).data.total,85);
    const otherView=(await judge2.request(path)).data;
    assert.equal(otherView.review,null);
    assert.deepEqual(otherView.scenarios,[]);
    assert.equal(otherView.forecast.result.revenue,67200000);
    const csv=await judge.request(path+'/csv');
    assert.match(csv.headers['content-type'],/text\/csv/);
    assert.match(csv.data,/2027-01,560,,56000\.00/);
    assert.equal((await admin.request('/api/events/practice/compare')).data.rows[0].total,85);
    assert.ok(!JSON.stringify((await admin.request('/api/events/practice/compare')).data).includes('Private note'));
    assert.equal((await admin.request('/api/admin',{action:'assign',id:'practice-food',judge:'judge2',remove:true})).status,200);
    assert.equal((await judge2.request(path)).status,404);
    const copy=join(dir,'copy.sqlite');
    await backup(app.db,copy);
    app.db.close();
    app=application(copy);
    const again=client(app.server);
    await again.login('judge');
    const saved=(await again.request(path)).data;
    assert.equal(saved.review.notes,'Private note');
    assert.equal(saved.scenarios.length,1);
    assert.equal(saved.scenarios[0].calendar[0].capex,20000);
    assert.equal(app.db.prepare('SELECT COUNT(*) AS n FROM submissions WHERE startup_id=?').get('practice-food')!.n,2);
    const restored=open(copy);
    restored.close();
  } finally {app.db.close();rmSync(dir,{recursive:true,force:true});}
});

test('organizer controls account, event, rubric, assignment and reviewed benchmarks',async()=>{
  const app=application(':memory:');
  try{
    seed(app.db);
    const admin=client(app.server),team=client(app.server),judge=client(app.server),judge2=client(app.server);
    await admin.login('admin');await team.login('team');await judge.login('judge');await judge2.login('judge2');
    assert.equal((await team.request('/api/admin')).status,403);
    const call=(payload:unknown)=>admin.request('/api/admin',payload);
    const deadline='2098-11-21T12:30+05:30';
    const rubric=[{key:'growth',label:'Growth',weight:100}];
    assert.equal((await call({action:'event',name:'Invalid',deadline,rubric:[{key:'growth',label:'Growth',weight:90}]})).status,400);
    const eventId=(await admin.request('/api/admin')).data.events[0].id;
    assert.ok(eventId);
    const account=await call({action:'user',name:'New Team',email:'new@venture.local',role:'team',password:'new password'});
    assert.equal(account.status,200);
    const owner=account.data.id;
    const sId=(await admin.request('/api/admin')).data.startups.find((s:any)=>s.owner===owner).id;
    assert.ok(sId);
    assert.equal((await call({action:'event',name:'Updated event',id:eventId,deadline,rubric})).status,200);
    assert.equal((await call({action:'assign',id:sId,judge:'judge'})).status,200);
    assert.equal((await call({action:'assign',id:sId,judge:'judge2'})).status,200);
    const [header]=readFileSync(new URL('../data/benchmarks.csv',import.meta.url),'utf8').split('\n');
    const raw=header+'\ncart-cost,Food & beverage,India,Idea,product.materials,Materials for one order,₹ / input unit,Median,34,Demo publisher,https://example.org/demo,Table 1,2025,Demo data,2026-11-21,Synthetic test fixture,25';
    assert.equal((await call({action:'preview',csv:raw})).data.rows.length,1);
    assert.ok((await call({action:'preview',csv:raw.replace('₹ / input unit','bananas')})).data.errors.length);
    const source=(await call({action:'import',title:'Synthetic test fixture',csv:raw})).data.id;
    assert.equal((await call({action:'snapshot',eventId,id:source})).status,400);
    assert.equal((await call({action:'approve',id:source})).status,200);
    assert.equal((await call({action:'snapshot',eventId,id:source})).status,200);
    assert.equal((await call({action:'import',title:'Repeated snapshot',csv:raw})).data.id,source);
    const newcomer=client(app.server);await newcomer.login('new','new password');
    const p='/api/project/'+sId;
    const draft=(await newcomer.request(p)).data.draft;
    Object.assign(draft.drivers.materials,{kind:'benchmark',source:'cart-cost',period:'2025',base:33});
    await newcomer.request(p+'/draft',{plan:draft,revision:0});
    assert.equal((await newcomer.request(p+'/submit',{revision:1})).status,400);
    draft.drivers.materials.base=34;
    await newcomer.request(p+'/draft',{plan:draft,revision:1});
    assert.equal((await newcomer.request(p+'/submit',{revision:2})).status,200);
    assert.equal((await call({action:'lock',eventId})).status,200);
    assert.equal((await judge.request(p)).data.forecast.benchmarks[0].usage,'Eligible model input');
    const events=(await admin.request('/api/home')).data.events;
    assert.deepEqual(events.map((e:any)=>e.name),['Emporia 5.0']);
    assert.equal(events[0].locked,true);
  } finally {app.db.close();}
});

test('public registration creates teams and judge creation requires an administrator',async()=>{
  const app=application(':memory:');
  try{
    seed(app.db);
    const guest=client(app.server),admin=client(app.server),judge=client(app.server);
    const account={name:'Campus Makers',email:'makers@venture.local',password:'college-event-26'};
    for(const role of ['judge','organizer']){
      assert.equal((await guest.request('/api/register',{...account,role})).status,403);
    }
    assert.equal((await guest.request('/api/register',account)).status,201);
    assert.equal((await guest.request('/api/register',account)).status,409);
    await guest.login('makers',account.password);
    assert.equal((await guest.request('/api/home')).data.user.role,'team');
    const judgeAccount={...account,email:'panelist@venture.local',name:'Panelist',role:'judge',action:'user'};
    assert.equal((await guest.request('/api/admin',judgeAccount)).status,403);
    await judge.login('judge');
    assert.equal((await judge.request('/api/admin',judgeAccount)).status,403);
    await admin.login('admin');
    assert.equal((await admin.request('/api/admin',judgeAccount)).status,200);
    const panel=(await admin.request('/api/admin')).data;
    assert.ok(panel.users.some((u:any)=>u.email===account.email&&u.role==='team'));
    const teamHome=(await guest.request('/api/home')).data;
    assert.equal(teamHome.events[0].name,'Emporia 5.0');
    const food=panel.startups.find((s:any)=>s.id===teamHome.events[0].startups[0].id);
    assert.equal(food.version,null);
    assert.ok(Date.parse(food.updated));
  }finally{app.db.close();}
});

test('Emporia team previews and submits; admin reopens one pitch, manages access and reopens the event',async()=>{
  const app=application(':memory:');
  try{
    seed(app.db);
    const admin=client(app.server),team=client(app.server),judge=client(app.server);
    await admin.login('admin'); await judge.login('judge');
    const registration={email:'founder@venture.local',password:'founder-demo-26',name:'Campus Ventures'};
    await team.request('/api/register',registration); await team.login('founder',registration.password);
    const home=(await team.request('/api/home')).data;
    const pitch=home.events[0].startups[0], eventId=home.events[0].id, path='/api/project/'+pitch.id;
    const control=(action:string,data:Record<string,unknown>)=>admin.request('/api/admin',{action,...data});
    assert.equal(pitch.editable,true);
    const draft=(await team.request(path)).data.draft;
    const preview=(await team.request(path+'/preview',{plan:draft})).data;
    assert.ok(preview.cases.base.revenue>0);
    assert.ok(preview.cases.downside&&preview.cases.upside);
    assert.equal((await team.request(path)).data.version,null);
    assert.equal((await judge.request(path+'/preview',{})).status,404);
    assert.equal((await team.request(path+'/submit',{revision:0})).data.version,1);
    await control('lock',{eventId});
    assert.equal((await team.request(path)).data.editable,false);
    assert.equal((await admin.request(path+'/preview',{})).data.cases.base.revenue,preview.cases.base.revenue);
    await control('revision-window',{id:pitch.id,enabled:true});
    draft.target=900000;
    assert.equal((await team.request(path+'/draft',{revision:0,plan:draft})).data.revision,1);
    assert.equal((await team.request(path+'/submit',{revision:1})).data.version,2);
    assert.equal((await team.request(path)).data.editable,false);
    assert.equal((await team.request(path+'?version=1')).data.forecast.plan.target,0);
    await control('account-status',{id:home.user.id,disabled:true});
    assert.equal((await team.request('/api/home')).status,401);
    assert.equal((await team.request('/api/login',registration)).status,401);
    await control('account-status',{id:home.user.id,disabled:false});
    await team.login('founder',registration.password);
    assert.equal((await control('reopen',{eventId,deadline:'2000-01-01T12:00+05:30'})).status,400);
    assert.equal((await control('reopen',{eventId,deadline:'2098-01-01T12:00+05:30'})).status,200);
    assert.equal((await team.request(path)).data.editable,true);
    assert.ok((await admin.request('/api/admin')).data.activity.some((a:any)=>a.action==='revision-window'));
  }finally{app.db.close();}
});

test('full reset is admin-only, backs up real event records, survives retries, and supports either roster choice',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'emporia-reset-'));
  const app=application(join(dir,'event.sqlite'));
  try{
    const {password}=await import('../src/db.ts');
    const add=app.db.prepare('INSERT INTO users VALUES (?,?,?,?,?)');
    add.run('admin','Admin','admin@venture.local',password('venture-demo'),'organizer');
    const admin=client(app.server),team=client(app.server),judge=client(app.server);
    await admin.login('admin');
    await team.request('/api/register',{name:'Team A',email:'team@venture.local',password:'venture-demo'});
    await team.login('team');
    await admin.request('/api/admin',{action:'user',name:'Judge A',email:'judge@venture.local',password:'venture-demo',role:'judge'});
    await judge.login('judge');
    const panel=(await admin.request('/api/admin')).data;
    const id=panel.startups[0].id,eventId=panel.events[0].id;
    const judgeId=panel.users.find((u:any)=>u.role==='judge').id;
    await admin.request('/api/admin',{action:'assign',id,judge:judgeId});
    await team.request('/api/project/'+id+'/submit',{revision:0});
    await admin.request('/api/admin',{action:'lock',eventId});
    assert.equal((await judge.request('/api/project/'+id+'/review',{version:0,scores:{},notes:'Stale review'})).status,409);
    await judge.request('/api/project/'+id+'/review',{version:1,scores:{},notes:'Practice feedback'});
    const teamId=panel.startups[0].owner;
    const award=(marks:number|null)=>admin.request('/api/admin',{action:'marks',id:teamId,marks});
    const eligibility=(disqualified:boolean)=>admin.request('/api/admin',{action:'eligibility',id:teamId,disqualified});
    const standing=async()=>(await admin.request('/api/events/'+eventId+'/compare')).data.rows[0];
    assert.equal((await team.request('/api/admin',{action:'marks',id:teamId,marks:100})).status,403);
    assert.equal((await judge.request('/api/admin',{action:'eligibility',id:teamId,disqualified:true})).status,403);
    assert.equal((await award(101)).status,400);
    await award(0);assert.equal((await standing()).total,0);
    await award(null);assert.equal((await standing()).total,null);
    await award(80);
    const scores=Object.fromEntries(panel.events[0].rubric.map((r:any)=>[r.key,5]));
    await judge.request('/api/project/'+id+'/review',{version:1,scores,notes:'Practice feedback'});
    assert.equal((await standing()).total,90);
    await eligibility(true);
    assert.equal((await standing()).rank,null);
    assert.equal((await team.request('/api/home')).data.events[0].startups[0].disqualified,true);
    assert.equal((await judge.request('/api/project/'+id+'/review',{scores:{},notes:''})).status,409);
    await eligibility(false);
    assert.equal((await standing()).rank,1);
    assert.equal((await standing()).total,90);
    const request={action:'reset',mode:'keep',adminPassword:'venture-demo',deadline:'2098-10-10T12:00:00+05:30',confirmation:'RESET EMPORIA 5.0',requestId:panel.resetToken};
    assert.equal((await team.request('/api/admin',request)).status,403);
    assert.equal((await admin.request('/api/admin',{...request,adminPassword:'wrong'})).status,400);
    assert.equal((await admin.request('/api/admin',{...request,confirmation:''})).status,400);
    const reset=await admin.request('/api/admin',request);
    assert.equal(reset.status,200,JSON.stringify(reset.data));
    const recovery=open(reset.data.backup);
    assert.equal(recovery.prepare('SELECT notes FROM reviews').get()?.notes,'Practice feedback');
    assert.equal(recovery.prepare('SELECT COUNT(*) n FROM submissions').get()?.n,1);
    recovery.close();
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM team_decisions').get()?.n,0);
    const fresh=(await team.request('/api/home')).data.events[0];
    assert.equal(fresh.locked,false);
    assert.equal(fresh.startups[0].version,null);
    assert.notEqual(fresh.startups[0].id,id);
    await team.request('/api/project/'+fresh.startups[0].id+'/submit',{revision:0});
    assert.deepEqual((await admin.request('/api/admin',request)).data,reset.data);
    assert.equal(app.db.prepare('SELECT COUNT(*) n FROM submissions').get()?.n,1);
    const again=(await admin.request('/api/admin')).data;
    assert.equal((await admin.request('/api/admin',{...request,mode:'clear',requestId:again.resetToken})).status,200);
    assert.equal((await team.request('/api/home')).status,401);
    assert.equal((await judge.request('/api/home')).status,401);
    assert.equal((await admin.request('/api/admin')).data.users.length,1);
    assert.deepEqual(app.db.prepare('PRAGMA foreign_key_check').all(),[]);
  }finally{app.db.close();rmSync(dir,{recursive:true,force:true});}
});
