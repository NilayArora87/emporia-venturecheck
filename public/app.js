const app=document.querySelector('#app');
const toast=document.querySelector('.notice');
const escape=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const money=value=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2,minimumFractionDigits:0}).format(value/100);
const num=value=>value?.toLocaleString('en-IN')??'—';
const pct=value=>value===null?'—':value.toFixed(1)+'%';
const date=value=>new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(new Date(value));
const month=value=>new Intl.DateTimeFormat('en-IN',{month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(value+'-01T00:00:00Z'));
const monthOffset=(launch,i)=>{const dt=new Date(launch+'-01T00:00:00Z');dt.setUTCMonth(dt.getUTCMonth()+i);return dt.toISOString().slice(0,7);};
const field=(label,markup)=>'<label class="field">'+escape(label)+markup+'</label>';
const input=(name,value='',type='text',extra='')=>'<input name="'+escape(name)+'" type="'+type+'" value="'+escape(value)+'" '+extra+'>';
const select=(name,choices,active)=>'<select name="'+escape(name)+'">'+choices.map(([key,label])=>'<option value="'+escape(key)+'"'+(key===active?' selected':'')+'>'+escape(label)+'</option>').join('')+'</select>';
const textarea=(name,value='',extra='')=>'<textarea name="'+escape(name)+'" '+extra+'>'+escape(value)+'</textarea>';
const button=(label,type='secondary',attrs='type="button"')=>'<button class="btn '+type+'" '+attrs+'>'+escape(label)+'</button>';
const link=(label,href)=>'<a class="btn secondary" href="'+escape(href)+'">'+escape(label)+'</a>';
const pill=(value,type='')=>'<span class="pill '+type+'">'+escape(value)+'</span>';
const table=(headers,rows)=>'<div class="table-wrap"><table><thead><tr>'+headers.map(h=>'<th scope="col">'+escape(h)+'</th>').join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>';
const info=(label,value,sub='',style='')=>'<div class="card metric '+style+'"><span class="eyebrow">'+escape(label)+'</span><strong class="currency">'+escape(value)+'</strong><small>'+escape(sub)+'</small></div>';
let home, modelData, noticeTimeout, cleanup=async()=>{}, generation=0, displayedHash='';
function notify(message,error=false){toast.textContent=message;toast.classList.toggle('error',error);clearTimeout(noticeTimeout);noticeTimeout=setTimeout(()=>toast.textContent='',4800);}
async function api(path,data){
  const res=await fetch('/api'+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  const payload=await res.json();
  if(!res.ok){const e=new Error(payload.error);e.status=res.status;throw e;}
  return payload;
}
async function attempt(fn){try{await fn();}catch(e){notify(e.message,true);}}
const paths={events:'M3 4h18v16H3zM3 9h18m-13 4h3m2 0h3m-8 3h5',evidence:'M4 3h12l4 4v14H4zM8 10h8m-8 4h8m-8 3h5',organizer:'M3 6h18M3 12h18M3 18h18M8 4v4m8 2v4m-6 2v4'};
function icon(key){return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="'+paths[key]+'"/></svg>';}
const brand='<a class="brand" href="#events"><img src="/mark.svg" alt="">VentureCheck</a>';
function frame(content,active='events',crumb=''){
  displayedHash=location.hash;
  const navigation=[['events',home.user.role==='team'?'My submission':'Emporia 5.0'],['evidence','Evidence catalogue'],...(home.user.role==='organizer'?[['organizer','Admin panel']]:[])];
  app.innerHTML='<div class="shell"><aside class="sidebar">'+brand+'<nav class="side-nav" aria-label="Main">'+navigation.map(([key,label])=>'<a href="#'+key+'" '+(key===active?'class="active" aria-current="page"':'')+'>'+icon(key)+escape(label)+'</a>').join('')+'</nav><div class="identity"><div><strong>'+escape(home.user.name)+'</strong><br><small>'+escape(home.user.role)+'</small></div>'+button('Sign out','ghost','id="logout" type="button"')+'</div></aside><main class="main"><div class="breadcrumb"><a href="#events">Workspace</a><span aria-hidden="true">›</span>'+escape(crumb||navigation.find(([key])=>key===active)?.[1])+'</div>'+content+'</main></div>';
  document.querySelector('#logout').onclick=()=>attempt(async()=>{await cleanup();await api('/logout',{});history.replaceState(null,'','#events');login();});
}
function heading(title,kicker='',detail='',actions=''){
  return '<header class="head"><div>'+(kicker?'<div class="eyebrow">'+escape(kicker)+'</div>':'')+'<h1>'+escape(title)+'</h1>'+(detail?'<p>'+escape(detail)+'</p>':'')+'</div><div class="row">'+actions+'</div></header>';
}
const formObject=form=>Object.fromEntries(new FormData(form));
function bindForm(id,callback){const form=document.querySelector('#'+id);if(form)form.onsubmit=e=>{e.preventDefault();attempt(()=>callback(formObject(form),form));};}
function login(){
  app.innerHTML='<div class="login"><section class="login-hero">'+brand+'<div><div class="eyebrow">Emporia 5.0</div><h1>Test the numbers behind the <mark>pitch.</mark></h1><p>Review sales, operating profit and cash forecasts, with the assumptions and evidence open for inspection.</p></div></section><main class="login-main"><h2>Sign in</h2><p class="muted">Use your event account.</p><form id="signin" class="card stack">'+field('Email',input('email','','email','required autocomplete="username"'))+field('Password',input('password','','password','required autocomplete="current-password"'))+button('Sign in','','type="submit"')+'</form><details class="card"><summary>Register a team</summary><form id="register" class="stack forecast-body">'+field('Team name',input('name','','text','required maxlength="100"'))+field('Team email',input('email','','email','required autocomplete="email"'))+field('Password · at least 10 characters',input('password','','password','required minlength="10" maxlength="200" autocomplete="new-password"'))+button('Create team account','','type="submit"')+'</form></details><div id="demo-links"></div></main></div>';
  bindForm('register',async data=>{
    await api('/register',data);
    await api('/login',{email:data.email,password:data.password});
    history.replaceState(null,'','#events');await route();notify('Team account created.');
  });
  bindForm('signin',async data=>{await api('/login',data);history.replaceState(null,'','#events');await route();});
  api('/demo').then(({enabled})=>{
    const el=document.querySelector('#demo-links');if(!enabled||!el)return;
    el.innerHTML='<div class="card stack"><h3>Explore the demo</h3><div class="row">'+[['judge','Judge'],['team','Team'],['admin','Admin']].map(([id,label])=>button(label,'secondary','data-account="'+id+'" type="button"')).join('')+'</div></div>';
    el.querySelectorAll('button').forEach(b=>b.onclick=()=>attempt(async()=>{await api('/login',{email:b.dataset.account+'@venture.local',password:'venture-demo'});history.replaceState(null,'','#events');await route();}));
  }).catch(()=>{});
}
function events(){
  if(home.user.role==='team'){
    const pitches=home.events.flatMap(e=>e.startups.map(p=>({...p,deadline:e.deadline})));
    frame(heading('My pitch submission','Emporia 5.0','Prepare your forecast, check the numbers and submit your pitch for judging.')+
      pitches.map(p=>'<section class="card stack"><div class="row spread"><h2>'+escape(p.title)+'</h2>'+pill(p.version?'Submitted v'+p.version:'Draft')+'</div><p>'+escape(p.disqualified?'Your team has been disqualified from Emporia 5.0. Contact the event admin for details.':p.editable?'Your pitch is open for submission.':('Submissions are closed. Event deadline: '+date(p.deadline)+' IST. Ask your admin to open a revision.'))+'</p><div class="row">'+
      (p.editable?link('Prepare & submit pitch','#project/'+p.id):'')+(p.version?link('View submitted pitch','#project/'+p.id+'/'+p.version):'')+'</div></section>').join(''),'events','My submission');
    return;
  }
  const content=home.events.map(event=>'<section class="section stack"><div class="row spread"><div class="row"><h2>'+escape(event.name)+'</h2>'+pill(event.locked?'Locked':'Open for submissions',event.locked?'':'accent')+'</div>'+(home.user.role!=='team'&&(home.user.role==='organizer'||event.locked)?link('Compare pitches','#compare/'+event.id):'')+'</div>'+(!event.locked?'<small>Deadline '+escape(date(event.deadline))+' IST</small>':'')+(event.startups.length?'<div class="grid three">'+event.startups.map(project=>project.pending?'<article class="card project-card"><h3>'+escape(project.title)+'</h3><small>'+escape(project.pending)+'</small></article>':'<a class="card project-card" href="#project/'+escape(project.id)+'"><div class="row spread">'+pill(project.industry)+'<span aria-hidden="true">↗</span></div><div><h3>'+escape(project.title)+'</h3><small>'+escape(modelData.models[project.model])+' · '+escape(project.stage)+'</small></div><small>'+escape(project.disqualified?'Disqualified':project.version?'Submission v'+project.version:'Draft')+'</small></a>').join('')+'</div>':'<div class="empty">No teams are assigned to this event yet.</div>')+'</section>').join('');
  frame(heading('Emporia 5.0','VentureCheck',home.user.role==='judge'?'Review assigned pitches and test their financial assumptions.':'Manage startup pitches for your event.')+(content||'<div class="empty">Your assigned teams will appear here when the admin assigns you.</div>'));
}
function plot(months){
  const series=[['revenue','#30745b','Revenue'],['profit','#af6d4e','Operating profit'],['cash','#778334','Closing cash']];
  const w=650,h=226,l=76,r=15,t=12,b=29;
  const ys=months.flatMap(m=>series.map(([key])=>m[key]));
  const min=Math.min(0,...ys),max=Math.max(1,...ys);
  const x=i=>l+(w-l-r)*i/Math.max(1,months.length-1), y=v=>t+(h-t-b)*(max-v)/(max-min);
  const ticks=[...new Set([min,0,max/2,max])].sort((a,b)=>a-b).filter((v,i,a)=>i===0||y(a[i-1])-y(v)>15);
  return '<svg class="plot" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Monthly revenue, operating profit, and closing cash. Exact values follow in the monthly table.">'+ticks.map(v=>'<path d="M'+l+' '+y(v)+'H'+(w-r)+'" stroke="#dfe4d9"></path><text x="'+(l-6)+'" y="'+(y(v)+4)+'" text-anchor="end">'+escape(money(Math.round(v/10000)*10000))+'</text>').join('')+months.map((m,i)=>'<text x="'+x(i)+'" y="'+(h-8)+'" text-anchor="middle">'+escape(month(m.month).split(' ')[0])+'</text>').join('')+series.map(([key,color])=>'<polyline fill="none" stroke="'+color+'" stroke-width="2.6" points="'+months.map((m,i)=>x(i)+','+y(m[key])).join(' ')+'"/>').join('')+'</svg><div class="legend"><span><i class="swatch"></i>Revenue</span><span><i class="swatch expenses"></i>Operating profit</span><span><i class="swatch cash"></i>Closing cash</span></div>';
}
function financialTable(result,compact=false,model='product'){
  const volumeLabel=model==='subscription'?'Closing subscribers':model==='service'?'Billable hours':'Orders';
  if(compact) return table(['Month','Revenue','Operating profit','Closing cash'],result.months.map(x=>[month(x.month),money(x.revenue),money(x.profit),money(x.cash)]));
  return table(['Month',volumeLabel,'Revenue','MoM growth','Cost of sales','Gross profit','Operating expenses','Operating profit','Gross margin','Operating margin','Cash receipts','Cash payments','Funding','Capex','Closing cash'],result.months.map(x=>[month(x.month),num(x.volume),money(x.revenue),x.growth===null?escape(x.growthReason):pct(x.growth),money(x.cost),money(x.gross),money(x.expenses),money(x.profit),pct(x.grossMargin),pct(x.operatingMargin),money(x.receipts),money(x.payment),money(x.funding),money(x.capex),money(x.cash)]));
}
function benchmarkCard(b){
  const rendered=b.unit==='percent'?num(b.value)+'%':b.unit==='INR / establishment / year'?money(b.value*100)+' / establishment / year':num(b.value)+' '+b.unit;
  return '<article class="card source stack compact"><div class="row">'+pill(b.usage||b.industry)+'</div><h3>'+escape(b.definition)+'</h3><strong>'+escape(rendered)+'</strong><p>'+escape(b.publisher+' · '+b.table+' · '+b.period)+'</p><small>'+escape(b.statistic+' · '+b.population+' · '+b.geography+(b.sample?' · n = '+num(b.sample):''))+'</small>'+(b.reason?'<small>'+escape(b.reason)+'</small>':'')+'<small>'+escape(b.limitations)+'</small><small>Retrieved '+escape(b.retrieved)+' · <a href="'+escape(b.url)+'" target="_blank" rel="noopener noreferrer">Open source</a></small></article>';
}
async function catalogue(){
  const snapshots=await api('/evidence');
  frame(heading('Evidence catalogue','Benchmarks','Approved snapshots and their original sources.')+snapshots.map(s=>'<section class="stack section"><h2>'+escape(s.title)+'</h2><div class="grid two">'+s.rows.map(benchmarkCard).join('')+'</div></section>').join(''),'evidence');
}
async function comparison(id){
  const d=await api('/events/'+id+'/compare');
  const rows=d.rows.map(r=>[r.rank??'—','<a href="#project/'+escape(r.id)+'">'+escape(r.title)+'</a>',escape(r.industry),money(r.revenue),money(r.profit),...d.rubric.map(c=>r.dimensions[c.key]?.toFixed(1)??'—'),...(home.user.role==='organizer'?[r.marks??'—']:[]),r.disqualified?'Disqualified':r.total?.toFixed(1)??'Incomplete',r.complete]);
  frame(heading('Compare pitches',d.name,home.user.role==='judge'?'Weighted scores reflect your own rubric entries.':'The admin mark counts as one completed scorecard. Disqualified teams receive no rank.',link('All events','#events'))+'<div class="card">'+(rows.length?table(['Rank','Startup','Industry','Sales','Operating profit',...d.rubric.map(r=>r.label+' / 5'),...(home.user.role==='organizer'?['Admin / 100']:[]),'Score / 100','Complete judge cards'],rows):'<p class="muted">No submitted pitches yet.</p>')+'</div>','events','Comparison');
}
function overviewContent(d,payload,selected){
  const {plan,result,questions,sensitivity,backtest}=payload;
  const base=d.forecast.result;
  const impact=sensitivity[0];
  const requiredLabel=plan.model==='product'?'Orders per selling day':plan.model==='service'?'Billable hours per year':'Average billed subscribers';
  const comparison=selected?'Sales change vs. locked base: '+money(result.revenue-base.revenue)+' · Operating profit change: '+money(result.profit-base.profit)+' · Closing cash change: '+money(result.closingCash-base.closingCash):'Submitted base case';
  return '<div class="stack"><div class="row spread"><div class="row">'+pill(selected||'Locked base',selected?'accent':'')+'<small>'+escape(comparison)+'</small></div><small>'+escape(month(plan.launch))+' to '+escape(month(result.months.at(-1).month))+'</small></div><div class="grid four">'+info('Claimed sales',money(result.target),'Team’s 12-month target')+info('Forecast sales',money(result.revenue),money(result.revenue-result.target)+' vs. target','feature')+info('Operating profit / loss',money(result.profit),pct(result.operatingMargin)+' operating margin',result.profit<0?'negative':'')+info('First cash shortfall',result.shortfall?month(result.shortfall):'None in horizon','Closing cash '+money(result.closingCash),result.shortfall?'negative':'')+'</div><div class="callout"><div class="eyebrow">Question for the pitch</div><p>'+escape(questions[0])+'</p></div><div class="card"><div class="row spread"><h2>Monthly outlook</h2><small>INR · 12 months</small></div>'+plot(result.months)+'</div><div class="grid three">'+info(requiredLabel,num(result.required),'At scenario price and calendar')+info('Capacity-only sales ceiling',result.ceiling===null?'No fixed ceiling':money(result.ceiling),result.ceiling===null?'Driven by leads and churn':'Assumes enough demand and stock')+info('First operating break-even',result.breakEven?month(result.breakEven):'None in horizon','First revenue month with operating profit ≥ ₹0')+'</div><div class="card stack"><h2>Forecast checks</h2><p>Gross margin <strong>'+pct(result.grossMargin)+'</strong> · Year-over-year sales growth <strong>'+escape(result.annualGrowth===null?result.annualGrowthReason:pct(result.annualGrowth))+'</strong> · End-of-horizon receivables <strong>'+money(result.receivables)+'</strong></p>'+(impact?.spread?'<p><strong>Biggest sensitivity · '+escape(impact.label)+'</strong> '+escape(num(impact.from)+' to '+num(impact.to)+' '+impact.unit)+' changes annual operating profit by '+money(impact.spread)+' across those endpoints.</p>':'<p>No differing sensitivity endpoints supplied.</p>')+(backtest?'<p>Historical three-month mean trained through '+escape(month(backtest.cutoff))+'. Held out '+escape(backtest.months.map(month).join(' and '))+'. Mean absolute revenue error '+money(backtest.mae)+' versus '+money(backtest.baselineMae)+' for the last-observed baseline.</p>':'<p>Historical backtest needs at least six consecutive months of actual revenue. Scenario values are conditional on the submitted inputs.</p>')+'</div>'+questions.slice(1).map(q=>'<div class="inset">'+escape(q)+'</div>').join('')+'</div>';
}
function printContent(d){
  const {plan,result,questions}=d.forecast;
  return '<article class="print-only"><div class="eyebrow">VentureCheck · '+escape(d.event)+'</div><h1>'+escape(plan.title)+'</h1><p>'+escape(plan.industry)+' · '+escape(plan.stage)+' · Submission v'+d.version+' · '+escape(d.engine)+'</p><p>Claimed sales <strong>'+money(result.target)+'</strong> · Forecast sales <strong>'+money(result.revenue)+'</strong> · Operating profit <strong>'+money(result.profit)+'</strong></p><p>First cash shortfall '+(result.shortfall?month(result.shortfall):'none in horizon')+' · Closing cash '+money(result.closingCash)+'</p><h2>Question for the pitch</h2><p>'+escape(questions[0])+'</p><h2>Monthly forecast</h2>'+financialTable(result,true)+'<p>Benchmark snapshot '+escape(d.snapshotTitle??'None selected')+'</p></article>';
}
function forecastEvidence(d){
  const {plan,benchmarks}=d.forecast;
  const rows=modelData.fields[plan.model].map(f=>{const a=plan.drivers[f.key];return [escape(f.label),escape(num(a.base)+' '+f.unit),escape(({estimate:'Team estimate',actual:'Team actual',benchmark:'Approved benchmark'})[a.kind]),escape(a.source),escape(a.period)];});
  const estimateCount=Object.values(plan.drivers).filter(a=>a.kind==='estimate').length;
  return '<div class="stack"><div class="card"><h2>Assumptions and evidence</h2><p class="muted">'+num(estimateCount)+' of '+num(Object.keys(plan.drivers).length)+' assumptions are team estimates. Team evidence is self-reported.</p>'+table(['Assumption','Base value','Evidence type','Source or explanation','Period'],rows)+'</div><div class="card stack"><h2>Team references</h2>'+(plan.evidence.map(e=>'<div class="inset"><strong>'+escape(e.label)+'</strong><p>'+escape(e.detail)+'</p><small>'+escape(e.period)+'</small></div>').join('')||'<p>No evidence references submitted.</p>')+'</div><div class="card"><h2>Industry benchmarks</h2><p class="muted">Snapshot '+escape(d.snapshotTitle??'unavailable')+'. Context metrics are displayed separately from forecast inputs.</p></div>'+(benchmarks.length?'<div class="grid two">'+benchmarks.map(benchmarkCard).join('')+'</div>':'<div class="empty">No comparable industry evidence in this snapshot.</div>')+'</div>';
}
function calendarTable(plan){
  const cols=[['days','Selling / work days'],['season','Demand factor %'],...(plan.model==='product'?[['stock','Units purchased'],['capacity','Daily capacity change']]:[]),...(plan.model==='service'?[['hires','Headcount change']]:[]),['funding','Funding ₹'],['capex','Capex ₹']];
  return table(['Month',...cols.map(x=>x[1])],plan.calendar.map((row,i)=>{
    const label=/^20\d\d-(0[1-9]|1[0-2])$/.test(plan.launch)?month(monthOffset(plan.launch,i)):'Month '+(i+1);
    return [label,...cols.map(([key,name])=>input('cal:'+i+':'+key,row[key],'number','step="'+(['season','funding','capex'].includes(key)?'0.01':'1')+'" required aria-label="'+escape(label+' '+name)+'"'))];
  }));
}
function calValues(values,calendar){
  const result=structuredClone(calendar);
  Object.entries(values).filter(([k])=>k.startsWith('cal:')).forEach(([key,value])=>{
    const [,i,name]=key.split(':');result[i][name]=value===''?null:Number(value);
  });
  return result;
}
function renderForecast(d,version){
  const base=d.forecast;
  let selected='',active=base,tab='Overview',scenarioRequest=0;
  const hasJudge=home.user.role==='judge';
  frame(heading(base.plan.title,d.event,base.plan.industry+' · '+modelData.models[base.plan.model]+' · '+base.plan.stage+' · '+base.plan.geography,link('Monthly CSV','/api/project/'+d.id+'/csv'+(version?'?version='+version:''))+button('Print report','secondary','id="print-report" type="button"'))+
  '<div class="row">'+pill('Submission v'+d.version)+pill(d.locked?'Locked':'Submitted')+'<small>Engine '+escape(d.engine)+'</small>'+ (d.history.length>1?'<details><summary>Submission history</summary>'+d.history.map(item=>link('Version '+item.version,'#project/'+d.id+'/'+item.version)).join(' ')+'</details>':'')+'</div>'+
  '<nav class="tabs" aria-label="Pitch details">'+['Overview','Monthly data','Evidence',...(hasJudge?['Scorecard']:[])].map(x=>'<button class="tab" type="button" data-view="'+x+'">'+x+'</button>').join('')+'</nav><div class="'+(hasJudge?'grid dashboard':'')+'"><div id="forecast-view"></div>'+(hasJudge?'<aside id="scenario-panel" class="card"></aside>':'')+'</div>'+printContent(d),'events',base.plan.title);
  document.querySelector('#print-report').onclick=()=>window.print();
  const views=document.querySelectorAll('[data-view]');
  function content(){
    views.forEach(v=>{v.classList.toggle('active',v.dataset.view===tab);v.setAttribute('aria-pressed',String(v.dataset.view===tab));});
    const area=document.querySelector('#forecast-view');
    if(tab==='Overview'){area.innerHTML=overviewContent(d,active,selected);return;}
    if(tab==='Evidence'){area.innerHTML=forecastEvidence(d);return;}
    if(tab==='Monthly data'){
      const result=active.result;
      area.innerHTML='<div class="card stack"><h2>Monthly financials</h2><p class="muted">'+escape(selected||'Locked base')+' · Scroll the table to see cash movements.</p>'+financialTable(result,false,base.plan.model)+(base.plan.model==='subscription'?'<h2>Subscriber reconciliation</h2>'+table(['Month','Opening','Added','Cancellations','Closing','Billed recurring revenue'],result.months.map(x=>[month(x.month),num(x.opening),num(x.additions),num(x.cancellations),num(x.closing),money(x.recurring)])):'')+'</div>';return;
    }
    if(d.disqualified){area.innerHTML='<div class="card"><h2>Disqualified</h2><p>Scoring is closed for this team.</p></div>';return;}
    const review=d.review??{scores:{},notes:''};
    area.innerHTML='<form id="rubric" class="card stack"><h2>Private scorecard</h2><p class="muted">Score each dimension from 0 to 5. Leave a score blank if you need more evidence.</p>'+d.rubric.map(r=>'<div class="review-score">'+field(r.label+' · '+r.weight+'%',select(r.key,[['','Unscored'],...[0,1,2,3,4,5].map(n=>[String(n),String(n)])],String(review.scores[r.key]??'')))+'</div>').join('')+field('Private notes',textarea('notes',review.notes,'maxlength="8000"'))+'<div class="row">'+button('Save scorecard','','type="submit"')+'<strong id="review-total"></strong></div></form>';
    const scoreTotal=()=>{const values=formObject(document.querySelector('#rubric'));document.querySelector('#review-total').textContent=d.rubric.every(r=>values[r.key]!=='')?(d.rubric.reduce((n,r)=>n+Number(values[r.key])*r.weight/5,0)).toFixed(1)+' / 100':'Incomplete';};
    document.querySelector('#rubric').oninput=scoreTotal;
    scoreTotal();
    bindForm('rubric',async data=>{
      const scores=Object.fromEntries(d.rubric.filter(r=>data[r.key]!=='').map(r=>[r.key,Number(data[r.key])]));
      await api('/project/'+d.id+'/review',{scores,notes:data.notes,version:d.version});
      d.review={scores,notes:data.notes};notify('Scorecard saved.');
    });
  }
  views.forEach(v=>v.onclick=()=>{tab=v.dataset.view;content();});
  content();
  if(!hasJudge)return;
  const fields=modelData.fields[base.plan.model];
  function sidebar(chosen='base',overrides={},calendar=base.plan.calendar,name=''){
    const panel=document.querySelector('#scenario-panel');
    panel.innerHTML='<form id="scenario" class="stack"><div><h2>What if?</h2><p class="muted">Test a conditional scenario privately.</p></div>'+field('Submitted scenario',select('caseName',[['base','Base'],['downside','Downside'],['upside','Upside']],chosen))+
      '<div class="stack compact">'+fields.map(f=>field(f.label+' · '+f.unit,input('edit:'+f.key,overrides[f.key]??'','number','placeholder="'+escape(base.plan.drivers[f.key][chosen])+'" min="0" max="'+f.max+'" step="'+(f.money||f.rate?'0.01':'1')+'"'))).join('')+'</div>'+
      '<details><summary>Monthly calendar and expansion costs</summary><div class="forecast-body">'+calendarTable({...base.plan,calendar})+'</div></details>'+
      '<div class="row">'+button('Apply scenario','lime','type="submit"')+button('Reset','secondary','id="reset-scenario" type="button"')+'</div>'+field('Private scenario name',input('name',name,'text','maxlength="80"'))+button('Save scenario','secondary','id="save-scenario" type="button"')+
      (d.scenarios.length?field('Load saved scenario',select('saved',[['','Choose'],...d.scenarios.map(s=>[s.name,s.name])],name)):'')+'</form>';
    const form=document.querySelector('#scenario');
    function formData(data){
      return {name:data.name,caseName:data.caseName,overrides:Object.fromEntries(fields.filter(f=>data['edit:'+f.key]!=='').map(f=>[f.key,Number(data['edit:'+f.key])])),calendar:calValues(data,calendar)};
    }
    async function calculateScenario(data){
      const request=++scenarioRequest;
      const projection=await api('/project/'+d.id+'/calculate',{...data,version:d.version});
      if(request!==scenarioRequest||!document.querySelector('#forecast-view'))return;
      active=projection;
      selected=data.name||data.caseName[0].toUpperCase()+data.caseName.slice(1)+' what-if';
      if(tab==='Scorecard'||tab==='Evidence')tab='Overview';
      content();
    }
    form.elements.caseName.onchange=e=>fields.forEach(f=>{form.elements['edit:'+f.key].placeholder=base.plan.drivers[f.key][e.target.value];});
    bindForm('scenario',data=>calculateScenario(formData(data)));
    document.querySelector('#reset-scenario').onclick=()=>{scenarioRequest++;selected='';active=base;content();sidebar();};
    document.querySelector('#save-scenario').onclick=()=>attempt(async()=>{
      if(!form.reportValidity())return;
      const data=formData(formObject(form));
      const saved=await api('/project/'+d.id+'/scenario',{...data,version:d.version});
      data.name=saved.name;
      d.scenarios=(await api('/project/'+d.id)).scenarios;
      await calculateScenario(data);
      sidebar(data.caseName,data.overrides,data.calendar,data.name);notify('Private scenario saved.');
    });
    if(form.elements.saved)form.elements.saved.onchange=e=>attempt(async()=>{
      const s=d.scenarios.find(row=>row.name===e.target.value);
      if(!s)return;
      sidebar(s.caseName,s.drivers,s.calendar??base.plan.calendar,s.name);
      await calculateScenario({...s,overrides:s.drivers});
    });
  }
  sidebar();
}
function forecastPreview(data){
  const rows=['downside','base','upside'].map(c=>{
    const r=data.cases[c];return [escape(c),money(r.revenue),money(r.profit),money(r.closingCash),r.shortfall?month(r.shortfall):'None in horizon'];
  });
  const driver=data.sensitivity[0];
  return '<h2>Draft forecast · 12 months</h2>'+table(['Case','Sales','Operating profit','Closing cash','First cash shortfall'],rows)+
    '<p>'+escape(data.questions[0])+'</p>'+(driver?.spread?'<p>Most sensitive assumption: '+escape(driver.label)+' · '+money(driver.spread)+' operating profit difference across its endpoints.</p>':'');
}
function renderDraft(d){
  let plan=structuredClone(d.draft),revision=d.revision,timer,inflight=Promise.resolve(),preview=null,csvValue='',dirty=false;
  const routePath='/project/'+d.id;
  function flush(){
    clearTimeout(timer);
    inflight=inflight.catch(()=>{}).then(async()=>{
      if(!dirty)return;
      const data=structuredClone(plan);
      dirty=false;
      try{
        const result=await api(routePath+'/draft',{plan:data,revision});
        revision=result.revision;
        const status=document.querySelector('#draft-status');
        if(status)status.textContent=dirty?'Changes pending…':'Draft saved';
      }catch(error){
        dirty=true;
        const status=document.querySelector('#draft-status');
        if(status)status.textContent='Draft pending · '+error.message;
        throw error;
      }
    });
    return inflight;
  }
  cleanup=async()=>{await flush();cleanup=async()=>{};};
  function schedule(){
    dirty=true;
    clearTimeout(timer);
    document.querySelector('#draft-status').textContent='Changes pending…';
    timer=setTimeout(()=>void flush().catch(()=>{}),650);
  }
  function draw(){
    const defs=modelData.fields[plan.model];
    const options=[['estimate','Team estimate'],['actual','Team actual'],['benchmark','Approved benchmark']];
    const driverRows=defs.map(f=>{
      const driver=plan.drivers[f.key];
      const meta=' required min="0" max="'+f.max+'" step="'+(f.money||f.rate?'0.01':'1')+'"';
      return [escape(f.label)+'<br><small>'+escape(f.unit)+'</small>',...['downside','base','upside'].map(c=>input('driver:'+f.key+':'+c,driver[c],'number',meta+' aria-label="'+escape(f.label+' '+c)+'"')),
        select('driver:'+f.key+':kind',options,driver.kind),input('driver:'+f.key+':source',driver.source,'text','required maxlength="500" aria-label="'+escape(f.label+' source')+'"'),input('driver:'+f.key+':period',driver.period,'text','required maxlength="100" aria-label="'+escape(f.label+' period')+'"')];
    });
    frame(heading(plan.title||'Startup draft',d.event,'Enter the assumptions behind your pitch. Your draft saves as you edit.',d.version?link('View submitted pitch','#project/'+d.id+'/'+d.version):'')+
      '<div class="row">'+pill(d.version?'Submitted v'+d.version:'Draft')+'<small id="draft-status">'+(dirty?'Changes pending…':'Draft saved')+'</small></div>'+
      '<div class="row section">'+button('Preview forecast','secondary','type="button" id="preview-forecast"')+button('Submit pitch','lime','form="draft" type="submit"')+'</div><section id="draft-forecast" aria-live="polite"></section><form id="draft" class="stack section"><section class="card stack"><h2>Pitch details</h2><div class="formrow">'+field('Project name',input('title',plan.title,'text','required maxlength="100"'))+
      field('Industry',select('industry',modelData.industries.map(x=>[x,x]),plan.industry))+field('Business model',select('model',Object.entries(modelData.models),plan.model))+
      field('Stage',select('stage',modelData.stages.map(x=>[x,x]),plan.stage))+field('Geography',input('geography',plan.geography,'text','required maxlength="100"'))+
      field('Launch month',input('launch',plan.launch,'month','required min="2000-01" max="2099-12"'))+field('12-month sales target · ₹',input('target',plan.target,'number','required min="0" max="100000000" step="0.01"'))+'</div></section>'+
      '<section class="card stack"><h2>Forecast assumptions</h2><p class="muted">Enter your case values, how each was sourced, and the relevant period. Scroll sideways for the evidence fields.</p>'+table(['Driver','Downside','Base','Upside','Evidence type','Source / explanation','Period'],driverRows)+
      (d.eligible.length?'<details><summary>Eligible benchmarks for the saved draft</summary>'+d.eligible.map(b=>'<p>'+escape(b.key+' · '+b.period+' · '+b.value+' '+b.unit)+'</p>').join('')+'</details>':'')+'</section>'+
      '<section class="card stack"><h2>Operating calendar</h2><p class="muted">100% keeps your base demand. Capacity and headcount changes carry forward. Funding and capex happen in the month entered.</p>'+calendarTable(plan)+'</section>'+
      '<section class="card stack"><h2>Monthly actuals</h2><p class="muted">Enter revenue before the launch month. An empty cell is missing, while 0 is a recorded zero.</p>'+
      table(['Month','Revenue ₹',''],plan.actuals.map((a,i)=>[input('actual:'+i+':month',a.month,'month','required aria-label="Actual month '+(i+1)+'"'),input('actual:'+i+':revenue',a.revenue,'number','required min="0" step="0.01" aria-label="Actual revenue '+(i+1)+'"'),button('Remove','link','type="button" data-remove-actual="'+i+'"')]))+
      '<div class="row">'+button('Add month','secondary','id="add-actual" type="button"')+'</div><details '+(csvValue?'open':'')+'><summary>Import actuals from CSV</summary><div class="stack forecast-body">'+field('CSV file','<input type="file" id="actual-file" accept=".csv,text/csv">')+field('CSV text · month,revenue_inr',textarea('csv',csvValue))+
      button('Preview actuals','secondary','id="preview-actual" type="button"')+(preview?'<div class="inset">'+escape(preview.rows.length)+' valid row(s).<p class="error-box">'+escape(preview.errors.join('\n'))+'</p></div>'+(!preview.errors.length?button('Add previewed rows','secondary','id="commit-actual" type="button"'):''):'')+'</div></details></section>'+
      '<section class="card stack"><h2>Evidence references</h2><p class="muted">Record pilot records, supplier quotes, interviews or links alongside the period they cover.</p>'+
      plan.evidence.map((e,i)=>'<div class="formrow inset">'+field('Reference label',input('evidence:'+i+':label',e.label,'text','required maxlength="100"'))+field('Period',input('evidence:'+i+':period',e.period,'text','required maxlength="100"'))+field('Reference or summary',textarea('evidence:'+i+':detail',e.detail,'required maxlength="1000"'))+button('Remove','link','type="button" data-remove-evidence="'+i+'"')+'</div>').join('')+
      '<div class="row">'+button('Add reference','secondary','id="add-evidence" type="button"')+'</div></section><div class="row">'+button('Submit pitch','lime','type="submit"')+button('Save draft','secondary','id="save-draft" type="button"')+'</div></form>','events',plan.title||'Draft');
    const form=document.querySelector('#draft');
    function readPlan(){
      const data=formObject(form);
      for(const k of ['title','industry','stage','geography','launch'])plan[k]=data[k];
      plan.target=data.target===''?null:Number(data.target);
      for(const f of defs){
        for(const k of ['base','downside','upside','kind','source','period']){
          const value=data['driver:'+f.key+':'+k];
          plan.drivers[f.key][k]=['base','downside','upside'].includes(k)?value===''?null:Number(value):value;
        }
      }
      plan.calendar=calValues(data,plan.calendar);
      plan.actuals=plan.actuals.map((_,i)=>({month:data['actual:'+i+':month'],revenue:data['actual:'+i+':revenue']===''?null:Number(data['actual:'+i+':revenue'])}));
      plan.evidence=plan.evidence.map((_,i)=>Object.fromEntries(['label','detail','period'].map(k=>[k,data['evidence:'+i+':'+k]])));
      if(csvValue!==data.csv)preview=null;
      csvValue=data.csv;
    }
    form.oninput=e=>{if(e.target.name==='model')return;if(e.target.name==='csv'){csvValue=e.target.value;preview=null;document.querySelector('#commit-actual')?.remove();return;}readPlan();schedule();};
    form.elements.launch.onchange=()=>{readPlan();draw();};
    form.elements.model.onchange=e=>{
      readPlan();plan.model=e.target.value;plan.drivers=structuredClone(modelData.plans[plan.model].drivers);draw();schedule();
    };
    const modify=fn=>{readPlan();fn();draw();schedule();};
    document.querySelector('#add-actual').onclick=()=>modify(()=>{
      if(!plan.launch){plan.actuals.push({month:'',revenue:null});return;}
      const exists=new Set(plan.actuals.map(a=>a.month));let offset=-1;
      while(exists.has(monthOffset(plan.launch,offset)))offset--;
      plan.actuals.push({month:monthOffset(plan.launch,offset),revenue:null});
    });
    document.querySelector('#add-evidence').onclick=()=>modify(()=>plan.evidence.push({label:'',period:'',detail:''}));
    form.querySelectorAll('[data-remove-actual]').forEach(b=>b.onclick=()=>modify(()=>plan.actuals.splice(Number(b.dataset.removeActual),1)));
    form.querySelectorAll('[data-remove-evidence]').forEach(b=>b.onclick=()=>modify(()=>plan.evidence.splice(Number(b.dataset.removeEvidence),1)));
    document.querySelector('#actual-file').onchange=e=>attempt(async()=>{const file=e.target.files[0];if(!file)return;if(file.size>150000)throw new Error('CSV exceeds 150 KB.');form.elements.csv.value=await file.text();csvValue=form.elements.csv.value;preview=null;document.querySelector('#commit-actual')?.remove();});
    document.querySelector('#preview-actual').onclick=()=>attempt(async()=>{readPlan();await flush();preview=await api(routePath+'/actuals',{csv:csvValue,revision,plan});draw();});
    const commit=document.querySelector('#commit-actual');
    if(commit)commit.onclick=()=>modify(()=>{
      plan.actuals=[...new Map([...plan.actuals,...preview.rows].map(a=>[a.month,a])).values()].sort((a,b)=>a.month.localeCompare(b.month));
      preview=null;csvValue='';
    });
    document.querySelector('#preview-forecast').onclick=()=>attempt(async()=>{
      readPlan();
      const preview=await api(routePath+'/preview',{plan});
      const area=document.querySelector('#draft-forecast');area.className='card stack section';area.innerHTML=forecastPreview(preview);
    });
    document.querySelector('#save-draft').onclick=()=>attempt(async()=>{readPlan();await flush();notify('Draft saved.');});
    bindForm('draft',async()=>{readPlan();schedule();await flush();const result=await api(routePath+'/submit',{revision});d.version=result.version;location.hash='project/'+d.id+'/'+result.version;notify('Submission v'+result.version+' recorded.');});
  }
  draw();
}
async function project(id,version){
  const data=await api('/project/'+id+(version?'?version='+version:''));
  if(home.user.role==='team'&&data.editable&&!version)renderDraft(data);
  else if(data.forecast)renderForecast(data,version);
  else frame(heading('No submission',data.event,'A team submission is needed before a forecast is available.',link('Back to events','#events')));
}
const benchmarkColumns='key,industry,geography,stage,metric,definition,unit,statistic,value,publisher,url,table,period,population,retrieved,limitations,sample';
async function organizer(){
  const d=await api('/admin');
  const judges=d.users.filter(u=>u.role==='judge').map(u=>[u.id,u.name]);
  const teams=d.users.filter(u=>u.role==='team').map(u=>[u.id,u.name]);
  const form=(id,title,contents,cta)=>'<form id="'+id+'" class="card stack"><h2>'+title+'</h2>'+contents+button(cta,'','type="submit"')+'</form>';
  const standard=[['customers','Customer evidence',25],['economics','Unit economics',25],['growth','Feasibility of growth assumptions',20],['execution','Execution plan',20],['risks','Understanding of risks',10]].map(([key,label,weight])=>({key,label,weight}));
  const localDate=value=>value?new Date(Date.parse(value)+330*60000).toISOString().slice(0,16):'';
  const eventEditor=e=>field('Deadline · IST',input('deadline',localDate(e?.deadline),'datetime-local','required'))+
    '<details><summary>Rubric weights</summary>'+field('Rubric JSON · weights must total 100',textarea('rubric',JSON.stringify(e?.rubric??standard,null,2)))+'</details>';
  const assignmentControls=s=>{
    const available=judges.filter(([id])=>!s.judges.includes(id));
    const assigned=s.judges.map(id=>button('Remove '+(judges.find(j=>j[0]===id)?.[1]??'judge'),'secondary','type="button" data-project="'+escape(s.id)+'" data-unassign="'+escape(id)+'"')).join(' ');
    const add=available.length?'<form class="row" id="assign-'+escape(s.id)+'">'+field('Judge',select('judge',available))+button('Assign judge','','type="submit"')+'</form>':'';
    return assigned+add||'Create a judge account below.';
  };
  function teamControls(s){
    return '<form class="stack" id="marks-'+escape(s.id)+'">'+field('Admin marks / 100',input('marks',s.marks??'','number','min="0" max="100" step="1" placeholder="Unscored"'))+button('Save marks','secondary','type="submit"')+'</form><div class="row">'+pill(s.disqualified?'Disqualified':'Eligible')+button(s.disqualified?'Reinstate team':'Disqualify team',s.disqualified?'secondary':'danger','data-eligibility="'+escape(s.owner)+'" data-disqualified="'+String(!s.disqualified)+'"')+'</div>';
  }
  const monitor=teams.flatMap(([owner,name])=>{
    const user=d.users.find(u=>u.id===owner);
    const projects=d.startups.filter(s=>s.owner===owner);
    const account=escape(name)+'<br><small>'+escape(user.email)+'</small>';
    if(!projects.length)return [[account,'—','—',pill('Awaiting assignment'),'—','—']];
    return projects.map(s=>[account,escape(d.events.find(e=>e.id===s.event)?.name),escape(s.title||'Untitled pitch'),
      pill(s.version===null?'Draft':s.submittedRevision===s.revision?'Submitted v'+s.version:'Draft edits after v'+s.version),
      escape(date(s.updated))+' IST',assignmentControls(s),teamControls(s),'<div class="stack">'+button('Inspect draft forecast','secondary','data-inspect="'+escape(s.id)+'"')+(s.version?link('Submitted forecast','#project/'+s.id+'/'+s.version):'')+(d.events[0].locked?button(s.revisionOpen?'Close revision':'Open team revision','secondary','data-window="'+escape(s.id)+'" data-enabled="'+String(!s.revisionOpen)+'"'):'')+'</div>']);
  });
  frame(heading('Admin panel','Emporia 5.0','Manage accounts, deadlines, judging assignments and benchmark snapshots.')+
    '<section class="card stack"><div class="row spread"><h2>Team monitor</h2>'+button('Refresh','secondary','type="button" id="refresh-monitor"')+'</div>'+(monitor.length?table(['Team account','Event','Startup','Submission status','Last draft save','Judges','Marks & eligibility','Pitch controls'],monitor):'<p>No team accounts yet.</p>')+'</section><section id="admin-preview" aria-live="polite"></section><div class="grid two section">' +
    form('new-user','Create a team or judge account',field('Name',input('name','','text','required'))+field('Email',input('email','','email','required'))+
      field('Role',select('role',[['team','Team'],['judge','Judge']],'team'))+field('Temporary password',input('password','','password','required minlength="10" maxlength="200"')),'Create account')+
    '<div class="card stack"><h2>Account access</h2>'+table(['Account','Role','Access'],d.users.filter(u=>u.role!=='organizer').map(u=>[escape(u.name)+'<br><small>'+escape(u.email)+'</small>',escape(u.role),button(u.disabled?'Reactivate':'Deactivate','secondary','data-account-status="'+escape(u.id)+'" data-disabled="'+String(!u.disabled)+'"')]))+'</div></div>'+
    '<section class="section stack"><h2>Event settings</h2><div class="grid two">'+d.events.map(e=>'<article class="card stack"><div class="row spread"><h3>'+escape(e.name)+'</h3>'+pill(e.locked?'Locked':'Open')+'</div><p>Deadline '+escape(date(e.deadline))+' IST</p>'+
      '<small>'+escape(d.snapshots.find(s=>s.id===e.snapshot_id)?.title??'No benchmark snapshot')+'</small>'+
      (e.locked?'<form id="reopen-'+escape(e.id)+'" class="stack">'+field('New deadline · IST',input('deadline','','datetime-local','required'))+button('Reopen submissions','','type="submit"')+'</form>':'<details><summary>Edit event</summary><form class="stack forecast-body" id="edit-'+escape(e.id)+'">'+eventEditor(e)+button('Save event','','type="submit"')+'</form></details>'+
      (d.snapshots.some(s=>s.approved)?'<form class="stack" id="snapshot-'+escape(e.id)+'">'+field('Approved snapshot',select('id',d.snapshots.filter(s=>s.approved).map(s=>[s.id,s.title]),e.snapshot_id))+button('Set snapshot','secondary','type="submit"')+'</form>':'')+
      button('Lock submissions','danger','type="button" data-lock="'+escape(e.id)+'"'))+link('Compare pitches','#compare/'+e.id)+'</article>').join('')+'</div></section>'+
    '<section class="section stack"><h2>Benchmark snapshots</h2><div class="card stack">'+d.snapshots.map(s=>'<details><summary>'+escape(s.title)+' · '+s.data.length+' records · '+(s.approved?'Approved':'Pending review')+'</summary><div class="grid two forecast-body">'+s.data.map(benchmarkCard).join('')+'</div>'+(!s.approved?button('Approve snapshot','secondary','type="button" data-approve="'+escape(s.id)+'"'):'')+'</details>').join('')+'</div><form class="card stack" id="benchmark-form"><h3>Import benchmarks</h3>'+
    field('Snapshot name',input('title','','text','required'))+field('CSV file','<input type="file" id="benchmark-file" accept=".csv,text/csv">')+field('CSV text',textarea('csv',benchmarkColumns+'\n','required'))+
    '<div class="row">'+button('Preview records','secondary','id="benchmark-preview" type="button"')+button('Import for review','','type="submit" id="benchmark-import" disabled')+'</div><div id="benchmark-results" class="stack"></div></form></section><details class="section card"><summary>Reset Emporia 5.0</summary><form class="stack section" id="reset-event"><p>This reopens submissions and clears pitches, versions, assignments, scores, notes and private scenarios. A backup is saved on the host laptop first. Event rubric, benchmarks and admin access are retained.</p>'+
    field('Roster after reset',select('mode',[['keep','Keep accounts and give each team a blank pitch'],...(d.singleEvent?[['clear','Remove all team and judge accounts']]:[])]))+
    field('New deadline · IST',input('deadline','','datetime-local','required'))+field('Admin password',input('adminPassword','','password','required autocomplete="current-password"'))+
    field('Type RESET EMPORIA 5.0',input('confirmation','','text','required'))+button('Back up and reset event','danger','type="submit"')+'</form></details><section class="section card"><h2>Recent admin activity</h2>'+table(['Time · IST','Admin','Action','Record'],d.activity.map(a=>[escape(date(a.created)),escape(a.name),escape(a.action),escape(a.subject)]))+'</section>','organizer');
  document.querySelector('#refresh-monitor').onclick=()=>attempt(()=>route());
  const update=async(data,message)=>{await api('/admin',data);await route();notify(message);};
  const eventData=(data,id)=>({action:'event',id,name:data.name,deadline:data.deadline+'+05:30',rubric:JSON.parse(data.rubric)});
  bindForm('reset-event',async(data,form)=>{
    const submit=form.querySelector('button[type="submit"]');submit.disabled=true;
    try{
      const r=await api('/admin',{...data,action:'reset',deadline:data.deadline+'+05:30',requestId:d.resetToken});
      await route();window.alert('Event reset. Backup on the host laptop: '+r.backup);
    }finally{submit.disabled=false;}
  });
  bindForm('new-user',data=>update({...data,action:'user'},'Account created.'));
  for(const s of d.startups)bindForm('marks-'+s.id,data=>update({action:'marks',id:s.owner,marks:data.marks===''?null:Number(data.marks)},'Admin marks saved.'));
  document.querySelectorAll('[data-eligibility]').forEach(b=>b.onclick=()=>attempt(async()=>{
    const team=d.users.find(u=>u.id===b.dataset.eligibility);
    const disqualified=b.dataset.disqualified==='true';
    if(window.confirm((disqualified?'Disqualify ':'Reinstate ')+team.name+' for Emporia 5.0?'))await update({action:'eligibility',id:team.id,disqualified},disqualified?'Team disqualified.':'Team reinstated.');
  }));
  for(const startup of d.startups)bindForm('assign-'+startup.id,data=>update({action:'assign',id:startup.id,judge:data.judge},'Judge assigned.'));
  document.querySelectorAll('[data-unassign]').forEach(b=>b.onclick=()=>attempt(()=>update({action:'assign',id:b.dataset.project,judge:b.dataset.unassign,remove:true},'Judge removed.')));
  document.querySelectorAll('[data-inspect]').forEach(b=>b.onclick=()=>attempt(async()=>{
    const data=await api('/project/'+b.dataset.inspect+'/preview',{});
    const area=document.querySelector('#admin-preview');area.className='card section stack';
    area.innerHTML='<strong>'+escape(d.startups.find(s=>s.id===b.dataset.inspect).title)+'</strong>'+forecastPreview(data);
    area.scrollIntoView({block:'start'});
  }));
  document.querySelectorAll('[data-window]').forEach(b=>b.onclick=()=>attempt(()=>update({action:'revision-window',id:b.dataset.window,enabled:b.dataset.enabled==='true'},'Team submission access updated.')));
  document.querySelectorAll('[data-account-status]').forEach(b=>b.onclick=()=>attempt(async()=>{
    if(window.confirm(b.textContent+' this account?'))await update({action:'account-status',id:b.dataset.accountStatus,disabled:b.dataset.disabled==='true'},'Account access updated.');
  }));
  for(const e of d.events){
    bindForm('reopen-'+e.id,data=>update({action:'reopen',eventId:e.id,deadline:data.deadline+'+05:30'},'Submissions reopened.'));
    bindForm('edit-'+e.id,data=>update(eventData(data,e.id),'Event saved.'));
    bindForm('snapshot-'+e.id,data=>update({...data,action:'snapshot',eventId:e.id},'Snapshot set.'));
  }
  document.querySelectorAll('[data-lock]').forEach(b=>b.onclick=()=>attempt(async()=>{
    if(window.confirm('Lock this event? Teams will no longer be able to edit or submit, and assigned judges will see submitted pitches.'))await update({action:'lock',eventId:b.dataset.lock},'Submissions locked.');
  }));
  document.querySelectorAll('[data-approve]').forEach(b=>b.onclick=()=>attempt(()=>update({action:'approve',id:b.dataset.approve},'Snapshot approved.')));
  const bf=document.querySelector('#benchmark-form');
  const bi=document.querySelector('#benchmark-import');
  bf.elements.csv.oninput=()=>{bi.disabled=true;};
  document.querySelector('#benchmark-file').onchange=e=>attempt(async()=>{
    const file=e.target.files[0];if(!file)return;
    if(file.size>150000)throw new Error('CSV exceeds 150 KB.');
    bf.elements.csv.value=await file.text();bi.disabled=true;
  });
  document.querySelector('#benchmark-preview').onclick=()=>attempt(async()=>{
    const csv=bf.elements.csv.value;
    const preview=await api('/admin',{action:'preview',csv});
    if(bf.elements.csv.value!==csv)return;
    document.querySelector('#benchmark-results').innerHTML='<p>'+preview.rows.length+' valid record(s)</p><p class="error-box">'+escape(preview.errors.join('\n'))+'</p>'+preview.rows.slice(0,20).map(benchmarkCard).join('');
    bi.disabled=preview.errors.length>0;
  });
  bindForm('benchmark-form',async data=>{if(!bi.disabled)await update({...data,action:'import'},'Snapshot saved for review.');});
}
async function route(){
  const current=++generation;
  try{
    await cleanup();
    const [profile,schema]=await Promise.all([api('/home'),modelData??api('/schema')]);
    if(current!==generation)return;
    home=profile;modelData=schema;
    const [page,id,version]=location.hash.slice(1).split('/');
    if(page==='project'&&/^[\w-]+$/.test(id))await project(id,/^\d{1,9}$/.test(version)?version:undefined);
    else if(page==='compare'&&/^[\w-]+$/.test(id))await comparison(id);
    else if(page==='evidence')await catalogue();
    else if(page==='organizer'&&home.user.role==='organizer')await organizer();
    else events();
  }catch(error){
    if(current!==generation)return;
    if(error.status===401){login();return;}
    if(document.querySelector('#draft')){history.replaceState(null,'',displayedHash||'#events');notify(error.message,true);return;}
    if(home)frame(heading('Page unavailable','VentureCheck',error.message,link('Back to events','#events')));
    else app.textContent=error.message;
  }
}
window.addEventListener('hashchange',route);
route();
