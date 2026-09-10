import {
  DEFAULT_REVENUE_TARGET, DEFAULT_CYCLE_DAYS, datePlusDays, detectDimensionOpportunities,
  detectRegionalOpportunities, normalizeKpis, number, pct, periodShift, projectProgress,
  sourceLineage, summarizeProjects
} from './estrategia-core.js';

const $ = id => document.getElementById(id);
function icons(){const run=()=>{try{window.lucide?.createIcons({attrs:{'stroke-width':1.9}})}catch{}};if('requestIdleCallback' in window)requestIdleCallback(run,{timeout:450});else setTimeout(run,30)}
window.addEventListener('pmg-lucide-ready',icons);
function emptyState(icon,message,cta){return `<div class="empty-state"><i data-lucide="${icon}"></i><p>${message}</p>${cta?`<button class="btn small" ${cta.attrs}>${esc(cta.label)}</button>`:''}</div>`}
let evolutionChart=null,revenueSparkline=null;
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money = value => Number(value || 0).toLocaleString('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0});
const moneyCompact = value => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',notation:'compact',maximumFractionDigits:1}).format(Number(value||0));
const num = value => Number(value || 0).toLocaleString('pt-BR',{maximumFractionDigits:0});
const kg = value => `${Number(value || 0).toLocaleString('pt-BR',{maximumFractionDigits:0})} kg`;
const date = value => value ? new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo'}).format(new Date(`${String(value).slice(0,10)}T12:00:00-03:00`)) : '—';
const nowKey = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const currentMonth = () => nowKey().slice(0,7);
function quarterOf(monthKey){const m=/^(\d{4})-(\d{2})$/.exec(String(monthKey||''));if(!m)return null;const q=Math.ceil(Number(m[2])/3);return `${m[1]}-Q${q}`}
function quarterRange(quarterKey){const m=/^(\d{4})-Q([1-4])$/.exec(String(quarterKey||''));if(!m)return null;const year=Number(m[1]);const start=(Number(m[2])-1)*3+1;return {de:`${year}-${String(start).padStart(2,'0')}`,ate:`${year}-${String(start+2).padStart(2,'0')}`}}
function currentQuarter(){return quarterOf(currentMonth())}
function quarterLabel(quarterKey){const m=/^(\d{4})-Q([1-4])$/.exec(String(quarterKey||''));return m?`${m[2]}º Tri/${m[1]}`:String(quarterKey||'—')}
function monthLabel(monthKey){const m=/^(\d{4})-(\d{2})$/.exec(String(monthKey||''));return m?`${m[2]}/${m[1]}`:String(monthKey||'—')}
function periodLabel(period){return /^\d{4}-Q[1-4]$/.test(String(period||''))?quarterLabel(period):monthLabel(period)}
function periodRange(period){if(period&&typeof period==='object'&&period.de&&period.ate)return period;return quarterRange(period)||{de:period,ate:period}}

const state = {
  db:null, session:null, profile:null, collaborators:[], persistenceAvailable:true,
  view:'executivo', period:'', compare:null, periods:[], target:DEFAULT_REVENUE_TARGET,
  config:null, commercial:null, generatedOpportunities:[], savedOpportunities:[],
  projects:[], actions:[], measurements:[], reviews:[], selectedProjectId:null,
  opFilter:'all', presentationIndex:0, slides:[], sourceErrors:{}, presentationStage:'visao', periodMode:'trimestral',
  compareMode:'auto', customComparePeriod:null,
};

function toast(message,type='ok'){
  const el=$('toast'); el.textContent=message; el.className=`toast ${type==='error'?'error':''}`; el.hidden=false;
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.hidden=true,5000);
}
function setSourceStatus(ok,text){const el=$('sourceStatus');el.classList.toggle('ok',ok===true);el.classList.toggle('error',ok===false);el.querySelector('span:last-child').textContent=text;}
function warning(message=''){const el=$('globalWarning');el.hidden=!message;el.innerHTML=message;}
function safeJson(value,fallback={}){try{return typeof value==='string'?JSON.parse(value):value||fallback}catch{return fallback}}
function healthLabel(value){return ({atingido:'Atingido',no_ritmo:'No ritmo',atencao:'Atenção',em_risco:'Em risco',abaixo:'Abaixo da meta'})[value]||value}
function statusText(value){return ({planejamento:'Planejamento',ativo:'Ativo',em_risco:'Em risco',atingido:'Atingido',encerrado:'Encerrado',cancelado:'Cancelado',pendente:'Pendente',andamento:'Em andamento',bloqueada:'Bloqueada',concluida:'Concluída',cancelada:'Cancelada'})[value]||String(value||'—').replaceAll('_',' ')}

