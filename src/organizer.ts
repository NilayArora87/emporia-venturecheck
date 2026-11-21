import { randomUUID } from 'node:crypto';
import { open, password } from './db.ts';
const [email,name]=process.argv.slice(2);
const pass=process.env.VC_ADMIN_PASSWORD;
if(!email || !/^\S+@\S+\.\S+$/.test(email) || !name || !pass || pass.length<10 || pass.length>200){
  throw new Error('Pass an email and name and set VC_ADMIN_PASSWORD to 10–200 characters.');
}
const db=open();
try{
  db.prepare("INSERT INTO users(id,name,email,hash,role) VALUES (?,?,?,?,'organizer')").run(randomUUID(),name,email.toLowerCase(),password(pass));
  console.log('Organizer account created.');
} finally{db.close();}
