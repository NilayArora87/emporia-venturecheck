import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createHandler } from '../src/vercel-runtime.mjs';

// Supply a disposable Postgres URL. A private schema isolates each run.
test('Vercel cold starts preserve sessions, teams and reset backups', {skip:!process.env.VC_TEST_DATABASE_URL}, async () => {
  const schema = 'vc_test_' + randomUUID().replaceAll('-','');
  const setup = new pg.Pool({connectionString:process.env.VC_TEST_DATABASE_URL});
  await setup.query('CREATE SCHEMA '+schema);
  const pool = new pg.Pool({connectionString:process.env.VC_TEST_DATABASE_URL,options:'-c search_path='+schema});
  process.env.VC_ADMIN_EMAIL='organizer@example.test';
  process.env.VC_ADMIN_PASSWORD=randomUUID();
  process.env.VERCEL='1';
  try {
    const req=async (path,body,cookie)=>{
      const out={writeHead(status,headers){this.status=status;this.headers=headers;},end(body){this.body=JSON.parse(body);}};
      await createHandler(pool)({url:'/api/dispatch?vcroute='+path,method:body?'POST':'GET',body:body||'',headers:{host:'test.local','content-type':'application/json',cookie}},out);
      return out;
    };

    assert.equal((await req('demo')).body.enabled,false);
    let login=await req('login',{email:process.env.VC_ADMIN_EMAIL,password:process.env.VC_ADMIN_PASSWORD});
    assert.equal(login.status,200);assert.match(login.headers['Set-Cookie'],/Secure/);
    const cookie=login.headers['Set-Cookie'].split(';')[0];
    let team={name:'Test Team',email:'team@example.test',password:randomUUID()};
    assert.equal((await req('register',team)).status,201);
    assert.equal((await req('register',team)).status,409);
    assert.equal((await req('home',null,cookie)).body.events[0].startups.length,1);
    let panel=await req('admin',null,cookie);
    assert.equal(panel.status,200);
    const reset={action:'reset',mode:'keep',adminPassword:process.env.VC_ADMIN_PASSWORD,deadline:'2098-10-10T12:00:00+05:30',confirmation:'RESET EMPORIA 5.0',requestId:panel.body.resetToken};
    const resetResult=await req('admin',reset,cookie);
    assert.equal(resetResult.status,200);
    assert.equal(resetResult.body.backup,'before-reset-'+reset.requestId);
    assert.equal((await req('admin',reset,cookie)).body.backup,resetResult.body.backup);
    assert.equal((await pool.query('SELECT name FROM vc_event_images')).rows.length,2);
  } finally {
    await pool.end();
    await setup.query('DROP SCHEMA '+schema+' CASCADE');
    await setup.end();
  }
});