async function getClient(){
  const response=await fetch('/api/notificar-demandas?config=1',{cache:'no-store',headers:{Accept:'application/json'}});
  const body=await response.json().catch(()=>({}));
  if(!response.ok||!body.supabaseUrl||!body.supabaseAnonKey) throw new Error(body.erro||'Configuração do Supabase indisponível.');
  return window.supabase.createClient(body.supabaseUrl,body.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
}

async function bootstrapAuth(){
  state.db=await getClient();
  const {data,error}=await state.db.auth.getSession();
  if(error) throw error;
  if(!data?.session){location.replace(`/index.html?next=${encodeURIComponent(location.pathname+location.search)}`);return false}
  state.session=data.session;
  const result=await state.db.from('colaboradores').select('id,nome,cargo,role,ativo,auth_user_id').eq('auth_user_id',data.session.user.id).maybeSingle();
  if(result.error) throw result.error;
  state.profile=result.data;
  if(!state.profile?.ativo) throw new Error('Seu perfil PMG não está ativo.');
  $('userName').textContent=state.profile.nome||data.session.user.email||'Conta PMG';
  $('userRole').textContent=state.profile.cargo||'PMG';
  $('userAvatar').textContent=String(state.profile.nome||'P').trim().charAt(0).toUpperCase();
  return true;
}

function regionalBase(){
  if(['localhost','127.0.0.1'].includes(location.hostname)) return `${location.origin}/api`;
  return 'http://localhost:3001/api';
}

// 130s: o endpoint de sinais de clientes roda uma consulta pesada direto no
// SQL Server (varre dbo.Vendas do período), com timeout próprio de 120s no
// pool (src/lib/db.js) — o cliente precisa esperar mais que isso pra deixar
// o erro real do SQL aparecer, em vez de abortar antes com uma mensagem
// genérica ("signal is aborted without reason").
async function regionalApi(path,params={}){
  const u=new URL(`${regionalBase()}${path}`);
  Object.entries(params).forEach(([key,value])=>{if(value!==''&&value!==null&&value!==undefined)u.searchParams.set(key,String(value))});
  const controller=new AbortController(); const timer=setTimeout(()=>controller.abort(),130000);
  try{
    const response=await fetch(u,{cache:'no-store',mode:'cors',signal:controller.signal,headers:{Accept:'application/json',Authorization:`Bearer ${state.session.access_token}`}});
    const text=await response.text(); let body=null; try{body=text?JSON.parse(text):null}catch{throw new Error(`A API comercial devolveu resposta inválida em ${path}.`)}
    if(!response.ok) throw new Error(body?.message||body?.erro||`HTTP ${response.status}`);
    if(body?.error) throw new Error(body.error?.message||body.error);
    return Array.isArray(body)?body:(Array.isArray(body?.data)?body.data:Array.isArray(body?.rows)?body.rows:body?.data??body??[]);
  } finally {clearTimeout(timer)}
}

function periodFromRow(row){
  const direct=String(row?.periodo||row?.ano_mes||row?.mes_ano||row?.value||'').trim();
  if(/^\d{4}-\d{2}$/.test(direct))return direct;
  if(row?.ano&&row?.mes)return `${row.ano}-${String(row.mes).padStart(2,'0')}`;
  if(/^\d{4}-\d{2}/.test(String(row)))return String(row).slice(0,7);
  return null;
}

let availableMonths=[];

async function loadPeriods(){
  let rows=[];
  try{rows=await regionalApi('/periodos-distintos')}catch(error){state.sourceErrors.Períodos=error.message}
  availableMonths=[...new Set((Array.isArray(rows)?rows:[]).map(periodFromRow).filter(Boolean))].sort();
  rebuildPeriodOptions();
}

// Troca a lista de períodos entre trimestres e meses sem precisar rebuscar
// /periodos-distintos de novo (availableMonths já tem os meses com dado).
// Tenta preservar o trimestre/mês correspondente ao que estava selecionado
// ao trocar de granularidade, caindo no mais recente se não achar.
function rebuildPeriodOptions(){
  const trimestral=state.periodMode==='trimestral';
  const previousRange=state.period?periodRange(state.period):null;
  const options=trimestral
    ? [...new Set(availableMonths.map(quarterOf).filter(Boolean))].sort()
    : availableMonths.slice();
  state.periods=options.length?options:[trimestral?currentQuarter():currentMonth()];
  const matching=previousRange&&state.periods.find(p=>{const r=periodRange(p);return r.de<=previousRange.de&&r.ate>=previousRange.de});
  state.period=matching||state.periods.at(-1);
  const select=$('periodSelect');select.innerHTML=state.periods.slice().reverse().map(p=>`<option value="${p}" ${p===state.period?'selected':''}>${periodLabel(p)}</option>`).join('');
  const otherPeriods=state.periods.filter(p=>p!==state.period);
  if(!otherPeriods.includes(state.customComparePeriod))state.customComparePeriod=otherPeriods.at(-1)||null;
  $('compareCustomSelect').innerHTML=otherPeriods.slice().reverse().map(p=>`<option value="${p}" ${p===state.customComparePeriod?'selected':''}>${periodLabel(p)}</option>`).join('');
  const range=periodRange(state.period);
  state.compare=resolveComparison(range);
}
function resolveComparison(range){
  if(state.compareMode==='custom'&&state.customComparePeriod)return periodRange(state.customComparePeriod);
  return periodShift(range.de,range.ate);
}

function filtersForPeriod(period,extra={}){const range=periodRange(period);return {p_de:range.de,p_ate:range.ate,...extra}}
async function dimension(dimension,period,metrica='Valor',extra={}){return regionalApi('/agregado-por-dimensao',{p_dimensao:dimension,p_metrica:metrica,p_limit:80,...filtersForPeriod(period,extra)})}

// Janela "ano completo até o último mês fechado" pra comparar 2025 x 2026 de
// forma justa: mês corrente costuma estar incompleto, então comparar
// setembro/2026 parcial contra setembro/2025 inteiro infla queda artificial.
function yoyRanges(){
  const [y,m]=currentMonth().split('-').map(Number); const pad=n=>String(n).padStart(2,'0');
  const endMonth=m>1?m-1:12; const endYear=m>1?y:y-1;
  return {
    current:{de:`${endYear}-01`,ate:`${endYear}-${pad(endMonth)}`,label:`Jan–${pad(endMonth)}/${endYear}`},
    previous:{de:`${endYear-1}-01`,ate:`${endYear-1}-${pad(endMonth)}`,label:`Jan–${pad(endMonth)}/${endYear-1}`},
  };
}
function yoyDimensionDelta(currentRows,previousRows,limit=3){
  const curMap=new Map((currentRows||[]).map(r=>[r.chave,number(r.total)]));
  const prevMap=new Map((previousRows||[]).map(r=>[r.chave,number(r.total)]));
  const rows=[...new Set([...curMap.keys(),...prevMap.keys()])].map(chave=>{
    const cur=curMap.get(chave)||0,prev=prevMap.get(chave)||0;
    const delta=prev>0?((cur-prev)/prev*100):(cur>0?null:0);
    return {chave,cur,prev,delta};
  });
  const comparable=rows.filter(r=>r.prev>0);
  return {rows,growing:[...comparable].sort((a,b)=>b.delta-a.delta).slice(0,limit),falling:[...comparable].sort((a,b)=>a.delta-b.delta).slice(0,limit)};
}
function deltaText(delta){return delta==null?'novo':`${delta>=0?'▲ +':'▼ '}${delta.toFixed(1)}%`}
function yoyRankingList(bucket,formatTotal){
  const seen=new Set();
  return [...bucket.growing,...bucket.falling].filter(r=>seen.has(r.chave)?false:(seen.add(r.chave),true)).map(r=>[r.chave,`${deltaText(r.delta)} · ${formatTotal(r.cur)}`]);
}
async function loadYoyBreakdown(){
  const {current,previous}=yoyRanges();
  const tasks=[
    ()=>regionalApi('/kpis',filtersForPeriod(current)), ()=>regionalApi('/kpis',filtersForPeriod(previous)),
    ()=>dimension('Regiao',current), ()=>dimension('Regiao',previous),
    ()=>dimension('Segmento',current), ()=>dimension('Segmento',previous),
    ()=>dimension('Grupo',current),
  ];
  const names=['KPIs período atual','KPIs período anterior','Região atual','Região anterior','Segmento atual','Segmento anterior','Grupo atual'];
  const results=await runWithConcurrency(tasks,3);
  const errors=[];
  const values=results.map((r,i)=>{if(r.status==='fulfilled')return r.value;errors.push(`${names[i]}: ${r.reason?.message||r.reason}`);return []});
  const [kpisCurRows,kpisPrevRows,regiaoCur,regiaoPrev,segmentoCur,segmentoPrev,grupoCur]=values;
  state.yoy={
    current,previous,errors,
    kpisCur:normalizeKpis(Array.isArray(kpisCurRows)?kpisCurRows[0]:kpisCurRows),
    kpisPrev:normalizeKpis(Array.isArray(kpisPrevRows)?kpisPrevRows[0]:kpisPrevRows),
    regiao:yoyDimensionDelta(regiaoCur,regiaoPrev),
    segmento:yoyDimensionDelta(segmentoCur,segmentoPrev),
    grupo:(Array.isArray(grupoCur)?grupoCur:[]).slice(0,6),
  };
  return state.yoy;
}

// As consultas do dashboard regional varrem o snapshot comercial inteiro por
// requisição; 10 delas ao mesmo tempo competem pelo mesmo processo Node de
// thread única e podem levar minutos combinadas. Limitar quantas rodam de
// verdade em paralelo reduz essa disputa (o cache de 5min em cada endpoint
// cuida do resto: só a primeira troca de período/filtro sente essa espera).
async function runWithConcurrency(tasks,limit){
  const results=new Array(tasks.length); let next=0;
  async function worker(){
    while(next<tasks.length){
      const index=next++;
      try{results[index]={status:'fulfilled',value:await tasks[index]()}}
      catch(error){results[index]={status:'rejected',reason:error}}
    }
  }
  await Promise.all(Array.from({length:Math.min(limit,tasks.length)},worker));
  return results;
}

async function loadCommercial(){
  const period=state.period||currentQuarter(); const range=periodRange(period); const comparison=resolveComparison(range); state.compare=comparison;
  setSourceStatus(null,'Atualizando dados');
  for(const key of ['KPIs atuais','KPIs anteriores','Cidades atuais','Cidades anteriores','Grupos atuais','Grupos anteriores','Fornecedores atuais','Fornecedores anteriores','Evolução','Clientes']) delete state.sourceErrors[key];
  const currentFilters=filtersForPeriod(period); const previousFilters=comparison?{p_de:comparison.de,p_ate:comparison.ate}:currentFilters;
  const tasks=[
    ()=>regionalApi('/kpis',currentFilters), ()=>regionalApi('/kpis',previousFilters),
    ()=>regionalApi('/agregado-cidades',currentFilters), ()=>regionalApi('/agregado-cidades',previousFilters),
    ()=>dimension('Grupo',range), ()=>dimension('Grupo',comparison||range),
    ()=>dimension('Fornecedor',range), ()=>dimension('Fornecedor',comparison||range),
    ()=>regionalApi('/evolucao-mensal',{}),
    ()=>regionalApi('/estrategia-clientes',{p_de:range.de,p_ate:range.ate}),
  ];
  const names=['KPIs atuais','KPIs anteriores','Cidades atuais','Cidades anteriores','Grupos atuais','Grupos anteriores','Fornecedores atuais','Fornecedores anteriores','Evolução','Clientes'];
  const results=await runWithConcurrency(tasks,3);
  const values=results.map((r,i)=>{if(r.status==='fulfilled')return r.value;state.sourceErrors[names[i]]=r.reason?.message||String(r.reason);return []});
  const [kpisRows,previousKpisRows,cities,previousCities,groups,previousGroups,suppliers,previousSuppliers,evolution,customerSignals]=values;
  const kpis=normalizeKpis(Array.isArray(kpisRows)?kpisRows[0]:kpisRows);
  const previousKpis=normalizeKpis(Array.isArray(previousKpisRows)?previousKpisRows[0]:previousKpisRows);
  if(customerSignals?.summary){kpis.n_clientes=number(customerSignals.summary.currentCustomers);previousKpis.n_clientes=number(customerSignals.summary.previousCustomers)}
  state.commercial={period,comparison,kpis,previousKpis,cities,previousCities,groups,previousGroups,suppliers,previousSuppliers,evolution,customerSignals,capturedAt:new Date().toISOString()};
  const customerOps=(customerSignals?.opportunities||[]).map((item,index)=>({
    id:`cliente:${item.type||'sinal'}:${item.customerId||index}`,kind:'cliente',title:item.title||item.customerName||'Oportunidade de cliente',scopeLabel:[item.customerName,item.city,item.uf].filter(Boolean).join(' · '),score:number(item.score)||50,
    description:item.description||'Sinal comercial baseado no comportamento histórico do cliente.',
    evidence:[{label:'Faturamento atual',current:number(item.currentRevenue),previous:number(item.previousRevenue)}],
    suggestedGoal:item.type==='reativacao'?15:10,source:'SQL Server · dbo.Vendas + dbo.Clientes',filters:{p_cliente:item.customerId||null,p_cidade:item.city||null,p_uf:item.uf||null},metadata:item
  }));
  state.generatedOpportunities=[
    ...detectRegionalOpportunities(cities,previousCities,{minRevenue:50000,max:9}),
    ...detectDimensionOpportunities(groups,previousGroups,'categoria',{minRevenue:100000,max:8}),
    ...detectDimensionOpportunities(suppliers,previousSuppliers,'fornecedor',{minRevenue:100000,max:8}),
    ...customerOps,
  ].sort((a,b)=>b.score-a.score);
  const failed=results.filter(r=>r.status==='rejected').length;
  setSourceStatus(failed===0,failed===0?'Dados comerciais atualizados':`${failed} fonte(s) indisponível(is)`);
  $('freshnessText').textContent=`Leitura ${new Intl.DateTimeFormat('pt-BR',{timeStyle:'short'}).format(new Date())} · ${periodLabel(period)}`;
  const errors=Object.entries(state.sourceErrors);
  if(errors.length)warning(`<strong>Leitura parcial.</strong> ${errors.map(([k,v])=>`${esc(k)}: ${esc(v)}`).join(' · ')}`);
  else if(!state.persistenceAvailable)warning('<strong>Análise comercial disponível em modo leitura.</strong> Execute <code>sql/28-PLANEJAMENTO-ESTRATEGICO.sql</code> no Supabase PMG para habilitar projetos, ações, medições e fechamentos.');
  else warning('');
  renderAll();
}

async function loadPersistence(){
  const db=state.db;
  try{
    const [config,collaborators,opportunities,projects,actions,measurements,reviews]=await Promise.all([
      db.from('estrategia_config').select('*').eq('id',1).maybeSingle(),
      db.from('colaboradores').select('id,nome,cargo,role,ativo').eq('ativo',true).order('nome'),
      db.from('estrategia_oportunidades').select('*').order('criado_em',{ascending:false}).limit(300),
      db.from('estrategia_projetos').select('*').order('criado_em',{ascending:false}).limit(300),
      db.from('estrategia_acoes').select('*').order('ordem').order('criado_em').limit(2000),
      db.from('estrategia_medicoes').select('*').order('medido_em',{ascending:false}).order('criado_em',{ascending:false}).limit(2500),
      db.from('estrategia_revisoes').select('*').order('criado_em',{ascending:false}).limit(500),
    ]);
    const firstError=[config,collaborators,opportunities,projects,actions,measurements,reviews].find(x=>x.error)?.error;
    if(firstError)throw firstError;
    state.config=config.data||null; state.target=number(config.data?.meta_faturamento)||DEFAULT_REVENUE_TARGET;
    state.collaborators=collaborators.data||[];state.savedOpportunities=opportunities.data||[];state.projects=projects.data||[];state.actions=actions.data||[];state.measurements=measurements.data||[];state.reviews=reviews.data||[];
    state.persistenceAvailable=true;
  }catch(error){
    state.persistenceAvailable=false; state.sourceErrors['Planejamento estratégico']=error.message||String(error);
    if(/estrategia_|schema cache|does not exist|relation/i.test(String(error.message||error))) warning('<strong>O frontend estratégico está instalado, mas as tabelas ainda não existem no Supabase.</strong> Execute <code>sql/28-PLANEJAMENTO-ESTRATEGICO.sql</code> para habilitar projetos, ações, medições e fechamentos. A análise comercial continua funcionando em modo leitura.');
    else warning(`<strong>Persistência estratégica indisponível.</strong> ${esc(error.message||error)}`);
  }
  populateCollaborators();
}

function populateCollaborators(){
  const options=['<option value="">Sem responsável</option>',...state.collaborators.map(c=>`<option value="${c.id}">${esc(c.nome)}${c.cargo?` · ${esc(c.cargo)}`:''}</option>`)].join('');
  $('actionOwner').innerHTML=options;
}

function metricDelta(current,previous,formatter){const d=pct(current,previous);const compareLabel=state.compareMode==='custom'&&state.customComparePeriod?`vs. ${periodLabel(state.customComparePeriod)}`:'vs. anterior';return `<div class="value">${formatter(current)}</div>${d==null?'':`<div class="foot"><span class="delta ${d>=0?'up':'down'}">${d>=0?'▲':'▼'} ${Math.abs(d).toFixed(1)}%</span><span>${compareLabel}</span></div>`}`}
function evolutionSeries(){
  const rows=Array.isArray(state.commercial?.evolution)?state.commercial.evolution:[];
  const agg=new Map(); rows.forEach(r=>{const p=`${r.ano}-${String(r.mes).padStart(2,'0')}`;agg.set(p,(agg.get(p)||0)+number(r.valor))});
  return [...agg.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-18);
}
function renderKpis(){
  const c=state.commercial;if(!c)return;
  const current=c.kpis,prev=c.previousKpis;
  const cards=[
    ['Faturamento',current.total_valor,prev.total_valor,money,true],['Volume',current.total_kg,prev.total_kg,kg],['Clientes positivados',current.n_clientes,prev.n_clientes,num],['Pedidos',current.n_pedidos,prev.n_pedidos,num],['Ticket médio',current.ticket_medio,prev.ticket_medio,money],['Cidades atendidas',current.n_cidades,prev.n_cidades,num],['Fornecedores ativos',current.n_fornecedores,prev.n_fornecedores,num]
  ];
  $('kpiGrid').innerHTML=cards.map(([label,cur,old,fmt,spark])=>`<article class="kpi"><div class="label">${label}</div>${metricDelta(cur,old,fmt)}${spark?'<canvas class="kpi-spark" id="kpiSparkFaturamento" height="28"></canvas>':''}</article>`).join('');
  renderRevenueSparkline();
  const ratio=state.target>0?current.total_valor/state.target:0; const percentage=Math.max(0,Math.min(999,ratio*100));
  $('targetHero').textContent=moneyCompact(state.target);$('heroRevenue').textContent=money(current.total_valor);$('heroGap').textContent=money(Math.max(0,state.target-current.total_valor));$('goalPct').textContent=`${percentage.toFixed(1)}%`;
  animateRing(ratio);
}
let ringRatio=0;
function animateRing(target){
  const start=ringRatio,delta=target-start,duration=650,t0=performance.now();
  function step(now){
    const t=Math.min(1,(now-t0)/duration); const eased=1-Math.pow(1-t,3); const value=start+delta*eased;
    $('goalRing').style.background=`conic-gradient(var(--green-dark) ${Math.max(0,Math.min(360,value*360))}deg,#e7ebe6 0deg)`;
    if(t<1)requestAnimationFrame(step); else ringRatio=target;
  }
  requestAnimationFrame(step);
}
function renderRevenueSparkline(){
  const canvas=$('kpiSparkFaturamento');if(!canvas||!window.Chart)return;
  const series=evolutionSeries(); const values=series.map(([,v])=>v);
  revenueSparkline?.destroy();
  revenueSparkline=new Chart(canvas,{type:'line',data:{labels:series.map(([p])=>p),datasets:[{data:values,borderColor:'#2d7a4f',borderWidth:2,tension:.35,pointRadius:0,fill:true,backgroundColor:'rgba(45,122,79,.1)'}]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:500},scales:{x:{display:false},y:{display:false}},plugins:{legend:{display:false},tooltip:{enabled:false}},elements:{line:{borderJoinStyle:'round'}}}});
}

