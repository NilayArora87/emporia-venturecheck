import { resetEvent } from './reset.ts';
import { networkInterfaces } from 'node:os';
import { createServer } from 'node:http';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { open, now, pack, unpack, password, verify, digest, transaction } from './db.ts';
import { ENGINE, defaultPlan, definitions, industries, models, stages, validatePlan, validMonth } from './model.ts';
import { calculate, sensitivity, questions, backtest } from './forecast.ts';
import { actualPreview, benchmarkPreview, matches, validateBenchmarkDrivers } from './evidence.ts';
import { rubric as defaultRubric, seed } from './seed.ts';
import type { Plan, Case } from './model.ts';
import type { Benchmark } from './evidence.ts';
type User={id:string;name:string;email:string;role:'team'|'organizer'|'judge'};
type Rubric={key:string;label:string;weight:number}[];
type Row=Record<string,any>;
class HttpError extends Error { status:number; constructor(status:number,message:string){super(message);this.status=status;} }
function fail(status:number,message:string):never{throw new HttpError(status,message);}
function requireRule(condition:unknown,message='Access denied.',status=403){if(!condition) fail(status,message);}
function line(value:unknown,label:string,max=100){
  if(typeof value!=='string'||!value.trim()||value.length>max) fail(400,'Enter a valid '+label+'.');
  return value.trim();
}
function lock(event:Row){return Boolean(event.locked)||Date.parse(event.deadline)<=Date.now();}
function parseDate(value:unknown){
  if(typeof value!=='string'||!/^20\d\d-\d\d-\d\dT\d\d:\d\d/.test(value)||!Number.isFinite(Date.parse(value))) fail(400,'Enter a valid deadline.');
  return new Date(value).toISOString();
}
function validRubric(value:Rubric){
  if(!Array.isArray(value)||!value.length||value.length>12||value.some(r=>!r||typeof r.key!=='string'||!/^[a-z0-9-]{1,40}$/.test(r.key)||typeof r.label!=='string'||!r.label.trim()||r.label.length>100||!Number.isInteger(r.weight)||r.weight<1)||
      new Set(value.map(r=>r.key)).size!==value.length||value.reduce((s,r)=>s+r.weight,0)!==100) fail(400,'Rubric keys must be unique and positive integer weights must total 100.');
  return value;
}
function total(rubric:Rubric,scores:Record<string,number>){
  if(!rubric.every(r=>Number.isFinite(scores[r.key]))) return null;
  return rubric.reduce((sum,r)=>sum+scores[r.key]*r.weight,0)/5;
}
async function body(req:IncomingMessage){
  if(!req.headers['content-type']?.startsWith('application/json')) fail(415,'Send JSON.');
  const chunks:Buffer[]=[];let size=0;
  for await(const chunk of req){
    const bytes=Buffer.from(chunk);size+=bytes.length;chunks.push(bytes);
    if(size>400000) fail(413,'Request exceeds the size limit.');
  }
  try{const value=unpack(Buffer.concat(chunks).toString('utf8'));if(!value||Array.isArray(value)||typeof value!=='object') throw Error();return value;}
  catch{fail(400,'Invalid JSON.');}
}
function json(res:ServerResponse,data:unknown,status=200){
  res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(pack(data));
}
const files:Record<string,[string,string]>={
  '/':['index.html','text/html'], '/app.js':['app.js','text/javascript'], '/style.css':['style.css','text/css'], '/mark.svg':['mark.svg','image/svg+xml']
};
const fakeHash=password('unmatched');
export function application(path?:string){
  const db=open(path);
  const get=(sql:string,...args:any[])=>db.prepare(sql).get(...args) as Row|undefined;
  const all=(sql:string,...args:any[])=>db.prepare(sql).all(...args) as Row[];
  const run=(sql:string,...args:any[])=>db.prepare(sql).run(...args);
  if(process.env.VC_DEMO==='1'&&!get('SELECT 1 FROM users LIMIT 1')) seed(db);
  function enroll(owner:string,name:string,eventId:string){
    if(get('SELECT id FROM startups WHERE owner_id=? AND event_id=?',owner,eventId))return;
    const plan=defaultPlan();
    plan.title=name;
    run('INSERT INTO startups VALUES (?,?,?,?,?,?)',randomUUID(),eventId,owner,pack(plan),0,now());
  }
  const eventId=transaction(db,()=>{
    const existing=all('SELECT id,name FROM events');
    const chosen=existing.find(e=>e.name.trim().toLowerCase()==='emporia 5.0') ??
      (existing.length===1?existing[0]:existing.find(e=>e.id==='showcase'&&process.env.VC_DEMO==='1'));
    const id=chosen?.id??'emporia-5';
    if(chosen)run('UPDATE events SET name=? WHERE id=?','Emporia 5.0',id);
    else run('INSERT INTO events VALUES (?,?,?,?,?,?)',id,'Emporia 5.0','2099-12-31T18:29:00.000Z',0,pack(defaultRubric),null);
    for(const team of all("SELECT id,name FROM users WHERE role='team'"))enroll(team.id,team.name,id);
    if(process.env.VC_DEMO==='1'&&get("SELECT 1 FROM startups WHERE id='food' AND event_id=?",id)){
      run("INSERT OR IGNORE INTO revision_windows VALUES ('food',1)");
    }
    return id;
  });

  const snapshot=(id:string|null):Benchmark[]=>id?unpack(get('SELECT data FROM snapshots WHERE id=?',id)?.data??'[]'):[];
  const event=(id:string)=>get('SELECT * FROM events WHERE id=?',id)??fail(404,'Event does not exist.');
  const latest=(id:string)=>get('SELECT * FROM submissions WHERE startup_id=? ORDER BY version DESC LIMIT 1',id);
  const secure=(process.env.VC_SECURE_COOKIE==='1'||process.env.VERCEL==='1')?'; Secure':'';
  const sessionCookie=(token:string,max:number)=>'vc_session='+token+'; HttpOnly; SameSite=Strict; Path=/; Max-Age='+max+secure;
  const revisionOpen=(id:string)=>Boolean(get('SELECT 1 FROM revision_windows WHERE startup_id=? AND enabled=1',id));
  function decision(id:string){
    const row=get('SELECT d.marks,d.disqualified FROM startups s JOIN team_decisions d ON d.event_id=s.event_id AND d.team_id=s.owner_id WHERE s.id=?',id);
    return {marks:row?.marks??null,disqualified:Boolean(row?.disqualified)};
  }
  function startAccess(id:string,user:User){
    const startup=get('SELECT * FROM startups WHERE id=?',id)??fail(404,'Project does not exist.');
    const e=event(startup.event_id);
    const allowed=user.role==='organizer'||(user.role==='team'&&startup.owner_id===user.id)||(user.role==='judge'&&lock(e)&&get('SELECT 1 FROM assignments WHERE startup_id=? AND judge_id=?',id,user.id));
    requireRule(allowed,'Project is unavailable for this account.',404);
    return {startup,e};
  }
  function forecastPayload(sub:Row,scenario:Case='base',overrides:Record<string,number>={},calendar?:Plan['calendar']){
    requireRule(sub.engine===ENGINE,'This forecast engine version is unavailable.',409);
    const plan:Plan=unpack(sub.plan);
    const benchmarks=matches(plan,snapshot(sub.snapshot_id));
    const result=calculate(calendar?{...plan,calendar}:plan,scenario,overrides);
    return {plan,result,benchmarks,sensitivity:sensitivity(plan),questions:questions(plan,result,benchmarks.filter(b=>b.usage==='Comparison only')),backtest:backtest(plan)};
  }
  function editStartup(user:User,id:string,data:Row,action:string){
    const {startup,e}=startAccess(id,user);
    requireRule(user.role==='team'&&startup.owner_id===user.id);
    requireRule(!decision(id).disqualified,'This team is disqualified.',409);
    if(action==='submit'){
      const prior=latest(id);
      if(prior&&prior.draft_revision===data.revision) return {version:prior.version,id:prior.id};
    }
    requireRule(!lock(e)||revisionOpen(id),'Submissions are closed. Ask the event admin to open a revision for your team.',409);
    requireRule(data.revision===startup.revision,'The draft changed in another tab. Reload before saving.',409);
    if(action==='draft'){
      validatePlan(data.plan,true);
      const payload=pack(data.plan);
      if(payload===startup.draft) return {revision:startup.revision};
      run('UPDATE startups SET draft=?,revision=revision+1,updated=? WHERE id=?',payload,now(),id);
      return {revision:startup.revision+1};
    }
    if(action==='actuals'){
      validatePlan(data.plan,true);
      if(!validMonth(data.plan.launch)) fail(400,'Enter a launch month before importing actuals.');
      return actualPreview(data.csv,data.plan);
    }
    const plan=unpack(startup.draft) as Plan;
    validatePlan(plan);
    validateBenchmarkDrivers(plan,snapshot(e.snapshot_id));
    for(const scenario of ['base','downside','upside'] as const) calculate(plan,scenario);
    sensitivity(plan);
    const version=(latest(id)?.version??0)+1, submission=randomUUID();
    run('INSERT INTO submissions VALUES (?,?,?,?,?,?,?,?)',submission,id,version,startup.revision,ENGINE,e.snapshot_id,startup.draft,now());
    run('UPDATE revision_windows SET enabled=0 WHERE startup_id=?',id);
    return {version,id:submission};
  }
  function judgeWrite(user:User,sub:Row,e:Row,data:Row,action:string){
    requireRule(user.role==='judge'&&lock(e)&&sub.id===latest(sub.startup_id)?.id);
    requireRule(data.version===undefined||data.version===sub.version,'A new pitch version is available. Reload before reviewing it.',409);
    if(action==='review'){
      requireRule(!decision(sub.startup_id).disqualified,'This team is disqualified.',409);
      const rubric=unpack(e.rubric) as Rubric;
      const scores:Record<string,number>={};
      if(!data.scores||typeof data.scores!=='object'||Array.isArray(data.scores)||typeof data.notes!=='string'||data.notes.length>8000) fail(400,'Check the scores and notes.');
      for(const item of rubric){
        const value=data.scores[item.key];
        if(value===undefined||value===null) continue;
        if(!Number.isInteger(value)||value<0||value>5) fail(400,'Scores must be whole numbers from 0 to 5.');
        scores[item.key]=value;
      }
      run('INSERT INTO reviews VALUES (?,?,?,?,?) ON CONFLICT(submission_id,judge_id) DO UPDATE SET scores=excluded.scores,notes=excluded.notes,updated=excluded.updated',sub.id,user.id,pack(scores),data.notes,now());
      return {total:total(rubric,scores)};
    }
    const scenario=data.caseName as Case;
    requireRule(['base','downside','upside'].includes(scenario),'Choose a valid scenario.',400);
    const plan:Plan=unpack(sub.plan);
    if(!data.overrides||typeof data.overrides!=='object'||Array.isArray(data.overrides)) fail(400,'Enter valid scenario values.');
    const overrides:Record<string,number>={};
    for(const field of definitions(plan.model)){
      if(!Object.hasOwn(data.overrides,field.key)) continue;
      const value=data.overrides[field.key];
      plan.drivers[field.key].base=value; overrides[field.key]=value;
    }
    if(data.calendar!==undefined) plan.calendar=data.calendar;
    validatePlan(plan);
    const projection=forecastPayload(sub,scenario,overrides,data.calendar);
    if(action==='calculate') return projection;
    const name=line(data.name,'scenario name',80);
    run('INSERT INTO scenarios VALUES (?,?,?,?,?,?) ON CONFLICT(submission_id,judge_id,name) DO UPDATE SET case_name=excluded.case_name,overrides=excluded.overrides',randomUUID(),sub.id,user.id,name,scenario,pack({drivers:overrides,calendar:data.calendar}));
    return {name};
  }
  function compare(user:User,e:Row){
    requireRule(user.role==='organizer'||user.role==='judge');
    if(user.role==='judge') requireRule(lock(e)&&get('SELECT 1 FROM assignments a JOIN startups s ON s.id=a.startup_id WHERE s.event_id=? AND a.judge_id=?',e.id,user.id),'This event is unavailable.',404);
    const rubric=unpack(e.rubric) as Rubric;
    const rows=all('SELECT id FROM startups WHERE event_id=?',e.id).filter(s=>user.role==='organizer'||get('SELECT 1 FROM assignments WHERE startup_id=? AND judge_id=?',s.id,user.id)).flatMap(s=>{
      const sub=latest(s.id);
      if(!sub) return [];
      const plan:Plan=unpack(sub.plan);
      const result=forecastPayload(sub).result;
      const reviewRows=user.role==='judge'?all('SELECT scores FROM reviews WHERE submission_id=? AND judge_id=?',sub.id,user.id):all('SELECT scores FROM reviews WHERE submission_id=?',sub.id);
      const scores=reviewRows.map(r=>unpack(r.scores) as Record<string,number>);
      const complete=scores.map(score=>total(rubric,score)).filter((v):v is number=>v!==null);
      const dimensions=Object.fromEntries(rubric.map(r=>{
        const values=scores.map(score=>score[r.key]).filter(Number.isFinite);
        return [r.key,values.length?values.reduce((s,n)=>s+n,0)/values.length:null];
      }));
      const outcome=decision(s.id);
      const marks=user.role==='organizer'?outcome.marks:null;
      const cards=marks===null?complete:[...complete,marks];
      return [{marks,disqualified:outcome.disqualified,id:s.id,title:plan.title,industry:plan.industry,revenue:result.revenue,profit:result.profit,total:!outcome.disqualified&&cards.length?cards.reduce((s,n)=>s+n,0)/cards.length:null,complete:complete.length,dimensions}];
    }).sort((a,b)=>(b.total??-1)-(a.total??-1)||a.title.localeCompare(b.title));
    let last:number|null=null,rank=0;
    return {name:e.name,rubric,rows:rows.map((row,i)=>{
      if(row.total!==null&&row.total!==last){rank=i+1;last=row.total;}
      return {...row,rank:row.total===null?null:rank};
    })};
  }
  function createAccount(data:Row, role:string){
      const id=randomUUID(),email=line(data.email,'email').toLowerCase(),name=line(data.name,'name');
      requireRule(/^\S+@\S+\.\S+$/.test(email)&&['team','judge'].includes(role)&&typeof data.password==='string'&&data.password.length>=10&&data.password.length<=200,'Enter a team or judge role, email and password of at least 10 characters.',400);
      requireRule(!get('SELECT 1 FROM users WHERE email=?',email),'Email already exists.',409);
      run('INSERT INTO users VALUES (?,?,?,?,?)',id,name,email,password(data.password),role);
      if(role==='team')enroll(id,name,eventId);
      return {id};
  }
  function admin(data:Row){
    const action=data.action;
    if(action==='marks'||action==='eligibility'){
      requireRule(get('SELECT 1 FROM startups WHERE event_id=? AND owner_id=?',eventId,data.id),'Unknown event team.',404);
      if(action==='marks'){
        requireRule(data.marks===null||(Number.isInteger(data.marks)&&data.marks>=0&&data.marks<=100),'Enter whole marks from 0 to 100.',400);
        run('INSERT INTO team_decisions(event_id,team_id,marks) VALUES (?,?,?) ON CONFLICT(event_id,team_id) DO UPDATE SET marks=excluded.marks',eventId,data.id,data.marks);
      }else{
        requireRule(typeof data.disqualified==='boolean','Choose an eligibility status.',400);
        run('INSERT INTO team_decisions(event_id,team_id,disqualified) VALUES (?,?,?) ON CONFLICT(event_id,team_id) DO UPDATE SET disqualified=excluded.disqualified',eventId,data.id,Number(data.disqualified));
      }
      return {id:data.id};
    }
    if(action==='event'){
      requireRule(data.id===eventId,'Emporia 5.0 is the active event.',400);
      const e=event(eventId);
      requireRule(!lock(e),'A locked event cannot be edited.',409);
      run('UPDATE events SET deadline=?,rubric=? WHERE id=?',parseDate(data.deadline),pack(validRubric(data.rubric)),eventId);
      return {id:eventId};
    }
    if(action==='user') return createAccount(data,data.role);
    if(action==='revision-window'){
      requireRule(get('SELECT 1 FROM startups WHERE id=? AND event_id=?',data.id,eventId)&&typeof data.enabled==='boolean','Select an Emporia pitch and revision status.',400);
      run('INSERT INTO revision_windows VALUES (?,?) ON CONFLICT(startup_id) DO UPDATE SET enabled=excluded.enabled',data.id,Number(data.enabled));
      return {ok:true};
    }
    if(action==='account-status'){
      requireRule(get("SELECT 1 FROM users WHERE id=? AND role IN ('team','judge')",data.id)&&typeof data.disabled==='boolean','Select a team or judge account.',400);
      if(data.disabled){
        run('INSERT OR IGNORE INTO disabled_accounts VALUES (?)',data.id);
        run('DELETE FROM sessions WHERE user_id=?',data.id);
      }else run('DELETE FROM disabled_accounts WHERE user_id=?',data.id);
      return {ok:true};
    }
    if(action==='preview') return benchmarkPreview(data.csv);
    if(action==='import'){
      const parsed=benchmarkPreview(data.csv);
      if(parsed.errors.length) fail(400,parsed.errors.join(' '));
      const serialized=pack(parsed.rows);
      const existing=get('SELECT id FROM snapshots WHERE data=?',serialized);
      if(existing) return {id:existing.id};
      const id=randomUUID();
      run('INSERT INTO snapshots VALUES (?,?,?,?,NULL)',id,line(data.title,'snapshot name'),serialized,now());
      return {id};
    }
    if(action==='approve'){
      requireRule(get('SELECT 1 FROM snapshots WHERE id=?',data.id),'Snapshot does not exist.',404);
      run('UPDATE snapshots SET approved=COALESCE(approved,?) WHERE id=?',now(),data.id);
      return {id:data.id};
    }
    if(action==='assign'){
      const s=get('SELECT id FROM startups WHERE id=?',data.id);
      requireRule(s&&get("SELECT 1 FROM users WHERE id=? AND role='judge'",data.judge),'Select a valid team and judge.',400);
      if(data.remove) run('DELETE FROM assignments WHERE startup_id=? AND judge_id=?',data.id,data.judge);
      else run('INSERT OR IGNORE INTO assignments VALUES (?,?)',data.id,data.judge);
      return {ok:true};
    }
    const e=event(data.eventId);
    if(action==='reopen'){
      const deadline=parseDate(data.deadline);
      requireRule(Date.parse(deadline)>Date.now(),'Set a future submission deadline.',400);
      run('UPDATE events SET locked=0,deadline=? WHERE id=?',deadline,e.id);
      return {ok:true};
    }
    if(action==='lock'){
      run('UPDATE revision_windows SET enabled=0 WHERE startup_id IN (SELECT id FROM startups WHERE event_id=?)',e.id);
      run('UPDATE events SET locked=1 WHERE id=?',e.id);
      return {ok:true};
    }
    requireRule(!lock(e),'This event is locked.',409);
    if(action==='snapshot'){
      requireRule(get('SELECT 1 FROM snapshots WHERE id=? AND approved IS NOT NULL',data.id),'Approve the snapshot before using it.',400);
      run('UPDATE events SET snapshot_id=? WHERE id=?',data.id,e.id);
      return {ok:true};
    }
    fail(404,'Action does not exist.');
  }
  const handle=async(req:IncomingMessage,res:ServerResponse)=>{
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Content-Security-Policy',"default-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const method=req.method;
    const token=(req.headers.cookie??'').match(/(?:^|; )vc_session=([a-f0-9]{64})(?:;|$)/)?.[1];
    try{
      const url=new URL(req.url??'/','http://localhost');
      const path=url.pathname;
      if(method==='GET'&&files[path]){
        const [file,mime]=files[path];
        res.writeHead(200,{'Content-Type':mime+'; charset=utf-8'});
        res.end(readFileSync(new URL('../public/'+file,import.meta.url)));return;
      }
      if(method==='GET'&&path==='/api/demo'){json(res,{enabled:process.env.VC_DEMO==='1'});return;}
      if(method==='POST' && req.headers.origin){
        const trusted=process.env.VC_ORIGIN;
        requireRule(trusted?req.headers.origin===trusted:new URL(req.headers.origin).host===req.headers.host,'Invalid request origin.');
      }
      if(method==='POST'&&path==='/api/register'){
        const data=await body(req);
        requireRule(data.role===undefined||data.role==='team','Only admins can create judge accounts.',403);
        json(res,transaction(db,()=>createAccount(data,'team')),201);return;
      }
      if(method==='POST'&&path==='/api/login'){
        const data=await body(req);
        const email=line(data.email,'email').toLowerCase(),pass=data.password;
        if(typeof pass!=='string'||pass.length<1||pass.length>200) fail(400,'Enter a valid password.');
        const key=req.socket.remoteAddress??'local';
        const time=Date.now();
        run('DELETE FROM login_attempts WHERE until_ms<?',time);
        const state=get('SELECT count,until_ms FROM login_attempts WHERE address=?',key)??{count:0,until_ms:time+60000};
        requireRule(state.count<15,'Too many attempts. Try again in one minute.',429);
        const user=get('SELECT * FROM users WHERE email=?',email);
        const accepted=verify(pass,user?.hash??fakeHash)&&!(user&&get('SELECT 1 FROM disabled_accounts WHERE user_id=?',user.id));
        if(!user||!accepted){run('INSERT OR REPLACE INTO login_attempts VALUES (?,?,?)',key,state.count+1,state.until_ms); fail(401,'Email or password is incorrect.');}
        run('DELETE FROM login_attempts WHERE address=?',key);
        run('DELETE FROM sessions WHERE expires<?',time);
        if(token) run('DELETE FROM sessions WHERE token=?',digest(token));
        const newToken=randomBytes(32).toString('hex');
        run('INSERT INTO sessions VALUES (?,?,?)',digest(newToken),user.id,time+12*3600000);
        res.setHeader('Set-Cookie',sessionCookie(newToken,12*3600));json(res,{ok:true});return;
      }
      if(method==='POST'&&path==='/api/logout'){
        if(token) run('DELETE FROM sessions WHERE token=?',digest(token));
        res.setHeader('Set-Cookie',sessionCookie('',0));json(res,{ok:true});return;
      }
      const user=token?get('SELECT u.id,u.name,u.email,u.role FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.expires>?',digest(token),Date.now()) as User|undefined:undefined;
      if(!user) fail(401,'Sign in to continue.');
      if(method==='GET'&&path==='/api/schema'){
        json(res,{industries,stages,models,plans:Object.fromEntries(Object.keys(models).map(model=>[model,defaultPlan(model as keyof typeof models)])),fields:Object.fromEntries(Object.keys(models).map(model=>[model,definitions(model as keyof typeof models)]))});return;
      }
      if(method==='GET'&&path==='/api/home'){
        const events=all('SELECT * FROM events WHERE id=?',eventId).map(e=>{
          const startups=all('SELECT id,draft,owner_id FROM startups WHERE event_id=?',e.id).filter(s=>user.role==='organizer'||(user.role==='team'&&s.owner_id===user.id)||(user.role==='judge'&&get('SELECT 1 FROM assignments WHERE startup_id=? AND judge_id=?',s.id,user.id))).map(s=>{
            const sub=latest(s.id);
            const dq=decision(s.id).disqualified;
            if(user.role==='judge'&&(!lock(e)||!sub)){
              return {id:s.id,title:get('SELECT name FROM users WHERE id=?',s.owner_id)?.name,pending:dq?'Disqualified':sub?'Submitted · waiting for event lock':'Waiting for team submission'};
            }
            const p=unpack(user.role==='judge'?sub!.plan:s.draft);
            return {id:s.id,disqualified:dq,editable:!dq&&(!lock(e)||revisionOpen(s.id)),title:p.title||'Untitled pitch',industry:p.industry,model:p.model,stage:p.stage,version:sub?.version??null};
          });
          return {id:e.id,name:e.name,deadline:e.deadline,locked:lock(e),startups};
        }).filter(e=>user.role==='organizer'||e.startups.length);
        json(res,{user,events});return;
      }
      if(path==='/api/admin'){
        requireRule(user.role==='organizer');
        if(method==='POST'){const data=await body(req);if(data.action==='reset'){json(res,resetEvent(db,eventId,user.id,data));return;}json(res,transaction(db,()=>{const result=admin(data);if(data.action!=='preview')run('INSERT INTO admin_activity(actor,action,subject,created) VALUES (?,?,?,?)',user.id,data.action,String(data.id??data.eventId??result.id??''),now());return result;}));return;}
        if(method==='GET'){
          json(res,{singleEvent:!get('SELECT 1 FROM events WHERE id<>?',eventId),resetToken:randomUUID(),events:all('SELECT * FROM events WHERE id=?',eventId).map(e=>({...e,locked:lock(e),rubric:unpack(e.rubric)})),users:all('SELECT id,name,email,role,EXISTS(SELECT 1 FROM disabled_accounts x WHERE x.user_id=users.id) AS disabled FROM users ORDER BY name'),
            activity:all('SELECT u.name,a.action,a.subject,a.created FROM admin_activity a JOIN users u ON u.id=a.actor ORDER BY a.id DESC LIMIT 40'),
            snapshots:all('SELECT * FROM snapshots ORDER BY created DESC').map(s=>({...s,data:unpack(s.data)})),
            startups:all('SELECT * FROM startups WHERE event_id=?',eventId).map(s=>({...decision(s.id),id:s.id,event:s.event_id,owner:s.owner_id,revisionOpen:revisionOpen(s.id),updated:s.updated,revision:s.revision,version:latest(s.id)?.version??null,submittedRevision:latest(s.id)?.draft_revision??null,title:unpack(s.draft).title,judges:all('SELECT judge_id FROM assignments WHERE startup_id=?',s.id).map(a=>a.judge_id)}))});return;
        }
      }
      if(method==='GET'&&path==='/api/evidence'){
        const approved=all('SELECT id,title,data FROM snapshots WHERE approved IS NOT NULL ORDER BY approved DESC').map(s=>({id:s.id,title:s.title,rows:unpack(s.data)}));
        json(res,approved);return;
      }
      const comparison=path.match(/^\/api\/events\/([\w-]+)\/compare$/);
      if(method==='GET'&&comparison){json(res,compare(user,event(comparison[1])));return;}
      const route=path.match(/^\/api\/project\/([\w-]+)(?:\/(draft|submit|actuals|preview|calculate|scenario|review|csv))?$/);
      if(route){
        const [,id,action]=route;
        if(method==='POST'&&['draft','submit','actuals'].includes(action)){
          const data=await body(req);
          json(res,transaction(db,()=>editStartup(user,id,data,action)));return;
        }
        const {startup,e}=startAccess(id,user);
        if(method==='POST'&&action==='preview'){
          requireRule(user.role==='organizer'||user.role==='team');
          const data=await body(req);
          const plan=data.plan??unpack(startup.draft);
          validatePlan(plan);
          const cases=Object.fromEntries((['downside','base','upside'] as const).map(c=>[c,calculate(plan,c)]));
          json(res,{cases,questions:questions(plan,cases.base),sensitivity:sensitivity(plan)});return;
        }
        const version=url.searchParams.get('version');
        const canReadHistory=user.role!=='judge';
        if(version)requireRule(canReadHistory&&method==='GET'&&/^\d{1,9}$/.test(version),'Submission version is unavailable.',404);
        const sub=version?get('SELECT * FROM submissions WHERE startup_id=? AND version=?',id,Number(version)):latest(id);
        if(version&&!sub)fail(404,'Submission version does not exist.');
        if(method==='GET'&&!action){
          if(user.role==='judge'&&!sub) fail(404,'This team has not submitted.');
          const review=sub?get('SELECT scores,notes FROM reviews WHERE submission_id=? AND judge_id=?',sub.id,user.id):null;
          const scenarios=sub?all('SELECT name,case_name,overrides FROM scenarios WHERE submission_id=? AND judge_id=? ORDER BY name',sub.id,user.id).map(s=>({name:s.name,caseName:s.case_name,...unpack(s.overrides)})):[];
          json(res,{id,event:e.name,eventId:e.id,locked:lock(e),disqualified:decision(id).disqualified,editable:!decision(id).disqualified&&(!lock(e)||revisionOpen(id)),rubric:unpack(e.rubric),revision:startup.revision,
            history:canReadHistory?all('SELECT version,created FROM submissions WHERE startup_id=? ORDER BY version DESC',id):[],
            draft:user.role==='judge'?null:unpack(startup.draft),version:sub?.version??null,submitted:sub?.created??null,engine:sub?.engine??null,
            snapshotTitle:sub?.snapshot_id?get('SELECT title FROM snapshots WHERE id=?',sub.snapshot_id)?.title:null,
            eligible:user.role==='team'?matches(unpack(startup.draft),snapshot(e.snapshot_id)).filter(b=>b.eligible):[],
            forecast:sub?forecastPayload(sub):null,review:review?{scores:unpack(review.scores),notes:review.notes}:null,scenarios});return;
        }
        if(!sub) fail(404,'This team has not submitted.');
        if(method==='GET'&&action==='csv'){
          const m=forecastPayload(sub).result.months;
          res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="venturecheck-monthly.csv"'});
          const cashFields=['revenue','cost','gross','expenses','profit','receipts','payment','funding','capex','cash'] as const;
          res.end('month,volume,mom_growth_pct,'+cashFields.map(k=>k+'_inr').join(',')+',gross_margin_pct,operating_margin_pct\r\n'+m.map(r=>[r.month,r.volume,r.growth?.toFixed(2)??'',...cashFields.map(k=>(r[k]/100).toFixed(2)),r.grossMargin?.toFixed(2)??'',r.operatingMargin?.toFixed(2)??''].join(',')).join('\r\n'));return;
        }
        if(method==='POST'&&['scenario','calculate','review'].includes(action)){
          const data=await body(req);
          json(res,transaction(db,()=>{
            const {e:current}=startAccess(id,user);
            return judgeWrite(user,sub,current,data,action);
          }));return;
        }
      }
      fail(404,'Page does not exist.');
    }catch(error){
      if(res.headersSent){res.end();return;}
      if(!(error instanceof HttpError)&&error instanceof Error&&/SQLITE|ERR_SQLITE/.test(String((error as any).code))){
        console.error(error.message);json(res,{error:'Database operation failed.'},500);return;
      }
      json(res,{error:(error as Error).message??'Request failed.'},error instanceof HttpError?error.status:400);
    }
  };
  const server=createServer(handle);
  server.on('close',()=>db.close());
  return {server,db,handle};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
  const {server}=application();
  const host=process.env.HOST||'127.0.0.1', port=Number(process.env.PORT||3000);
  server.on('error',error=>{console.error('Could not start VentureCheck:',error.message);if((error as NodeJS.ErrnoException).code==='EADDRINUSE') console.error('Stop the earlier server with Ctrl+C or choose another PORT.');process.exitCode=1;});
  server.listen(port,host,()=>{
    console.log('Laptop: http://localhost:'+port);
    if(host==='0.0.0.0'){
      for(const [name,addresses] of Object.entries(networkInterfaces())){
        for(const ip of addresses??[])if(ip.family==='IPv4'&&!ip.internal)console.log('Participant URL ('+name+'): http://'+ip.address+':'+port);
      }
    }
  });
}
