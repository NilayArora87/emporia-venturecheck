import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
export const now=()=>new Date().toISOString();
export const pack=JSON.stringify;
export const unpack=JSON.parse;
export const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
export function password(value:string,salt=randomBytes(16).toString('hex')){
  return salt+':'+scryptSync(value,salt,64).toString('hex');
}
export function verify(value:string,stored:string) {
  return timingSafeEqual(Buffer.from(password(value,stored.split(':')[0])),Buffer.from(stored));
}
export function open(path=process.env.VC_DB||'var/venturecheck.sqlite'){
  if(path!==':memory:') mkdirSync(dirname(path),{recursive:true});
  const db=new DatabaseSync(path);
  db.exec('PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS migrations(name TEXT PRIMARY KEY);');
  transaction(db,()=>{
    for(const file of readdirSync(new URL('../migrations/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort()){
      if(!db.prepare('SELECT name FROM migrations WHERE name=?').get(file)){
        db.exec(readFileSync(new URL('../migrations/'+file,import.meta.url),'utf8'));
        db.prepare('INSERT INTO migrations VALUES (?)').run(file);
      }
    }
  });
  return db;
}
export function transaction<T>(db:DatabaseSync, fn:()=>T):T{
  db.exec('BEGIN IMMEDIATE');
  try {const result=fn(); db.exec('COMMIT'); return result;}
  catch(error){db.exec('ROLLBACK'); throw error;}
}