function latestMeasurementsMap(){
  const map=new Map();
  [...state.measurements].sort((a,b)=>String(b.medido_em||b.criado_em).localeCompare(String(a.medido_em||a.criado_em))).forEach(m=>{const key=String(m.projeto_id);if(!map.has(key))map.set(key,m)});
  return map;
}
function renderExecutivePortfolio(){
  const map=latestMeasurementsMap(); const summary=summarizeProjects(state.projects,map);
  $('activeProjects').textContent=num(summary.active);$('projectsOnTarget').textContent=num(summary.achieved + Math.max(0,summary.active-summary.risk-summary.attention-summary.below-summary.achieved));$('projectsRisk').textContent=num(summary.risk+summary.attention+summary.below);$('committedPotential').textContent=money(summary.committedPotential);
}

function renderEvolution(){
  const data=evolutionSeries();
  $('evolutionEmpty').hidden=data.length>0;
  const canvas=$('evolutionChart');if(!canvas||!window.Chart)return;
  evolutionChart?.destroy();
  if(!data.length)return;
  evolutionChart=new Chart(canvas,{type:'bar',data:{labels:data.map(([p])=>`${p.slice(5)}/${p.slice(2,4)}`),datasets:[{data:data.map(([,v])=>v),backgroundColor:'#2d7a4f',hoverBackgroundColor:'#173d2a',borderRadius:6,maxBarThickness:34}]},options:{responsive:true,maintainAspectRatio:false,animation:{duration:550,easing:'easeOutCubic'},scales:{x:{grid:{display:false},ticks:{font:{size:10},color:'#6d766f'}},y:{grid:{color:'#e9ece7'},ticks:{font:{size:10},color:'#6d766f',callback:v=>moneyCompact(v)}}},plugins:{legend:{display:false},tooltip:{callbacks:{label:ctx=>money(ctx.parsed.y)}}}}});
}

