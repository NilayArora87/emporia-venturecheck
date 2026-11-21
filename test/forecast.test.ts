import { test } from 'node:test';
import assert from 'node:assert/strict';
import { examples } from '../src/seed.ts';
import { calculate, backtest, questions, sensitivity } from '../src/forecast.ts';
import { actualPreview, benchmarkPreview, matches } from '../src/evidence.ts';
import { readFileSync } from 'node:fs';
import { validatePlan } from '../src/model.ts';

test('food pilot forecasts ₹6.72L against ₹12L target and ₹9.6L capacity ceiling',()=>{
  const {food}=examples();
  validatePlan(food);
  const r=calculate(food);
  assert.equal(r.required,50);
  assert.equal(r.revenue,67200000);
  assert.equal(r.ceiling,96000000);
  assert.equal(r.totalDays,240);
  assert.match(questions(food)[0],/50 orders per selling day.*28 orders per day/);
  assert.ok(sensitivity(food)[0].spread>0);
});
test('availability, demand and expansion cost change different outcomes',()=>{
  const {food}=examples();
  const base=calculate(food), capacity=calculate(food,'base',{capacity:50});
  assert.equal(capacity.revenue,base.revenue);
  assert.equal(capacity.ceiling,120000000);
  const expansion=structuredClone(food);
  expansion.calendar[0].capacity=10;
  expansion.calendar[0].capex=25000;
  const result=calculate(expansion,'base',{demand:50});
  const uncosted=calculate(food,'base',{demand:50,capacity:50});
  assert.equal(result.revenue,120000000);
  assert.equal(result.profit,uncosted.profit);
  assert.equal(result.closingCash,uncosted.closingCash-2500000);
});
test('subscription billing reconciles opening customers, adds and churn',()=>{
  const {sub}=examples();
  const r=calculate(sub);
  for(const [i,m] of r.months.entries()){
    assert.equal(m.closing,m.opening+m.additions-m.cancellations);
    assert.equal(m.revenue,m.closing*49900);
    assert.equal(m.recurring,m.revenue);
    assert.ok(m.cancellations<=m.opening);
    if(i)assert.equal(m.opening,r.months[i-1].closing);
  }
  assert.equal(calculate(sub,'base',{churn:100}).months[0].closing,21);
});
test('service profit precedes cash collection and financing stays separate',()=>{
  const {studio}=examples();
  studio.calendar[0].funding=5000;
  const r=calculate(studio), first=r.months[0];
  assert.ok(first.profit>0);
  assert.equal(first.receipts,0);
  assert.equal(first.cash,6500000+500000-first.payment);
  assert.equal(r.months[2].receipts,first.revenue);
  assert.equal(r.breakEven,'2027-01');
  assert.equal(r.shortfall,'2027-02');
  assert.equal(r.receivables,r.months[10].revenue+r.months[11].revenue);
});
test('stockouts, closures, negative contribution, zero revenue and no break-even',()=>{
  const {food}=examples();
  food.calendar[0].stock=0;
  food.calendar[1].days=0;
  const r=calculate(food,'base',{materials:101});
  assert.equal(r.months[0].revenue,0);
  assert.equal(r.months[1].volume,0);
  assert.equal(r.months[2].growth,null);
  assert.equal(r.months[2].growthReason,'No prior revenue');
  assert.equal(r.breakEven,null);
  assert.ok(r.gross<0);
  const none=calculate(food,'base',{price:0});
  assert.equal(none.revenue,0);
  assert.equal(none.grossMargin,null);
  assert.equal(none.required,null);
});
test('refunds, wastage and inventory cash are calculated once',()=>{
  const {food}=examples();
  food.calendar[0].stock=100;
  const m=calculate(food,'base',{waste:20,returns:10}).months[0];
  assert.equal(m.volume,80);
  assert.equal(m.refunded,8);
  assert.equal(m.consumed,100);
  assert.equal(m.revenue,720000);
  assert.equal(m.cost,388000);
  assert.equal(m.payment,m.cost+m.expenses);
});
test('growth only uses comparable periods and expects safe paise arithmetic',()=>{
  const {food}=examples();
  food.actuals=[{month:'2026-12',revenue:28000}];
  assert.equal(calculate(food).months[0].growth,100);
  assert.equal(calculate(food).annualGrowth,null);
  assert.throws(()=>calculate(food,'base',{price:100_000_000,capacity:100_000}),/monetary range/);
});
test('backtest only trains on months before the held-out period',()=>{
  const {sub,food}=examples();
  const r=backtest(sub)!;
  assert.equal(r.cutoff,'2026-10');
  assert.deepEqual(r.months,['2026-11','2026-12']);
  assert.equal(r.baselineMae,355000);
  assert.equal(r.mae,481667);
  assert.equal(backtest(food),null);
});
test('verified context uses source definitions and has explicit missing coverage',()=>{
  const {food,studio}=examples();
  const csv=readFileSync(new URL('../data/benchmarks.csv',import.meta.url),'utf8');
  const snapshot=benchmarkPreview(csv);
  assert.deepEqual(snapshot.errors,[]);
  assert.equal(snapshot.rows.length,5);
  assert.equal(matches(food,[]).length,0);
  assert.ok(matches(food,snapshot.rows).every(b=>b.usage==='Context only'));
  assert.ok(matches(studio,snapshot.rows).some(b=>b.value===262352 && !b.eligible));
  const preview=actualPreview('month,revenue_inr\n2026-12,0\n2026-12,53\n2026-11,\n2027-01,25',food);
  assert.deepEqual(preview.rows,[{month:'2026-12',revenue:0}]);
  assert.equal(preview.errors.length,3);
});
