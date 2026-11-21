import {backup} from 'node:sqlite';
import {existsSync} from 'node:fs';
import {open} from './db.ts';
const path=process.argv[2];
if(!path || existsSync(path)) throw new Error('Provide a new backup filename, e.g. npm run backup -- event-backup.sqlite');
const db=open();
try { await backup(db,path); } finally { db.close(); }
console.log('Backup written to '+path);