function opportunityTypeLabel(op){return ({regional:'Região',categoria:'Categoria',produto:'Produto',fornecedor:'Fornecedor',cliente:'Cliente',manual:'Manual'})[op.kind||op.tipo]||'Oportunidade'}
function evidenceHtml(op){
  const ev=op.evidence||safeJson(op.evidencias,[]); if(!Array.isArray(ev))return '';
  return `<div class="evidence">${ev.map(item=>`<div class="evidence-row"><span>${esc(item.label||'Indicador')}</span><strong>${/kg/i.test(item.label||'')?kg(item.current):money(item.current)}${item.previous!=null?` · antes ${/kg/i.test(item.label||'')?kg(item.previous):money(item.previous)}`:''}</strong></div>`).join('')}</div>`;
}
function opportunityCard(op,saved=false){
  const filters=op.filters||safeJson(op.filtros,{}); const score=number(op.score);
  return `<article class="opportunity-card" data-kind="${esc(op.kind||op.tipo||'manual')}"><header><span class="type-label">${opportunityTypeLabel(op)}</span>${score?`<span class="score-badge">score ${score.toFixed(0)}</span>`:''}</header><h3>${esc(op.title||op.titulo)}</h3><p>${esc(op.description||op.descricao||'')}</p>${evidenceHtml(op)}<footer>${saved?'':`<button class="btn small" data-save-op="${esc(op.id)}" type="button">Salvar sinal</button>`}<button class="btn primary small" data-project-op="${esc(op.id)}" data-saved="${saved?'1':'0'}" type="button">Criar plano de ação</button>${filters&&Object.keys(filters).length?`<span class="micro">${esc(Object.values(filters).filter(Boolean).join(' · '))}</span>`:''}</footer></article>`;
}
function savedAsOp(row){return {id:row.id,kind:row.tipo,key:row.chave,title:row.titulo,description:row.descricao,score:row.score,filters:safeJson(row.filtros,{}),evidence:safeJson(row.evidencias,[]),saved:true,sourceRow:row}}
function allOpportunities(){return [...state.generatedOpportunities,...state.savedOpportunities.map(savedAsOp)]}
function renderOpportunities(){
  let list=state.opFilter==='saved'?state.savedOpportunities.map(savedAsOp):state.generatedOpportunities;
  if(!['all','saved'].includes(state.opFilter))list=list.filter(op=>(op.kind||op.tipo)===state.opFilter);
  $('opportunityGrid').innerHTML=list.length?list.map(op=>opportunityCard(op,!!op.saved)).join(''):emptyState('search-x','Nenhuma oportunidade encontrada neste filtro.');
  const top=state.generatedOpportunities.slice(0,4);$('opportunityMiniList').innerHTML=top.length?top.map(op=>`<div class="mini-op"><div><strong>${esc(op.title)}</strong><p>${esc(op.description)}</p></div><span class="score-badge">${op.score.toFixed(0)}</span></div>`).join(''):emptyState('sparkles','Sem sinais suficientes no período.');
}

function projectLatest(project){return latestMeasurementsMap().get(String(project.id))?.indicadores||null}
function projectHealth(project){return projectProgress({...project,baseline:safeJson(project.baseline,{})},safeJson(projectLatest(project),{}))}
function renderProjectStrip(){
  const rows=state.projects.filter(p=>!['encerrado','cancelado'].includes(p.status)).slice(0,6);
  $('projectStrip').innerHTML=rows.length?rows.map(p=>{const progress=projectHealth(p);return `<div class="project-mini"><header><strong>${esc(p.titulo)}</strong><span class="health ${progress.health}">${healthLabel(progress.health)}</span></header><p>${esc(p.objetivo||'')}</p><div class="progress-track"><i style="width:${Math.max(0,Math.min(100,progress.actualProgress*100))}%"></i></div></div>`}).join(''):emptyState('folder-kanban','Ainda não há projetos estratégicos. Transforme uma oportunidade em plano de ação.',{attrs:'data-go="oportunidades"',label:'Ver oportunidades'});
}
function renderProjectList(){
  const list=$('projectList');
  if(!state.projects.length){list.innerHTML=emptyState('folder-plus','Nenhum projeto criado.');$('projectDetail').innerHTML=`<div class="empty large">${emptyState('folder-plus','Transforme uma oportunidade em projeto ou crie um projeto manual.',{attrs:'data-new-project',label:'+ Novo projeto'})}</div>`;return}
  if(!state.selectedProjectId||!state.projects.some(p=>String(p.id)===String(state.selectedProjectId)))state.selectedProjectId=state.projects[0].id;
  list.innerHTML=state.projects.map(p=>{const pr=projectHealth(p);return `<article class="project-card ${String(p.id)===String(state.selectedProjectId)?'active':''}" data-project-id="${p.id}"><span class="type-label">${statusText(p.status)}</span><h3>${esc(p.titulo)}</h3><div class="progress-track"><i style="width:${Math.max(0,Math.min(100,pr.actualProgress*100))}%"></i></div><div class="meta"><span>${date(p.inicio)} → ${date(p.fim)}</span><span class="health ${pr.health}">${healthLabel(pr.health)}</span></div></article>`}).join('');
  renderProjectDetail();
}
function collaboratorName(id){return state.collaborators.find(c=>String(c.id)===String(id))?.nome||'Sem responsável'}
function renderProjectDetail(){
  const project=state.projects.find(p=>String(p.id)===String(state.selectedProjectId));if(!project)return;
  const baseline=normalizeKpis(safeJson(project.baseline,{})); const latest=safeJson(projectLatest(project),{});const current=Object.keys(latest).length?normalizeKpis(latest):baseline; const progress=projectHealth(project);
  const actions=state.actions.filter(a=>String(a.projeto_id)===String(project.id));
  $('projectDetail').innerHTML=`<div class="project-detail-head"><div><span class="card-kicker">${esc(statusText(project.status))}</span><h2>${esc(project.titulo)}</h2><p class="objective">${esc(project.objetivo||'')}</p></div><span class="health ${progress.health}">${healthLabel(progress.health)}</span></div>
  <div class="baseline-grid"><div class="mini-stat"><span>Baseline faturamento</span><strong>${money(baseline.total_valor)}</strong></div><div class="mini-stat"><span>Baseline kg</span><strong>${kg(baseline.total_kg)}</strong></div><div class="mini-stat"><span>Baseline pedidos</span><strong>${num(baseline.n_pedidos)}</strong></div><div class="mini-stat"><span>Baseline ticket</span><strong>${money(baseline.ticket_medio)}</strong></div></div>
  <div class="detail-kpis"><div class="mini-stat"><span>Meta principal</span><strong>${project.meta_tipo==='percentual'?`${number(project.meta_valor).toFixed(1)}%`:money(project.meta_valor)}</strong></div><div class="mini-stat"><span>Resultado atual</span><strong>${project.meta_tipo==='percentual'?`${progress.delta.toFixed(1)}%`:money(progress.currentValue)}</strong></div><div class="mini-stat"><span>Tempo do ciclo</span><strong>${Math.round(progress.timeProgress*100)}%</strong></div><div class="mini-stat"><span>Escopo</span><strong>${esc(scopeLabel(safeJson(project.filtros,{})))}</strong></div></div>
  <div class="actions-head"><div><h3>Plano de ação integrado</h3><span class="micro">${actions.length} ação(ões)</span></div><div><button class="btn small" data-measure-project="${project.id}" type="button">Medir agora</button> <button class="btn primary small" data-add-action="${project.id}" type="button">+ Ação</button> <button class="btn small" data-review-project="${project.id}" type="button">Fechar ciclo</button></div></div>
  <div class="action-list">${actions.length?actions.map(actionRow).join(''):emptyState('list-plus','Adicione ações de Comercial, Logística, Marketing, Compras, Financeiro e demais áreas envolvidas.')}</div>`;
}
function scopeLabel(filters={}){return [filters.p_cidade,filters.p_uf,filters.p_grupo,filters.p_fornecedor].filter(Boolean).join(' · ')||'Operação inteira'}
function actionRow(a){return `<div class="action-row"><span class="department">${esc(a.departamento)}</span><div class="action-copy"><strong>${esc(a.titulo)}</strong><small>${esc(statusText(a.status))}${a.prazo?` · prazo ${date(a.prazo)}`:''}</small></div><span class="action-owner">${esc(collaboratorName(a.responsavel_id))}</span><div class="action-buttons"><button class="btn small" data-edit-action="${a.id}" type="button">Editar</button>${a.tarefa_id?`<a class="btn small" href="/demandas.html?tarefa=${encodeURIComponent(a.tarefa_id)}">Demanda ↗</a>`:`<button class="btn small" data-demand-action="${a.id}" type="button">Criar demanda</button>`}</div></div>`}

