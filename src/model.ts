export const ENGINE = 'vc-1';
export const industries = ['Food & beverage', 'Manufacturing', 'Retail', 'Software', 'Education', 'Professional services', 'Other'];
export const stages = ['Idea', 'Pilot', 'Trading'];
export const models = { product: 'Physical product', subscription: 'Subscription', service: 'Services' };
export type Model = keyof typeof models;
export type Case = 'downside' | 'base' | 'upside';
export type Driver = { downside:number; base:number; upside:number; kind:string; source:string; period:string };
export type Actual = { month:string; revenue:number };
export type Plan = {
  title:string; industry:string; model:Model; geography:string; stage:string; launch:string; target:number;
  drivers:Record<string,Driver>; calendar:{ days:number; season:number; stock:number; capacity:number; hires:number; funding:number; capex:number }[];
  actuals:Actual[]; evidence:{ label:string; detail:string; period:string }[];
};
type Field = { key:string; label:string; unit:string; initial:number; max:number; money?:boolean; rate?:boolean; sensitivity?:boolean };
const amount = (key:string,label:string,unit:string,initial:number,sensitivity=false):Field =>
  ({key,label,unit,initial,money:true,max:100_000_000,sensitivity});
const count = (key:string,label:string,unit:string,initial:number,max:number,sensitivity=false):Field =>
  ({key,label,unit,initial,max,sensitivity});
const rate = (key:string,label:string,initial:number,sensitivity=false):Field =>
  ({key,label,unit:'%',initial,max:100,rate:true,sensitivity});
const common = [
  amount('openingCash','Opening cash','₹',65000), amount('fixed','Other operating expenses','₹ / month',12000,true),
  count('delay','Collection delay','months',0,12)
];
const fields:Record<Model,Field[]> = {
  product: [
    amount('price','Selling price before refunds','₹ / order',100,true), count('demand','Daily demand','orders / day',28,100000,true),
    count('capacity','Daily production capacity','orders / day',40,100000,true),
    amount('materials','Material cost','₹ / input unit',34,true), amount('packaging','Packaging cost','₹ / shipped order',6),
    rate('waste','Material waste',0,true), rate('returns','Fully refunded orders',0,true)
  ],
  subscription: [
    amount('price','Subscription price','₹ / subscriber / month',499,true), count('initial','Opening subscribers','subscribers',40,100000),
    count('leads','Monthly leads','leads / month',175,100000,true),rate('conversion','Paid conversion',12,true),
    rate('churn','Monthly churn',8,true), amount('hosting','Variable hosting','₹ / billed subscriber',48,true),
    amount('acquisition','Acquisition cost','₹ / new subscriber',250,true), amount('payroll','Payroll','₹ / month',20000,true)
  ],
  service: [
    amount('price','Hourly rate','₹ / hour',850,true), count('demand','Monthly demand','hours / month',130,100000,true),
    count('staff','Opening headcount','staff',2,100,true), count('hours','Hours per worker per day','hours / worker / day',8,24),
    rate('utilization','Billable utilization',60,true), amount('wage','Wage per worker','₹ / worker / month',22000,true)
  ]
};
export function definitions(model:Model) { return [...fields[model], ...common]; }
export function defaultPlan(model:Model='product'):Plan {
  return {
    title:'', industry:industries[0], model, geography:'India', stage:'Idea', launch:'2027-01', target:0,
    drivers:Object.fromEntries(definitions(model).map(f=>[f.key,{base:f.initial,downside:f.initial,upside:f.initial,kind:'estimate',source:'Team estimate',period:'Forecast horizon'}])),
    calendar:Array.from({length:12},()=>({days:20,season:100,stock:1800,capacity:0,hires:0,funding:0,capex:0})),
    actuals:[], evidence:[]
  };
}
export function rounded(value:number) { return Math.round((value + Number.EPSILON)*100); }
export function monthAt(start:string, index:number) {
  const [year,month]=start.split('-').map(Number);
  return new Date(Date.UTC(year,month-1+index,1)).toISOString().slice(0,7);
}
export function validMonth(value:unknown):value is string {return typeof value==='string' && /^20\d\d-(0[1-9]|1[0-2])$/.test(value);}
export function rupees(paise:number) {return new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2,minimumFractionDigits:0}).format(paise/100);}
export function percent(value:number|null) {return value===null?'—':value.toFixed(1)+'%';}
export function validatePlan(plan:Plan,draft=false) {
  if (!plan || !Object.hasOwn(models,plan.model) || !industries.includes(plan.industry) || !stages.includes(plan.stage) || !(validMonth(plan.launch)||(draft&&plan.launch===''))) throw new Error('Choose a valid industry, model, stage and launch month.');
  const validText=(v:unknown,max=500)=>typeof v==='string' && (draft||v.trim().length>0) && v.length<=max;
  const number=(v:unknown,max:number,min=0,decimals=false)=>(draft&&v===null)||(typeof v==='number' && Number.isFinite(v) && v>=min && v<=max && (decimals ? Math.abs(v*100-Math.round(v*100))<0.00001 : Number.isInteger(v)));
  if (!validText(plan.title,100) || !validText(plan.geography,100) || !number(plan.target,100_000_000,0,true)) throw new Error('Enter a project name, geography and valid INR sales target.');
  for (const f of definitions(plan.model)) {
    const d=plan.drivers?.[f.key];
    if (!d || ![d.base,d.downside,d.upside].every(v=>number(v,f.max,0,f.money||f.rate)) || !['actual','estimate','benchmark'].includes(d.kind) || !validText(d.source) || !validText(d.period,100)) throw new Error('Check all values and the evidence for '+f.label+'.');
  }
  if (!Array.isArray(plan.calendar) || plan.calendar.length!==12) throw new Error('Enter 12 monthly operating rows.');
  plan.calendar.forEach((row,i)=>{
    const month=validMonth(plan.launch)?monthAt(plan.launch,i):'launch month + '+i;
    const next=validMonth(plan.launch)?monthAt(plan.launch,i+1):'';
    const days=draft?31:(Date.parse(next+'-01')-Date.parse(month+'-01'))/86400000;
    if (!row || !number(row.days,days) || !number(row.season,300,0,true) || !number(row.stock,10_000_000) || !number(row.capacity,100000,-100000) || !number(row.hires,100,-100) || !number(row.funding,100_000_000,0,true) || !number(row.capex,100_000_000,0,true)) throw new Error('Check calendar values for '+month+'.');
  });
  if (!Array.isArray(plan.actuals) || plan.actuals.length>120 || (!draft&&new Set(plan.actuals.map(a=>a?.month)).size!==plan.actuals.length) ||
      plan.actuals.some(a=>!a||!(validMonth(a.month)||(draft&&a.month===''))||(!draft&&a.month>=plan.launch)||!number(a.revenue,100_000_000,0,true))) throw new Error('Actuals need unique months before launch and valid non-negative INR revenue.');
  if (!Array.isArray(plan.evidence) || plan.evidence.length>60 || plan.evidence.some(e=>!validText(e?.label,100)||!validText(e.detail,1000)||!validText(e.period,100))) throw new Error('Check the evidence labels, details and periods.');
}
