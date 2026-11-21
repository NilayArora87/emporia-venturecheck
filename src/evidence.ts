import { definitions, industries, stages, validMonth } from './model.ts';
import type { Plan, Actual } from './model.ts';
export const benchmarkColumns=['key','industry','geography','stage','metric','definition','unit','statistic','value','publisher','url','table','period','population','retrieved','limitations','sample'];
export type Benchmark = { [K in 'key'|'industry'|'geography'|'stage'|'metric'|'definition'|'unit'|'statistic'|'publisher'|'url'|'table'|'period'|'population'|'retrieved'|'limitations']:string } & {value:number;sample:number|null};
function parseCsv(csv:string){
  if(typeof csv!=='string'||csv.length>150000) throw new Error('CSV must be text under 150 KB.');
  const rows:string[][]=[];
  let row:string[]=[], cell='', quoted=false, closed=false;
  for(let i=0;i<csv.length;i++){
    const char=csv[i];
    if(quoted){
      if(char==='"' && csv[i+1]==='"'){cell+='"';i++;}
      else if(char==='"'){quoted=false;closed=true;}
      else cell+=char;
    } else if(char===',' || char==='\n' || char==='\r'){
      row.push(cell.trim()); cell=''; closed=false;
      if(char!==','){
        rows.push(row); row=[];
        if(char==='\r'&&csv[i+1]==='\n') i++;
      }
    } else if(char==='"' && !cell && !closed){quoted=true;}
    else {
      if(closed || char==='"') throw new Error('Invalid quote in CSV record '+(rows.length+1)+'.');
      cell+=char;
    }
  }
  if(quoted) throw new Error('Unclosed quote in CSV record '+(rows.length+1)+'.');
  if(cell || row.length){row.push(cell.trim());rows.push(row);}
  return rows;
}
function preview<T>(csv:string, columns:string[], decode:(fields:Record<string,string>)=>T, unique:(row:T)=>string){
  const [header,...records]=parseCsv(csv.replace(/^\ufeff/,''));
  if(!header || header.join(',')!==columns.join(',')) throw new Error('Expected columns '+columns.join(', ')+'.');
  const errors:string[]=[], rows:T[]=[], keys=new Set<string>();
  records.forEach((row,index)=>{
    if(row.every(cell=>!cell)) return;
    try{
      if(row.length!==header.length) throw new Error('Wrong number of columns.');
      const entry=decode(Object.fromEntries(header.map((name,i)=>[name,row[i]])));
      const key=unique(entry);
      if(keys.has(key)) throw new Error('Duplicate '+key+'.');
      keys.add(key); rows.push(entry);
    }catch(error){errors.push('Record '+(index+2)+': '+(error as Error).message);}
  });
  if(!rows.length&&!errors.length) errors.push('The CSV has no records.');
  return {rows,errors};
}
export function actualPreview(csv:string, plan:Plan){
  return preview<Actual>(csv,['month','revenue_inr'],r=>{
    if(!validMonth(r.month) || r.month>=plan.launch) throw new Error('Use YYYY-MM before the launch month.');
    if(!/^\d{1,9}(\.\d{1,2})?$/.test(r.revenue_inr) || Number(r.revenue_inr)>100_000_000) throw new Error('Enter non-negative INR without symbols or separators.');
    const old=plan.actuals.find(a=>a.month===r.month);
    if(old && old.revenue!==null && old.revenue!==Number(r.revenue_inr)) throw new Error('Month already exists with a different value. Edit or remove it first.');
    return {month:r.month,revenue:Number(r.revenue_inr)};
  },r=>r.month);
}
export function benchmarkPreview(csv:string){
  const units=new Set(['INR / establishment / year','count','percent',...(['product','subscription','service'] as const).flatMap(m=>definitions(m).map(f=>f.unit))]);
  return preview<Benchmark>(csv,benchmarkColumns,r=>{
    const populated=benchmarkColumns.filter(k=>k!=='sample').every(k=>r[k] && r[k].length<=1000);
    if(!populated || !/^[a-z0-9-]{2,70}$/.test(r.key) || !(r.industry==='All'||industries.includes(r.industry)) ||
      !(r.stage==='All'||stages.includes(r.stage)) || !units.has(r.unit) || !/^https?:\/\//.test(r.url) ||
      !/^20\d\d-\d\d-\d\d$/.test(r.retrieved) || !Number.isFinite(Date.parse(r.retrieved)) ||
      !/^-?\d{1,12}(\.\d{1,4})?$/.test(r.value) || (r.sample&&!/^[1-9]\d{0,8}$/.test(r.sample)) ||
      (['gross_margin','operating_margin'].includes(r.metric)&&r.unit!=='percent')) throw new Error('Check publisher, source URL, period, metric, units and sample size.');
    return {...r,value:Number(r.value),sample:r.sample?Number(r.sample):null} as Benchmark;
  },r=>r.key);
}
export function matches(plan:Plan, rows:Benchmark[]){
  return rows.filter(b=>b.industry===plan.industry||b.industry==='All').map(b=>{
    const geography=b.geography.toLowerCase()===plan.geography.toLowerCase();
    const localIndia=b.geography==='India' && /india/i.test(plan.geography);
    const stage=b.stage===plan.stage;
    const compatible=b.unit==='percent'&&['gross_margin','operating_margin'].includes(b.metric);
    const driver=definitions(plan.model).find(f=>b.metric===plan.model+'.'+f.key && b.unit===f.unit);
    const eligible=Boolean(driver && b.industry===plan.industry && (geography||localIndia) && stage);
    return {...b,eligible,usage:eligible?'Eligible model input':compatible?'Comparison only':'Context only',
      reason:[b.industry===plan.industry?'Industry match':'All-industry statistic',geography?'Geography match':localIndia?'India-wide, local geography differs':'Different geography',stage?'Stage match':b.stage==='All'?'Stage unspecified':'Different stage'].join(' · ')};
  }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||Number(b.industry===plan.industry)-Number(a.industry===plan.industry));
}
export function validateBenchmarkDrivers(plan:Plan, rows:Benchmark[]){
  const available=matches(plan,rows);
  for(const field of definitions(plan.model)){
    const d=plan.drivers[field.key];
    if(d.kind!=='benchmark') continue;
    const match=available.find(b=>b.eligible&&b.key===d.source&&b.metric===plan.model+'.'+field.key&&b.value===d.base&&b.period===d.period);
    if(!match) throw new Error('Benchmark-backed '+field.label+' needs a compatible approved key, source period and exact base value.');
  }
}