function renderTracking(){
  const active=state.projects.filter(p=>!['encerrado','cancelado'].includes(p.status)); const latestMap=latestMeasurementsMap();const summary=summarizeProjects(active,latestMap);
  $('trackingSummary').innerHTML=[['Projetos ativos',summary.active],['Atingidos',summary.achieved],['Em risco',summary.risk+summary.below],['Atenção',summary.attention]].map(([label,value])=>`<div class="mini-stat"><span>${label}</span><strong>${num(value)}</strong></div>`).join('');
  $('trackingGrid').innerHTML=active.length?active.map(p=>{const pr=projectHealth(p);const list=state.measurements.filter(m=>String(m.projeto_id)===String(p.id)).sort((a,b)=>String(a.medido_em).localeCompare(String(b.medido_em))).slice(-3);return `<article class="tracking-card"><header><div><span class="type-label">${esc(p.meta_indicador)}</span><h3>${esc(p.titulo)}</h3><span class="dates">${date(p.inicio)} → ${date(p.fim)}</span></div><span class="health ${pr.health}">${healthLabel(pr.health)}</span></header><div class="cycle-line"><div class="cycle-step"><span>Baseline</span><strong>${formatProjectMetric(p,normalizeKpis(safeJson(p.baseline,{})))}</strong></div>${[0,1,2].map((i)=>`<div class="cycle-step"><span>Medição ${i+1}</span><strong>${list[i]?formatProjectMetric(p,normalizeKpis(safeJson(list[i].indicadores,{}))):'—'}</strong></div>`).join('')}</div><div class="tracking-footer"><div><span class="micro">Resultado atual</span><strong>${p.meta_tipo==='percentual'?` ${pr.delta.toFixed(1)}%`:formatProjectMetric(p,normalizeKpis(projectLatest(p)||{}))}</strong></div><button class="btn small" data-measure-project="${p.id}" type="button">Medir período atual</button></div></article>`}).join(''):emptyState('activity','Nenhum projeto ativo para acompanhar.');
}
function formatProjectMetric(project,k){if(project.meta_indicador==='kg')return kg(k.total_kg);if(project.meta_indicador==='pedidos')return num(k.n_pedidos);if(project.meta_indicador==='clientes')return num(k.n_clientes);if(project.meta_indicador==='ticket')return money(k.ticket_medio);return money(k.total_valor)}
function renderReviews(){
  const rows=state.reviews.map(r=>({...r,project:state.projects.find(p=>String(p.id)===String(r.projeto_id))}));
  $('reviewGrid').innerHTML=rows.length?rows.map(r=>`<article class="review-card"><span class="type-label">${r.resultado==='atingido'?'Atingido':r.resultado==='parcial'?'Parcial':'Não atingido'}</span><h3>${esc(r.project?.titulo||'Projeto')}</h3><div class="review-section"><span>Funcionou</span><p>${esc(r.funcionou||'—')}</p></div><div class="review-section"><span>Não funcionou</span><p>${esc(r.nao_funcionou||'—')}</p></div><div class="review-section"><span>Gargalos</span><p>${esc(r.gargalos||'—')}</p></div><div class="review-section"><span>Próximo passo</span><p>${esc(r.proximo_passo||'—')}</p></div></article>`).join(''):emptyState('flag','Nenhum fechamento registrado.');
}

function renderAll(){if(state.commercial)renderKpis();renderExecutivePortfolio();if(state.commercial)renderEvolution();renderOpportunities();renderProjectStrip();renderProjectList();renderTracking();renderReviews();icons()}

function switchView(view){state.view=view;document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===view));document.querySelectorAll('.view').forEach(x=>x.classList.toggle('active',x.dataset.viewPanel===view));const labels={executivo:['Estratégia 200M','Visão executiva'],oportunidades:['Dados → decisão','Oportunidades'],projetos:['Execução integrada','Projetos estratégicos'],acompanhamento:['Ciclo de 90 dias','Acompanhamento'],revisoes:['Aprendizado','Fechamentos']};$('viewEyebrow').textContent=labels[view][0];$('viewTitle').textContent=labels[view][1];$('viewCrumb').textContent=labels[view][1];$('contextBar').hidden=!['executivo','oportunidades'].includes(view);$('strategyNav').classList.remove('open');history.replaceState(null,'',`${location.pathname}?view=${view}`)}

function findGenerated(id){return state.generatedOpportunities.find(op=>op.id===id)}
function findSaved(id){const row=state.savedOpportunities.find(op=>String(op.id)===String(id));return row?savedAsOp(row):null}
async function saveGeneratedOpportunity(id){
  if(!state.persistenceAvailable)return toast('Execute o SQL 28 para habilitar a persistência estratégica.','error'); const op=findGenerated(id);if(!op)return;
  const range=periodRange(state.period);
  const row={tipo:op.kind,chave:op.key,titulo:op.title,descricao:op.description,origem:'motor_deterministico',regra_id:op.rule,score:op.score,filtros:op.filters,evidencias:op.evidence,status:'nova',periodo_de:range.de,periodo_ate:range.ate,criado_por:state.profile.id,atualizado_por:state.profile.id};
  const {data,error}=await state.db.from('estrategia_oportunidades').insert(row).select().single();if(error)throw error;state.savedOpportunities.unshift(data);renderOpportunities();toast('Oportunidade salva com rastreabilidade.');return data;
}
function openManualOpportunity(){
  $('opportunityForm').reset();$('oppType').value='regional';$('opportunityDialogTitle').textContent='Registrar oportunidade manual';$('opportunityDialog').showModal();
}
async function saveManualOpportunity(){
  if(!state.persistenceAvailable)throw new Error('Execute o SQL 28 antes de salvar oportunidades.');
  const filters={};if($('oppCity').value.trim())filters.p_cidade=$('oppCity').value.trim();if($('oppUf').value.trim())filters.p_uf=$('oppUf').value.trim().toUpperCase();if($('oppGroup').value.trim())filters.p_grupo=$('oppGroup').value.trim();if($('oppSupplier').value.trim())filters.p_fornecedor=$('oppSupplier').value.trim();
  const range=periodRange(state.period);
  const row={tipo:$('oppType').value,chave:$('oppKey').value.trim()||$('oppTitle').value.trim(),titulo:$('oppTitle').value.trim(),descricao:$('oppDescription').value.trim(),origem:'manual',regra_id:null,score:null,filtros:filters,evidencias:[],status:'nova',periodo_de:range.de,periodo_ate:range.ate,criado_por:state.profile.id,atualizado_por:state.profile.id};
  const {data,error}=await state.db.from('estrategia_oportunidades').insert(row).select().single();if(error)throw error;state.savedOpportunities.unshift(data);renderOpportunities();toast('Oportunidade registrada.');
}

function openProjectDialog(op=null){
  $('projectForm').reset(); const today=nowKey();$('projectStart').value=today;$('projectEnd').value=datePlusDays(today,DEFAULT_CYCLE_DAYS);$('projectIndicator').value='faturamento';$('projectGoalType').value='percentual';$('projectGoal').value='20';$('projectGoalUnit').value='%';$('projectOpportunityId').value=op?.saved?op.id:'';
  $('projectTitle').value=op?.title||'';$('projectObjective').value=op?`Transformar a oportunidade “${op.title}” em crescimento mensurável durante o ciclo de 90 dias.`:'';
  const f=op?.filters||{};$('projectCustomerId').value=f.p_cliente||'';$('projectCity').value=f.p_cidade||'';$('projectUf').value=f.p_uf||'';$('projectGroup').value=f.p_grupo||'';$('projectSupplier').value=f.p_fornecedor||'';$('baselinePreview').textContent=`Baseline será capturado no período ${periodLabel(state.period)} a partir do PMG Bridge.`;$('projectDialog').showModal();
}
function projectFiltersFromForm(){const f={};if($('projectCustomerId').value.trim())f.p_cliente=$('projectCustomerId').value.trim();if($('projectCity').value.trim())f.p_cidade=$('projectCity').value.trim();if($('projectUf').value.trim())f.p_uf=$('projectUf').value.trim().toUpperCase();if($('projectGroup').value.trim())f.p_grupo=$('projectGroup').value.trim();if($('projectSupplier').value.trim())f.p_fornecedor=$('projectSupplier').value.trim();return f}
function metricEndpoint(filters={},indicator='faturamento'){return filters.p_cliente||indicator==='clientes'?'/estrategia-clientes':'/kpis'}
async function captureKpis(filters={},indicator='faturamento'){
  const range=periodRange(state.period);
  if(filters.p_cliente||indicator==='clientes'){
    const body=await regionalApi('/estrategia-clientes',{p_de:range.de,p_ate:range.ate,p_cliente:filters.p_cliente,p_cidade:filters.p_cidade,p_uf:filters.p_uf,p_grupo:filters.p_grupo,p_fornecedor:filters.p_fornecedor});
    return normalizeKpis(body?.currentKpis||{});
  }
  const rows=await regionalApi('/kpis',filtersForPeriod(state.period,filters));return normalizeKpis(Array.isArray(rows)?rows[0]:rows);
}
async function createProject(){
  if(!state.persistenceAvailable)throw new Error('Execute o SQL 28 antes de criar projetos.'); const filters=projectFiltersFromForm();const indicator=$('projectIndicator').value;$('baselinePreview').textContent='Capturando baseline real…';const baseline=await captureKpis(filters,indicator);
  const range=periodRange(state.period);
  const lineage=sourceLineage({endpoint:metricEndpoint(filters,indicator),filters,period:{de:range.de,ate:range.ate},note:'Baseline imutável capturado ao criar o projeto estratégico.'});
  const payload={p_oportunidade_id:$('projectOpportunityId').value||null,p_titulo:$('projectTitle').value.trim(),p_objetivo:$('projectObjective').value.trim(),p_inicio:$('projectStart').value,p_fim:$('projectEnd').value,p_meta_indicador:$('projectIndicator').value,p_meta_tipo:$('projectGoalType').value,p_meta_valor:number($('projectGoal').value),p_filtros:filters,p_baseline:baseline,p_lineage:lineage};
  const {data,error}=await state.db.rpc('criar_projeto_estrategico_v1',payload);if(error)throw error;await loadPersistence();state.selectedProjectId=data;renderAll();switchView('projetos');toast('Projeto criado com baseline preservado.');
}

