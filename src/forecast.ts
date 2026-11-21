import { definitions, monthAt, rounded, rupees } from './model.ts';
import type { Case, Plan } from './model.ts';

export function calculate(plan:Plan, scenario:Case='base', overrides:Record<string,number>={}) {
  const input=Object.fromEntries(definitions(plan.model).map(f=>{
    const value=overrides[f.key] ?? plan.drivers[f.key][scenario];
    return [f.key,f.money || f.rate ? rounded(value) : value];
  }));
  const rate=(quantity:number,bps:number)=>Math.round(quantity*bps/10000);
  let cash=input.openingCash, inventory=0, customers=input.initial??0, staff=input.staff??0, dailyCapacity=input.capacity??0;
  const receipts=Array<number>(24).fill(0);
  const moneyLimit=Number.MAX_SAFE_INTEGER/48;
  const checkMoney=(...values:number[])=>{
    if(values.some(v=>!Number.isSafeInteger(v)||Math.abs(v)>moneyLimit)) throw new Error('Combined volume and price or cost exceed the forecast’s supported monetary range.');
  };
  let previous=plan.actuals.find(a=>a.month===monthAt(plan.launch,-1))?.revenue;
  if(previous!==undefined) previous=rounded(previous);
  const months=plan.calendar.map((row,i)=>{
    const month=monthAt(plan.launch,i);
    const season=rounded(row.season);
    let volume=0,revenue=0,cost=0,expenses=input.fixed,directCash=0,ceiling:number|null=null,capacity=0,demand=0;
    let opening=0,additions=0,cancellations=0,refunded=0,consumed=0;
    if(plan.model==='product'){
      dailyCapacity=Math.max(0,dailyCapacity+row.capacity);
      inventory+=row.stock;
      demand=rate(input.demand*row.days,season);
      capacity=dailyCapacity*row.days;
      const available=Math.floor(inventory*(10000-input.waste)/10000);
      volume=Math.min(demand,capacity,available);
      consumed=input.waste===10000?0:Math.ceil(volume*10000/(10000-input.waste));
      inventory-=consumed;
      refunded=rate(volume,input.returns);
      revenue=(volume-refunded)*input.price;
      ceiling=(capacity-rate(capacity,input.returns))*input.price;
      cost=consumed*input.materials+volume*input.packaging;
      directCash=row.stock*input.materials+volume*input.packaging;
    } else if(plan.model==='subscription'){
      opening=customers;
      additions=rate(rate(input.leads,season),input.conversion);
      cancellations=Math.min(opening,rate(opening,input.churn));
      customers=opening+additions-cancellations;
      volume=customers;
      revenue=customers*input.price;
      cost=directCash=customers*input.hosting;
      expenses+=input.payroll+additions*input.acquisition;
    } else {
      staff=Math.max(0,staff+row.hires);
      capacity=rate(staff*input.hours*row.days,input.utilization);
      demand=rate(input.demand,season);
      volume=Math.min(demand,capacity);
      revenue=volume*input.price;
      cost=directCash=staff*input.wage;
      ceiling=capacity*input.price;
    }
    receipts[i+input.delay]+=revenue;
    const funding=rounded(row.funding),capex=rounded(row.capex),payment=directCash+expenses+capex;
    checkMoney(revenue,cost,expenses,payment,funding,ceiling??0);
    cash+=receipts[i]+funding-payment;
    checkMoney(cash);
    const gross=revenue-cost,profit=gross-expenses;
    const growth=previous===undefined||previous===0?null:(revenue-previous)/previous*100;
    const growthReason=previous===0?'No prior revenue':previous===undefined?'No prior month recorded':'';
    previous=revenue;
    return {month,volume,revenue,cost,expenses,gross,profit,grossMargin:revenue?gross/revenue*100:null,operatingMargin:revenue?profit/revenue*100:null,growth,growthReason,receipts:receipts[i],payment,cash,funding,capex,ceiling,capacity,demand,inventory,consumed,refunded,opening,additions,cancellations,closing:customers,recurring:plan.model==='subscription'?revenue:null};
  });
  const sum=(key:'revenue'|'gross'|'profit'|'volume')=>months.reduce((n,m)=>n+m[key],0);
  const revenue=sum('revenue'),gross=sum('gross'),profit=sum('profit');
  const last=months.at(-1)!;
  const totalDays=plan.calendar.reduce((n,m)=>n+m.days,0);
  const target=rounded(plan.target);
  const realized=plan.model==='product'?rate(input.price,10000-input.returns):input.price;
  const divisor=plan.model==='product'?totalDays:plan.model==='subscription'?12:1;
  const required=target===0?0:realized&&divisor?Math.ceil(target/(realized*divisor)):null;
  const priorYear=Array.from({length:12},(_,i)=>plan.actuals.find(a=>a.month===monthAt(plan.launch,i-12)));
  const priorRevenue=priorYear.every(Boolean)?priorYear.reduce((n,a)=>n+rounded(a!.revenue),0):null;
  return {
    months,revenue,gross,profit,volume:sum('volume'),closingCash:last.cash,target,required,
    annualGrowth:priorRevenue?(revenue-priorRevenue)/priorRevenue*100:null,annualGrowthReason:priorRevenue===0?'No prior revenue':'12 comparable prior months required',
    grossMargin:revenue?gross/revenue*100:null,operatingMargin:revenue?profit/revenue*100:null,
    breakEven:months.find(m=>m.profit>=0 && m.revenue>0)?.month??null,shortfall:months.find(m=>m.cash<0)?.month??null,
    ceiling:plan.model==='subscription'?null:months.reduce((n,m)=>n+(m.ceiling??0),0),
    capacity:months.reduce((n,m)=>n+m.capacity,0),totalDays,
    receivables:receipts.slice(12).reduce((n,value)=>n+value,0)
  };
}
export function sensitivity(plan:Plan){
  return definitions(plan.model).filter(f=>f.sensitivity).map(f=>{
    const d=plan.drivers[f.key];
    return { key:f.key,label:f.label,unit:f.unit,from:d.downside,to:d.upside,
      fromProfit:calculate(plan,'base',{[f.key]:d.downside}).profit,toProfit:calculate(plan,'base',{[f.key]:d.upside}).profit };
  }).map(row=>({...row,spread:Math.abs(row.fromProfit-row.toProfit)})).sort((a,b)=>b.spread-a.spread);
}
export function backtest(plan:Plan){
  const actuals=[...plan.actuals].sort((a,b)=>a.month.localeCompare(b.month));
  if(actuals.length<6 || actuals.some((a,i)=>i>0 && a.month!==monthAt(actuals[i-1].month,1))) return null;
  const training=actuals.slice(0,-2), held=actuals.slice(-2);
  const prediction=training.slice(-3).reduce((n,a)=>n+rounded(a.revenue),0)/3;
  const baseline=rounded(training.at(-1)!.revenue);
  const error=(guess:number)=>Math.round(held.reduce((n,a)=>n+Math.abs(rounded(a.revenue)-guess),0)/held.length);
  return {cutoff:training.at(-1)!.month,months:held.map(a=>a.month),mae:error(prediction),baselineMae:error(baseline)};
}
export function questions(plan:Plan,result=calculate(plan),benchmarks:{unit:string;metric:string;value:number}[]=[]){
  const questions:string[]=[];
  if(result.ceiling!==null && result.target>result.ceiling && result.required!==null){
    const unit=plan.model==='product'?'orders per selling day':'billable hours across the year';
    const observed=plan.model==='product' && plan.drivers.demand.kind==='actual'?' The submitted pilot averaged '+plan.drivers.demand.base+' orders per day.':'';
    questions.push('The target needs '+result.required.toLocaleString('en-IN')+' '+unit+'. Current capacity supports '+rupees(result.ceiling)+'.'+observed+' When can the team add capacity, and what will it cost?');
  } else if(result.revenue<result.target){
    questions.push('The forecast falls '+rupees(result.target-result.revenue)+' below the pitch target. What evidence supports the additional demand or conversion needed?');
  }
  if(result.shortfall) questions.push('Closing cash turns negative in '+result.shortfall+'. What financing or payment changes would cover the shortfall?');
  const margin=benchmarks.find(b=>b.unit==='percent' && b.metric==='gross_margin');
  if(margin && result.grossMargin!==null && Math.abs(margin.value-result.grossMargin)>=10) questions.push('Gross margin differs from the comparison group by '+Math.abs(margin.value-result.grossMargin).toFixed(1)+' percentage points. Which costs explain the gap?');
  if(!questions.length) questions.push('Which customer evidence supports '+rupees(result.revenue)+' in sales, and what early signal would make the team revise the plan?');
  return questions;
}
