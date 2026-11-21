import {open} from './db.ts';
open().close();
console.log('Migrations are up to date.');