function openAction(projectId,row=null){
  $('actionForm').reset();$('actionProjectId').value=projectId;$('actionId').value=row?.id||'';$('actionDepartment').value=row?.departamento||'Comercial';$('actionOwner').value=row?.responsavel_id||'';$('actionTitle').value=row?.titulo||'';$('actionDescription').value=row?.descricao||'';$('actionDue').value=row?.prazo||'';$('actionStatus').value=row?.status||'pendente';$('actionDialog').showModal();
}
async function saveAction(){
  if(!state.persistenceAvailable)throw new Error('Persistência estratégica indisponível.'); const id=$('actionId').value;const row={projeto_id:$('actionProjectId').value,departamento:$('actionDepartment').value,titulo:$('actionTitle').value.trim(),descricao:$('actionDescription').value.trim()||null,responsavel_id:$('actionOwner').value||null,prazo:$('actionDue').value||null,status:$('actionStatus').value,atualizado_por:state.profile.id};
  let result;if(id)result=await state.db.from('estrategia_acoes').update(row).eq('id',id).select().single();else result=await state.db.from('estrategia_acoes').insert({...row,criado_por:state.profile.id}).select().single();if(result.error)throw result.error;await loadPersistence();renderAll();toast('Ação salva.');
}
async function createDemand(actionId){
  const {data,error}=await state.db.rpc('criar_demanda_estrategica_v1',{p_acao_id:actionId});if(error)throw error;await loadPersistence();renderAll();toast('Demanda criada e vinculada ao plano de ação.');return data;
}
async function measureProject(projectId){
  const project=state.projects.find(p=>String(p.id)===String(projectId));if(!project)throw new Error('Projeto não encontrado.');const filters=safeJson(project.filtros,{});const kpis=await captureKpis(filters,project.meta_indicador);const range=periodRange(state.period);const lineage=sourceLineage({endpoint:metricEndpoint(filters,project.meta_indicador),filters,period:{de:range.de,ate:range.ate},note:'Medição manual do projeto no período selecionado.'});
  const row={projeto_id:project.id,medido_em:nowKey(),marco:'manual',periodo_de:range.de,periodo_ate:range.ate,indicadores:kpis,lineage,criado_por:state.profile.id};const {error}=await state.db.from('estrategia_medicoes').insert(row);if(error)throw error;await loadPersistence();renderAll();toast(`Medição registrada para ${periodLabel(state.period)}.`);
}
function openReview(projectId){$('reviewForm').reset();$('reviewProjectId').value=projectId;$('reviewDialog').showModal()}
async function saveReview(){
  const projectId=$('reviewProjectId').value;const row={projeto_id:projectId,resultado:$('reviewResult').value,funcionou:$('reviewWorked').value.trim()||null,nao_funcionou:$('reviewFailed').value.trim()||null,gargalos:$('reviewBottlenecks').value.trim()||null,proximo_passo:$('reviewNext').value.trim()||null,criado_por:state.profile.id};const {error}=await state.db.from('estrategia_revisoes').insert(row);if(error)throw error;const status=row.resultado==='atingido'?'atingido':'encerrado';const update=await state.db.from('estrategia_projetos').update({status,atualizado_por:state.profile.id}).eq('id',projectId);if(update.error)throw update.error;await loadPersistence();renderAll();toast('Fechamento do ciclo registrado.');
}

function presentationData(){
  const c=state.commercial||{kpis:normalizeKpis({}),previousKpis:normalizeKpis({}),evolution:[]};const latest=latestMeasurementsMap();const summary=summarizeProjects(state.projects,latest);const topOps=state.generatedOpportunities.slice(0,4);const active=state.projects.filter(p=>!['encerrado','cancelado'].includes(p.status)).slice(0,5);const selected=active[0]||state.projects[0]||null;const actions=selected?state.actions.filter(a=>String(a.projeto_id)===String(selected.id)):[];
  const yoy=state.yoy||{current:{label:'—'},previous:{label:'—'},kpisCur:normalizeKpis({}),kpisPrev:normalizeKpis({}),regiao:{growing:[],falling:[]},segmento:{growing:[],falling:[]},grupo:[]};
  return {c,summary,topOps,active,selected,actions,target:state.target,period:periodLabel(state.period),yoy};
}
// Placeholder de setor: a apresentação 1 hoje só tem dado real de Comercial
// (via SQL Server/PMG Bridge). Logística, Marketing, Financeiro e Compras
// ainda não têm fonte integrada aqui — em vez de inventar número, a área
// preenche na hora da reunião. Quando cada fonte for definida, estes slides
// passam a ler dado real do mesmo jeito que o slide Comercial já lê.
function placeholderSectorSlide(kicker,area,indicadores){
  return {kicker,title:`${area} — dados do setor`,subtitle:`Espaço reservado para a equipe de ${area} apresentar os indicadores do período nesta reunião.`,columns:indicadores.map(label=>[label,'A apresentar pela área'])};
}

function buildOverviewSlides(){
  const d=presentationData();const y=d.yoy;
  const growthValor=pct(y.kpisCur.total_valor,y.kpisPrev.total_valor);const growthKg=pct(y.kpisCur.total_kg,y.kpisPrev.total_kg);
  return [
    {kind:'cover',kicker:'PMG · Planejamento Estratégico · Apresentação 1 de 2',title:'2025 → 2026: onde crescemos, onde caímos',subtitle:`Faturamento e peso comparados ano a ano, por região e por segmento. Período: ${y.current.label} contra ${y.previous.label}.`},
    {kicker:'01 · Faturamento e peso',title:'O ano em números, lado a lado',metrics:[['Faturamento '+y.previous.label,money(y.kpisPrev.total_valor)],['Faturamento '+y.current.label,money(y.kpisCur.total_valor)],['Variação de faturamento',growthValor==null?'—':deltaText(growthValor)],['Peso '+y.previous.label,kg(y.kpisPrev.total_kg)],['Peso '+y.current.label,kg(y.kpisCur.total_kg)],['Variação de peso',growthKg==null?'—':deltaText(growthKg)]],subtitle:'Base: mesmos meses fechados nos dois anos, para uma comparação justa.'},
    placeholderSectorSlide('02 · Meta 2026','Meta 2026',['Meta de faturamento no ano','Meta de peso (kg) no ano','Gap até o momento','Iniciativas para fechar a conta']),
    {kicker:'03 · Por região',title:'Onde crescemos e onde caímos por região',list:yoyRankingList(y.regiao,money),subtitle:'3 maiores crescimentos e 3 maiores quedas em faturamento, região com base comparável nos dois anos.'},
    {kicker:'04 · Por segmento',title:'Onde crescemos e onde caímos por segmento',list:yoyRankingList(y.segmento,money),subtitle:'Mesmo recorte, agora por segmento de cliente.'},
    {kicker:'05 · O que isso exige',title:'Toda queda vira plano de ação, todo crescimento vira replicação',subtitle:'Nenhuma dessas variações se resolve sozinha. As próximas seções mostram quem somos hoje e o que vendemos — a Apresentação 2 transforma cada sinal em oportunidade priorizada, com responsável e prazo.'},
    {kicker:'06 · O que somos hoje',title:'A fotografia atual da operação',metrics:[['Faturamento no período',money(y.kpisCur.total_valor)],['Clientes positivados',num(y.kpisCur.n_clientes)],['Cidades atendidas',num(y.kpisCur.n_cidades)],['Pedidos',num(y.kpisCur.n_pedidos)],['Ticket médio',money(y.kpisCur.ticket_medio)],['Fornecedores ativos',num(y.kpisCur.n_fornecedores)]],subtitle:`Período: ${y.current.label}.`},
    {kicker:'07 · O que vendemos',title:'O mix de produtos que sustenta o faturamento',list:y.grupo.map(r=>[r.chave,money(r.total)]),subtitle:`Principais categorias por faturamento em ${y.current.label}.`},
    placeholderSectorSlide('08 · Próximas estratégias','Estratégia',['Onde dobrar a aposta','Onde corrigir rota','Onde reduzir investimento','Prioridade dos próximos 90 dias']),
    {kicker:'09 · Próximo passo',title:'Com o retrato de hoje em mãos, seguimos para oportunidades',subtitle:'A Apresentação 2 traz os sinais comerciais identificados nos dados e o plano de ação por área para os próximos 90 dias.'},
  ];
}

