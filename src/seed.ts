import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { DatabaseSync } from 'node:sqlite';
import { now,open,pack,password,transaction } from './db.ts';
import { defaultPlan } from './model.ts';
import { ENGINE } from './model.ts';
import { benchmarkPreview } from './evidence.ts';
export const rubric=[
  {key:'customers',label:'Customer evidence',weight:25},{key:'economics',label:'Unit economics',weight:25},
  {key:'growth',label:'Feasibility of growth assumptions',weight:20},{key:'execution',label:'Execution plan',weight:20},
  {key:'risks',label:'Understanding of risks',weight:10}
];
export function examples(){
  const food=defaultPlan();
  Object.assign(food,{title:'Campus Kitchen',industry:'Food & beverage',stage:'Pilot',geography:'Delhi, India',target:1200000});
  Object.assign(food.drivers.demand,{downside:20,upside:50,kind:'actual',source:'Pilot order tally · 10 selling days',period:'October 2026'});
  Object.assign(food.drivers.capacity,{downside:35,upside:50,source:'Kitchen capacity worksheet'});
  Object.assign(food.drivers.price,{downside:90,upside:110,kind:'actual',source:'Pilot price list',period:'October 2026'});
  Object.assign(food.drivers.materials,{downside:42,upside:30,source:'Supplier quote reference'});
  food.calendar.forEach(row=>row.stock=1000);
  food.evidence=[{label:'Pilot order tally',detail:'Illustrative demo evidence: 280 orders over 10 selling days at the campus pop-up.',period:'October 2026'},{label:'Kitchen capacity worksheet',detail:'Illustrative demo evidence: one current production line can prepare 40 orders per day.',period:'Forecast horizon'}];
  const sub=defaultPlan('subscription');
  Object.assign(sub,{title:'StudyCircle',industry:'Education',stage:'Pilot',geography:'Bengaluru, India',target:900000});
  Object.assign(sub.drivers.churn,{downside:15,upside:4});
  Object.assign(sub.drivers.conversion,{downside:8,upside:18});
  sub.actuals=[{month:'2026-07',revenue:12000},{month:'2026-08',revenue:13500},{month:'2026-09',revenue:14900},{month:'2026-10',revenue:16100},{month:'2026-11',revenue:18900},{month:'2026-12',revenue:20400}];
  const studio=defaultPlan('service');
  Object.assign(studio,{title:'Pixel Studio',industry:'Professional services',geography:'Pune, India',stage:'Trading',target:1450000});
  Object.assign(studio.drivers.delay,{base:2,downside:3,upside:1});
  Object.assign(studio.drivers.demand,{downside:105,upside:180});
  Object.assign(studio.drivers.utilization,{downside:45,upside:75});
  return {food,sub,studio};
}
export function seed(db:DatabaseSync){
  const results=benchmarkPreview(readFileSync(new URL('../data/benchmarks.csv',import.meta.url),'utf8'));
  if(results.errors.length) throw new Error(results.errors.join('\n'));
  transaction(db,()=>{
    const user=db.prepare('INSERT OR IGNORE INTO users VALUES (?,?,?,?,?)');
    const hash=password('venture-demo');
    for(const [id,name,role] of [['admin','Aarav Mehta','organizer'],['judge','Riya Shah','judge'],['judge2','Dev Kapoor','judge'],['team','Campus Kitchen Team','team'],['team2','StudyCircle Team','team'],['team3','Pixel Studio Team','team']]){
      user.run(id,name,id+'@venture.local',hash,role);
    }
    db.prepare('INSERT OR IGNORE INTO snapshots VALUES (?,?,?,?,?)').run('india-context','India enterprise context',pack(results.rows),now(),now());
    db.prepare('INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?)').run('showcase','Campus Startup Showcase','2099-12-31T18:00:00.000Z',1,pack(rubric),'india-context');
    db.prepare('INSERT OR IGNORE INTO events VALUES (?,?,?,?,?,?)').run('practice','Pitch Practice','2099-12-31T18:00:00.000Z',0,pack(rubric),'india-context');
    const startup=db.prepare('INSERT OR IGNORE INTO startups VALUES (?,?,?,?,?,?)');
    const submission=db.prepare('INSERT OR IGNORE INTO submissions VALUES (?,?,?,?,?,?,?,?)');
    const assignment=db.prepare('INSERT OR IGNORE INTO assignments VALUES (?,?)');
    const {food,sub,studio}=examples();
    for(const [id,event,owner,plan] of [['food','showcase','team',food],['study','showcase','team2',sub],['studio','showcase','team3',studio],['practice-food','practice','team',food]] as const){
      startup.run(id,event,owner,pack(plan),0,now());
      if(event==='showcase') submission.run(id+'-v1',id,1,0,ENGINE,'india-context',pack(plan),now());
      for(const judge of ['judge','judge2']) assignment.run(id,judge);
    }
  });
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){
  const db=open(); seed(db); db.close();
  console.log('Demo events and six demo accounts are ready.');
}