function buildOpportunityActionSlides(){
  const d=presentationData();const selectedProgress=d.selected?projectHealth(d.selected):null;
  return [
    {kind:'cover',kicker:'PMG · Planejamento Estratégico · Apresentação 2 de 2',title:'Oportunidades e plano de ação',subtitle:`A partir do retrato atual, para onde crescemos e o que cada área assume nos próximos 90 dias. Período-base: ${d.period}.`},
    {kicker:'01 · Oportunidades',title:'Sinais comerciais que merecem investigação',list:d.topOps.map(op=>[op.title,`Score ${op.score.toFixed(0)} · ${opportunityTypeLabel(op)}`]),subtitle:'Sinais baseados em comparação histórica interna. Não são previsão absoluta de mercado.'},
    {kicker:'02 · Portfólio',title:'Transformando oportunidade em execução',metrics:[['Projetos ativos',num(d.summary.active)],['No ritmo / atingidos',num(d.summary.achieved+Math.max(0,d.summary.active-d.summary.risk-d.summary.attention-d.summary.below-d.summary.achieved))],['Em risco / atenção',num(d.summary.risk+d.summary.attention+d.summary.below)],['Metas de faturamento comprometidas',money(d.summary.committedPotential)]],subtitle:'Cada projeto preserva o baseline e mede o resultado ao longo de 90 dias.'},
    ...(d.selected?[{kicker:'03 · Exemplo de projeto',title:d.selected.titulo,subtitle:d.selected.objetivo,metrics:[['Baseline',formatProjectMetric(d.selected,normalizeKpis(safeJson(d.selected.baseline,{})))],['Meta',d.selected.meta_tipo==='percentual'?`${number(d.selected.meta_valor).toFixed(1)}%`:money(d.selected.meta_valor)],['Resultado atual',d.selected.meta_tipo==='percentual'?`${selectedProgress.delta.toFixed(1)}%`:formatProjectMetric(d.selected,normalizeKpis(projectLatest(d.selected)||{}))],['Status',healthLabel(selectedProgress.health)]]}]:[]),
    {kicker:'04 · Áreas conectadas',title:'O plano de ação é interdepartamental',actions:d.actions.slice(0,8),subtitle:d.selected?`Ações vinculadas ao projeto “${d.selected.titulo}”.`:'Comercial, Logística, Marketing, Compras, Financeiro e Estoque entram conforme a oportunidade.'},
    {kicker:'05 · 90 dias',title:'Executar, medir e corrigir rota',columns:[['Baseline','Fotografia dos indicadores no início.'],['Mês 1','Primeira medição e remoção de bloqueios.'],['Mês 2','Ajustes e reforço do que está performando.'],['Mês 3','Fechamento, aprendizados e decisão de escalar ou recalcular.']]},
    {kicker:'06 · Governança',title:'Um número precisa ter fonte e responsável',columns:[['Dados','Regional e SQL comercial alimentam indicadores.'],['Execução','Ações estratégicas podem virar Demandas.'],['Histórico','Baseline e medições ficam preservados no Supabase.'],['Decisão','Resultado final registra o que funcionou, gargalos e próximo passo.']]},
    {kind:'cover',kicker:'Próxima reunião',title:'Não discutir só o número. Discutir a decisão.',subtitle:'O objetivo é sair com oportunidades priorizadas, responsáveis definidos, prazos e métricas para os próximos 90 dias.'}
  ];
}

function slidesForStage(stage){return stage==='oportunidades'?buildOpportunityActionSlides():buildOverviewSlides()}
function stageLabel(stage){return stage==='oportunidades'?'Etapa 2 de 2 · Oportunidades e plano':'Etapa 1 de 2 · Comparativo 2025×2026'}
function stageFileTag(stage){return stage==='oportunidades'?'Oportunidades_PlanoAcao':'Comparativo_2025x2026'}
function slideHtml(slide){
  if(slide.kind==='cover')return `<section class="slide slide-cover"><span class="slide-kicker">${esc(slide.kicker)}</span><h2>${esc(slide.title)}</h2><p class="slide-sub">${esc(slide.subtitle||'')}</p></section>`;
  return `<section class="slide"><span class="slide-kicker">${esc(slide.kicker)}</span><h2>${esc(slide.title)}</h2>${slide.subtitle?`<p class="slide-sub">${esc(slide.subtitle)}</p>`:''}${slide.metrics?`<div class="slide-metrics">${slide.metrics.map(([l,v])=>`<div class="slide-metric"><span>${esc(l)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`:''}${slide.list?`<div class="slide-list">${slide.list.map(([l,v])=>`<div><strong>${esc(l)}</strong><span>${esc(v)}</span></div>`).join('')}</div>`:''}${slide.columns?`<div class="slide-columns">${slide.columns.map(([l,v])=>`<div class="slide-card"><h3>${esc(l)}</h3><p>${esc(v)}</p></div>`).join('')}</div>`:''}${slide.actions?`<div class="slide-action-table">${slide.actions.length?slide.actions.map(a=>`<div class="slide-action-row"><strong>${esc(a.departamento)}</strong><span>${esc(a.titulo)}</span><span>${esc(collaboratorName(a.responsavel_id))}</span></div>`).join(''):'<p class="slide-sub">As ações serão definidas na reunião para cada departamento envolvido.</p>'}</div>`:''}</section>`}
function goToSlide(index,{initial=false}={}){
  const previous=state.presentationIndex;const clamped=Math.max(0,Math.min(index,state.slides.length-1));
  const back=!initial&&clamped<previous;state.presentationIndex=clamped;
  const el=$('presentationStage');el.innerHTML=slideHtml(state.slides[clamped]);
  if(!initial){const slideEl=el.querySelector('.slide');if(slideEl)slideEl.classList.toggle('slide-back',back)}
  $('presentCounter').textContent=`${clamped+1} / ${state.slides.length}`;
  $('presentPrev').disabled=clamped===0;$('presentNext').disabled=clamped===state.slides.length-1;
  $('presentStagePrev').disabled=clamped===0;$('presentStageNext').disabled=clamped===state.slides.length-1;
  $('presentDots').querySelectorAll('.pt-dot').forEach((dot,i)=>dot.classList.toggle('active',i===clamped));
}
function renderPresentation(){
  state.slides=slidesForStage(state.presentationStage);
  $('presentStageLabel').textContent=stageLabel(state.presentationStage);
  $('presentDots').innerHTML=state.slides.map((_,i)=>`<button type="button" class="pt-dot" data-slide-dot="${i}" aria-label="Ir para o slide ${i+1}"></button>`).join('');
  goToSlide(state.presentationIndex,{initial:true});
}
async function openPresentation(stage){
  state.presentationStage=stage;state.presentationIndex=0;$('presentationDialog').showModal();
  if(stage==='visao'&&!state.yoy){
    $('presentationStage').innerHTML=`<section class="slide slide-cover"><span class="slide-kicker">Carregando</span><h2>Preparando o comparativo 2025 × 2026…</h2><p class="slide-sub">Buscando faturamento, peso, região e segmento do período.</p></section>`;
    try{await loadYoyBreakdown()}catch(error){toast(error.message||String(error),'error')}
  }
  renderPresentation();
}

async function exportPptx(stage){
  if(!window.PptxGenJS)throw new Error('Biblioteca de PowerPoint não carregou. Use o modo Apresentar/Imprimir como alternativa.'); const slides=slidesForStage(stage);const pptx=new window.PptxGenJS();pptx.layout='LAYOUT_WIDE';pptx.author='PMG Connect';pptx.subject='Planejamento Estratégico PMG';pptx.title='PMG Rumo aos R$ 200 milhões';pptx.company='PMG';pptx.lang='pt-BR';
  const C={green:'173D2A',green2:'28613F',ink:'18221C',muted:'657068',line:'DFE4DF',paper:'F7F7F3',gold:'D9C88E',white:'FFFFFF'};
  for(const s of slides){const slide=pptx.addSlide();slide.background={color:s.kind==='cover'?C.green:C.paper};const fg=s.kind==='cover'?C.white:C.ink;slide.addText(s.kicker,{x:.7,y:.55,w:11.8,h:.25,fontSize:9,bold:true,color:s.kind==='cover'?C.gold:C.green2,charSpacing:1.5,margin:0});slide.addText(s.title,{x:.7,y:1.05,w:11.7,h:1.1,fontSize:s.kind==='cover'?34:28,bold:true,color:fg,margin:0,breakLine:false});if(s.subtitle)slide.addText(s.subtitle,{x:.72,y:2.25,w:10.9,h:.75,fontSize:13,color:s.kind==='cover'?'C0CEC5':C.muted,margin:0,breakLine:false});
    if(s.metrics){const cols=3,w=3.75,h=1.08,startY=3.4;s.metrics.forEach(([label,value],i)=>{const x=.7+(i%cols)*4.05,y=startY+Math.floor(i/cols)*1.35;slide.addShape(pptx.ShapeType.rect,{x,y,w,h,fill:{color:C.white},line:{color:C.line}});slide.addText(label,{x:x+.18,y:y+.18,w:w-.36,h:.18,fontSize:8,bold:true,color:C.muted,margin:0});slide.addText(value,{x:x+.18,y:y+.48,w:w-.36,h:.33,fontSize:19,bold:true,color:C.ink,margin:0})})}
    if(s.list){s.list.slice(0,6).forEach(([label,value],i)=>{const y=3.15+i*.55;slide.addText(label,{x:.75,y,w:8.3,h:.28,fontSize:12,bold:true,color:C.ink,margin:0});slide.addText(value,{x:9.2,y,w:3.2,h:.28,fontSize:10,color:C.muted,align:'right',margin:0});slide.addShape(pptx.ShapeType.line,{x:.75,y:y+.38,w:11.65,h:0,line:{color:C.line,width:.6}})})}
    if(s.columns){s.columns.forEach(([label,value],i)=>{const x=.7+(i%2)*6.05,y=3.3+Math.floor(i/2)*1.55;slide.addShape(pptx.ShapeType.rect,{x,y,w:5.65,h:1.25,fill:{color:C.white},line:{color:C.line}});slide.addText(label,{x:x+.2,y:y+.2,w:5.25,h:.28,fontSize:14,bold:true,color:C.ink,margin:0});slide.addText(value,{x:x+.2,y:y+.55,w:5.25,h:.5,fontSize:10,color:C.muted,margin:0})})}
    if(s.actions){s.actions.slice(0,8).forEach((a,i)=>{const y=3.05+i*.48;slide.addText(a.departamento,{x:.75,y,w:2.1,h:.25,fontSize:9,bold:true,color:C.green2,margin:0});slide.addText(a.titulo,{x:2.8,y,w:6.8,h:.25,fontSize:10,color:C.ink,margin:0});slide.addText(collaboratorName(a.responsavel_id),{x:9.7,y,w:2.6,h:.25,fontSize:9,color:C.muted,align:'right',margin:0})})}
    slide.addText('PMG CONNECT',{x:10.95,y:7.05,w:1.7,h:.18,fontSize:7,bold:true,color:s.kind==='cover'?'8FA499':'98A49C',charSpacing:1,margin:0,align:'right'});
  }
  await pptx.writeFile({fileName:`PMG_Planejamento_${stageFileTag(stage)}_${state.period||nowKey()}.pptx`});toast('PowerPoint gerado com os dados atuais.');
}

function bindEvents(){
  document.addEventListener('click',async event=>{const el=event.target.closest('button,[data-project-id],a');if(!el)return;try{
    if(el.matches('.nav-item'))return switchView(el.dataset.view);if(el.dataset.go)return switchView(el.dataset.go);if('newProject' in el.dataset)return openProjectDialog();if(el.dataset.projectId){state.selectedProjectId=el.dataset.projectId;renderProjectList();return}
    if(el.dataset.saveOp){await saveGeneratedOpportunity(el.dataset.saveOp);return}if(el.dataset.projectOp){let op=el.dataset.saved==='1'?findSaved(el.dataset.projectOp):findGenerated(el.dataset.projectOp);if(!op&&el.dataset.saved!=='1'){const saved=await saveGeneratedOpportunity(el.dataset.projectOp);op=saved?savedAsOp(saved):null}openProjectDialog(op);return}
    if(el.dataset.addAction){openAction(el.dataset.addAction);return}if(el.dataset.editAction){openAction(state.actions.find(a=>String(a.id)===String(el.dataset.editAction))?.projeto_id,state.actions.find(a=>String(a.id)===String(el.dataset.editAction)));return}if(el.dataset.demandAction){await createDemand(el.dataset.demandAction);return}if(el.dataset.measureProject){await measureProject(el.dataset.measureProject);return}if(el.dataset.reviewProject){openReview(el.dataset.reviewProject);return}
  }catch(error){console.error(error);toast(error.message||String(error),'error')}});
  document.querySelectorAll('[data-op-filter]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-op-filter]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.opFilter=btn.dataset.opFilter;renderOpportunities()}));
  $('mobileMenu').addEventListener('click',()=>$('strategyNav').classList.toggle('open'));
  $('collapseNavBtn').addEventListener('click',()=>{const collapsed=$('strategyNav').classList.toggle('collapsed');try{localStorage.setItem('pmg_estrategia_nav_collapsed',collapsed?'1':'0')}catch{}});$('refreshBtn').addEventListener('click',async()=>{await loadCommercial();await loadPersistence();renderAll()});$('periodSelect').addEventListener('change',async()=>{state.period=$('periodSelect').value;await loadCommercial()});$('periodModeSelect').addEventListener('change',async()=>{state.periodMode=$('periodModeSelect').value;rebuildPeriodOptions();await loadCommercial()});
  $('compareModeSelect').addEventListener('change',async()=>{state.compareMode=$('compareModeSelect').value;$('compareCustomWrap').hidden=state.compareMode!=='custom';await loadCommercial()});
  $('compareCustomSelect').addEventListener('change',async()=>{state.customComparePeriod=$('compareCustomSelect').value;await loadCommercial()});$('manualOpportunityBtn').addEventListener('click',openManualOpportunity);$('newProjectBtn').addEventListener('click',()=>openProjectDialog());$('presentStage1Btn').addEventListener('click',()=>openPresentation('visao').catch(e=>toast(e.message,'error')));$('presentStage2Btn').addEventListener('click',()=>openPresentation('oportunidades').catch(e=>toast(e.message,'error')));$('presentExportBtn').addEventListener('click',()=>exportPptx(state.presentationStage).catch(e=>toast(e.message,'error')));
  $('projectGoalType').addEventListener('change',()=>{$('projectGoalUnit').value=$('projectGoalType').value==='percentual'?'%':'valor do indicador'});
  $('opportunityForm').addEventListener('submit',async event=>{if(event.submitter?.value==='cancel')return;event.preventDefault();try{await saveManualOpportunity();$('opportunityDialog').close()}catch(e){toast(e.message,'error')}});
  $('projectForm').addEventListener('submit',async event=>{if(event.submitter?.value==='cancel')return;event.preventDefault();const b=event.submitter;b.disabled=true;try{await createProject();$('projectDialog').close()}catch(e){console.error(e);toast(e.message,'error')}finally{b.disabled=false}});
  $('actionForm').addEventListener('submit',async event=>{if(event.submitter?.value==='cancel')return;event.preventDefault();try{await saveAction();$('actionDialog').close()}catch(e){toast(e.message,'error')}});
  $('reviewForm').addEventListener('submit',async event=>{if(event.submitter?.value==='cancel')return;event.preventDefault();try{await saveReview();$('reviewDialog').close()}catch(e){toast(e.message,'error')}});
  const goPrev=()=>goToSlide(state.presentationIndex-1);const goNext=()=>goToSlide(state.presentationIndex+1);
  $('presentPrev').addEventListener('click',goPrev);$('presentNext').addEventListener('click',goNext);
  $('presentStagePrev').addEventListener('click',goPrev);$('presentStageNext').addEventListener('click',goNext);
  $('presentDots').addEventListener('click',e=>{const dot=e.target.closest('[data-slide-dot]');if(dot)goToSlide(Number(dot.dataset.slideDot))});
  $('presentClose').addEventListener('click',()=>$('presentationDialog').close());$('presentPrint').addEventListener('click',()=>window.print());
  document.addEventListener('keydown',e=>{if(!$('presentationDialog').open)return;if(e.key==='ArrowRight')goNext();if(e.key==='ArrowLeft')goPrev();if(e.key==='Escape')$('presentationDialog').close()});
}

function skeletonBlocks(n,cls=''){return Array.from({length:n},()=>`<div class="skeleton ${cls}"></div>`).join('')}
function showLoadingSkeletons(){
  $('opportunityGrid').innerHTML=skeletonBlocks(3,'skel-card');
  $('opportunityMiniList').innerHTML=skeletonBlocks(2,'skel-row');
  $('projectStrip').innerHTML=skeletonBlocks(3,'skel-card');
  $('projectList').innerHTML=skeletonBlocks(3,'skel-row');
  $('trackingGrid').innerHTML=skeletonBlocks(2,'skel-card');
  $('reviewGrid').innerHTML=skeletonBlocks(2,'skel-card');
}
async function init(){
  bindEvents(); icons(); showLoadingSkeletons();
  try{if(localStorage.getItem('pmg_estrategia_nav_collapsed')==='1')$('strategyNav').classList.add('collapsed')}catch{}
  const initial=new URLSearchParams(location.search).get('view');if(['executivo','oportunidades','projetos','acompanhamento','revisoes'].includes(initial))switchView(initial);
  try{const ok=await bootstrapAuth();if(!ok)return;await Promise.all([loadPeriods(),loadPersistence()]);await loadCommercial();renderAll()}catch(error){console.error(error);setSourceStatus(false,'Falha de inicialização');warning(`<strong>Não foi possível iniciar o Planejamento Estratégico.</strong> ${esc(error.message||error)}`);toast(error.message||String(error),'error')}
}
init();
