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
const MONTH_ABBR=['JAN','FEV','MAR','ABR','MAI','JUN','JUL','AGO','SET','OUT','NOV','DEZ'];
function monthLabel(monthKey){const m=/^(\d{4})-(\d{2})$/.exec(String(monthKey||''));return m?`${MONTH_ABBR[Number(m[2])-1]||m[2]}/${m[1]}`:String(monthKey||'—')}
function isCustomRange(period){return typeof period==='string'&&period.startsWith('range:')}
function periodRange(period){
  if(period&&typeof period==='object'&&period.de&&period.ate)return period;
  if(isCustomRange(period)){const [,de,ate]=period.split(':');return {de,ate}}
  return quarterRange(period)||{de:period,ate:period};
}
function periodLabel(period){
  if(isCustomRange(period))return rangeLabel(periodRange(period));
  return /^\d{4}-Q[1-4]$/.test(String(period||''))?quarterLabel(period):monthLabel(period);
}
const EXCLUDED_GROUP_TERMS=['papelaria','embalagem','escritorio','contabilidade','outros','fornecedor','nao selecionado','nao informado'];
const normalizeTerm=value=>String(value||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
function isExcludedGroup(chave){const normalized=normalizeTerm(chave);return EXCLUDED_GROUP_TERMS.some(term=>normalized.includes(term))}
function excludeNonCoreGroups(rows){return (Array.isArray(rows)?rows:[]).filter(row=>!isExcludedGroup(row?.chave))}
// Lista positiva (não negativa) de segmentos de cliente que são food service
// de verdade — bloqueio por termo ("outros", "escritório"...) não é
// suficiente porque dbo.Clientes.Segmento também tem valores completamente
// fora do negócio (ex.: Oficina Mecânica, Imobiliária, Autopeças,
// Transportadora, Farmácia), que nenhuma lista de termos ruins previa.
// Conferido 1:1 contra os 50 valores reais de Segmento no snapshot.
const FOOD_SEGMENTS=new Set([
  'pizzaria','restaurante / cantina','lanchonete / espetinhos / cafeteria','supermercado',
  'panificadora / padaria','mercearia / sacolao / emporio','hamburgueria','bar / chopperia',
  'pastelaria','cozinha industrial','confeitaria','adega','loja de conveniencia','cozinha oriental',
  'hotel / motel / pousada','distribuidor alimentos / bebidas','esfiharia','acougue',
  'buffet / catering','churrascaria','fabrica de massas / salgados / doces','rotisseria',
  'casa noturna','clube / associacao desportiva','ambulante / foodtruck / quiosque',
  'hospital / casa de repouso','instituicao de ensino','dark kitchen','marmitaria','sorveteria',
].map(normalizeTerm));
function isFoodSegment(chave){return FOOD_SEGMENTS.has(normalizeTerm(chave))}
function keepOnlyFoodSegments(rows){return (Array.isArray(rows)?rows:[]).filter(row=>isFoodSegment(row?.chave))}

const state = {
  db:null, session:null, profile:null, collaborators:[], persistenceAvailable:true,
  view:'executivo', period:'', compare:null, periods:[], target:DEFAULT_REVENUE_TARGET,
  config:null, commercial:null, generatedOpportunities:[], savedOpportunities:[],
  rangeSelectMode:false, rangeSelectStart:null,
  projects:[], actions:[], measurements:[], reviews:[], selectedProjectId:null,
  opFilter:'all', presentationIndex:0, slides:[], sourceErrors:{}, presentationStage:'visao', periodMode:'trimestral',
  compareMode:'auto', customComparePeriod:null,
};

function toast(message,type='ok'){
  const el=$('toast'); el.textContent=message; el.className=`toast ${type==='error'?'error':''}`; el.hidden=false;
  clearTimeout(toast.timer); toast.timer=setTimeout(()=>el.hidden=true,5000);
}
function setSourceStatus(ok,text){const el=$('sourceStatus');el.classList.remove('syncing');el.classList.toggle('ok',ok===true);el.classList.toggle('error',ok===false);el.querySelector('span:last-child').textContent=text;}
let snapshotStatusTimer=null;
function renderSnapshotStatus(status){
  const freshness=$('freshnessText'),pill=$('sourceStatus');
  if(!freshness||!pill||!status)return;
  pill.classList.remove('ok','error','syncing');
  if(status.syncing){
    freshness.textContent=`Atualizando dados de hoje… ${Number(status.progress)||0}%${status.message?` · ${status.message}`:''}`;
    pill.classList.add('syncing');pill.querySelector('span:last-child').textContent='Sincronizando';
  }else if(status.stale){
    freshness.textContent=`Mostrando dados de ${date(status.day)} · hoje (${date(status.today)}) ainda n\xE3o sincronizou`;
    pill.classList.add('error');pill.querySelector('span:last-child').textContent='Dados de ontem';
  }else if(status.ready){
    const updated=status.updatedAt?new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit'}).format(new Date(status.updatedAt)):'';
    freshness.textContent=`Dados de hoje (${date(status.day)}) atualizados${updated?` às ${updated}`:''}`;
    pill.classList.add('ok');pill.querySelector('span:last-child').textContent='Dados em dia';
  }else if(status.error){
    freshness.textContent=`Falha ao sincronizar dados de hoje: ${status.message||status.error}`;
    pill.classList.add('error');pill.querySelector('span:last-child').textContent='Erro na sincroniza\xE7\xE3o';
  }else{
    freshness.textContent='Aguardando primeira sincroniza\xE7\xE3o do dia…';
    pill.querySelector('span:last-child').textContent='Preparando dados';
  }
}
async function pollSnapshotStatus(){
  clearTimeout(snapshotStatusTimer);
  try{
    const status=await regionalApi('/dados-diarios',{acao:'status'});
    renderSnapshotStatus(status);
    snapshotStatusTimer=setTimeout(pollSnapshotStatus,status.syncing?5000:status.stale?20000:60000);
  }catch(error){
    snapshotStatusTimer=setTimeout(pollSnapshotStatus,30000);
  }
}
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
  const otherPeriods=state.periods.filter(p=>p!==state.period);
  if(!otherPeriods.includes(state.customComparePeriod))state.customComparePeriod=otherPeriods.at(-1)||null;
  $('compareCustomSelect').innerHTML=otherPeriods.slice().reverse().map(p=>`<option value="${p}" ${p===state.customComparePeriod?'selected':''}>${periodLabel(p)}</option>`).join('');
  const range=periodRange(state.period);
  state.compare=resolveComparison(range);
  syncMainPeriodControls();
  syncPresentPeriodControls();
}
function periodCalendarHTML(cellClass){
  const available=new Set(availableMonths);
  const activeRange=periodRange(state.period);
  const years=[...new Set(availableMonths.map(m=>m.slice(0,4)))].sort();
  if(!years.length)return '<div class="period-calendar-empty">Sem períodos disponíveis.</div>';
  return years.map(year=>{
    const cells=MONTH_ABBR.map((label,i)=>{
      const mm=String(i+1).padStart(2,'0');const val=`${year}-${mm}`;
      const disabled=!available.has(val);
      const active=!disabled&&val>=activeRange.de&&val<=activeRange.ate;
      const pending=!disabled&&val===state.rangeSelectStart;
      return `<button type="button" class="${cellClass}${disabled?' disabled':''}${active?' active':''}${pending?' pending':''}" data-val="${val}" ${disabled?'disabled':''}>${label}</button>`;
    }).join('');
    return `<div class="period-year-row"><div class="period-year-label">${year}</div><div class="period-months">${cells}</div></div>`;
  }).join('');
}
function syncMainPeriodControls(){
  const panel=$('periodPanel');if(!panel)return;
  $('periodTriggerLabel').textContent=state.rangeSelectStart?`${monthLabel(state.rangeSelectStart)} → escolha o fim…`:periodLabel(state.period);
  panel.querySelectorAll('.context-preset-btn[data-mode]').forEach(btn=>btn.classList.toggle('active',btn.dataset.mode==='intervalo'?state.rangeSelectMode:!state.rangeSelectMode&&btn.dataset.mode===state.periodMode));
  panel.querySelectorAll('.context-preset-btn[data-compare]').forEach(btn=>btn.classList.toggle('active',state.compareMode===btn.dataset.compare));
  $('periodCalendar').innerHTML=periodCalendarHTML('context-month-cell');
}
function syncPresentPeriodControls(){
  const panel=$('presentPeriodPanel');if(!panel)return;
  $('presentPeriodLabel').textContent=state.rangeSelectStart?`${monthLabel(state.rangeSelectStart)} → escolha o fim…`:periodLabel(state.period);
  panel.querySelectorAll('.pt-preset-btn[data-mode]').forEach(btn=>btn.classList.toggle('active',btn.dataset.mode==='intervalo'?state.rangeSelectMode:!state.rangeSelectMode&&btn.dataset.mode===state.periodMode));
  panel.querySelectorAll('.pt-preset-btn[data-compare]').forEach(btn=>btn.classList.toggle('active',state.compareMode===btn.dataset.compare));
  $('presentPeriodCalendar').innerHTML=periodCalendarHTML('pt-month-cell');
}
function toggleRangeSelectMode(on){
  state.rangeSelectMode=on;state.rangeSelectStart=null;
  syncMainPeriodControls();syncPresentPeriodControls();
}
// Clique num mês: se estiver no modo Intervalo, o primeiro clique marca o
// início e o segundo marca o fim — o período vira o acumulado entre os
// dois, mesmo atravessando trimestres. Fora do modo Intervalo, um clique só
// aplica direto (mês exato, ou o trimestre inteiro se Trimestral).
function handlePeriodCellClick(val){
  if(state.rangeSelectMode){
    if(!state.rangeSelectStart){state.rangeSelectStart=val;syncMainPeriodControls();syncPresentPeriodControls();return null}
    const de=val<state.rangeSelectStart?val:state.rangeSelectStart;
    const ate=val<state.rangeSelectStart?state.rangeSelectStart:val;
    state.rangeSelectStart=null;
    return de===ate?de:`range:${de}:${ate}`;
  }
  return state.periodMode==='trimestral'?quarterOf(val):val;
}
async function applyPeriodChange({period,periodMode}={}){
  let changed=false;
  if(periodMode&&periodMode!==state.periodMode){state.periodMode=periodMode;changed=true}
  if(period&&period!==state.period){state.period=period;changed=true}
  if(!changed)return false;
  if(period&&isCustomRange(period)){syncMainPeriodControls();syncPresentPeriodControls()}
  else{rebuildPeriodOptions()}
  await loadCommercial();
  await loadYoyBreakdown().catch(error=>{state.sourceErrors['Comparativo do período']=error.message||String(error)});
  return true;
}
// Alterna a régua de comparação (período anterior × mesmo período do ano
// passado), independente do período em si — afeta o quê o período atual é
// comparado com, não qual período está selecionado.
async function applyCompareModeChange(mode){
  if(mode===state.compareMode)return false;
  state.compareMode=mode;
  const sel=$('compareModeSelect');if(sel)sel.value=mode;
  $('compareCustomWrap').hidden=mode!=='custom';
  await loadCommercial();
  await loadYoyBreakdown().catch(error=>{state.sourceErrors['Comparativo do período']=error.message||String(error)});
  syncMainPeriodControls();syncPresentPeriodControls();
  return true;
}
async function changePresentationPeriod({period,periodMode,closePanel=true}={}){
  if(closePanel){$('presentPeriodPanel').hidden=true;$('presentPeriodTrigger').setAttribute('aria-expanded','false')}
  if((periodMode&&periodMode!==state.periodMode)||(period&&period!==state.period)){
    $('presentationStage').innerHTML=`<section class="slide slide-cover"><span class="slide-kicker">Carregando</span><h2>Atualizando período…</h2><p class="slide-sub">Recalculando oportunidades, projetos e indicadores do período.</p></section>`;
  }
  try{const changed=await applyPeriodChange({period,periodMode});if(!changed)return}catch(error){toast(error.message||String(error),'error')}
  renderPresentation();
}
// Comparação anual "proporcional": mesmos meses, ano anterior — jan-ago/2026
// contra jan-ago/2025, em vez de comparar um ano inteiro contra um período
// parcial (o que infla queda/crescimento artificialmente).
function yearShift(de,ate){
  const shift=key=>{const m=/^(\d{4})-(\d{2})$/.exec(String(key||''));return m?`${Number(m[1])-1}-${m[2]}`:key};
  return {de:shift(de),ate:shift(ate)};
}
function resolveComparison(range){
  if(state.compareMode==='custom'&&state.customComparePeriod)return periodRange(state.customComparePeriod);
  if(state.compareMode==='anual')return yearShift(range.de,range.ate);
  return periodShift(range.de,range.ate);
}

function filtersForPeriod(period,extra={}){const range=periodRange(period);return {p_de:range.de,p_ate:range.ate,...extra}}
async function dimension(dimension,period,metrica='Valor',extra={}){return regionalApi('/agregado-por-dimensao',{p_dimensao:dimension,p_metrica:metrica,p_limit:80,...filtersForPeriod(period,extra)})}

// Rótulo de um intervalo {de,ate} genérico (mês único ou vários meses).
function rangeLabel(range){if(!range?.de)return '—';return range.de===range.ate?monthLabel(range.de):`${monthLabel(range.de)}–${monthLabel(range.ate)}`}
function yoyDimensionDelta(currentRows,previousRows,limit=5){
  const curMap=new Map((currentRows||[]).map(r=>[r.chave,number(r.total)]));
  const prevMap=new Map((previousRows||[]).map(r=>[r.chave,number(r.total)]));
  const curTotalGeral=number(currentRows?.[0]?.total_geral)||[...curMap.values()].reduce((s,v)=>s+v,0)||1;
  const rows=[...new Set([...curMap.keys(),...prevMap.keys()])].map(chave=>{
    const cur=curMap.get(chave)||0,prev=prevMap.get(chave)||0;
    const delta=prev>0?((cur-prev)/prev*100):(cur>0?null:0);
    return {chave,cur,prev,delta,share:cur/curTotalGeral*100};
  });
  const comparable=rows.filter(r=>r.prev>0);
  const leaders=[...rows].sort((a,b)=>b.cur-a.cur).slice(0,limit*2);
  // growing e falling não podem se sobrepor: com poucos itens comparáveis
  // (ex.: só 16 categorias de produto no total), o "top 3 que mais cresceu"
  // e o "top 3 que mais caiu" podem ser quase o mesmo conjunto — falling
  // exclui quem já está em growing antes de cortar em 3, em vez de deixar
  // pra deduplicação depois (que só encolhia a lista final).
  // Só entra em "cresceu" quem realmente cresceu (delta>0), só entra em
  // "caiu" quem realmente caiu (delta<0) — antes pegava sempre os top/
  // bottom N por ordenação, então com poucos ganhadores de verdade (comum
  // em categoria, que só tem 16 valores possíveis), uma categoria em queda
  // (só que "menos pior" que as outras) aparecia rotulada como "maior
  // crescimento", o que lia como "o crescimento não aparece".
  const growing=comparable.filter(r=>r.delta>0).sort((a,b)=>b.delta-a.delta).slice(0,limit);
  const falling=comparable.filter(r=>r.delta<0).sort((a,b)=>a.delta-b.delta).slice(0,limit);
  return {rows,leaders,growing,falling};
}
function deltaText(delta){return delta==null?'novo':`${delta>=0?'▲ +':'▼ '}${delta.toFixed(1)}%`}
function yoyRankingList(bucket,formatTotal){
  const seen=new Set();
  const rows=[...bucket.growing,...bucket.falling].filter(r=>seen.has(r.chave)?false:(seen.add(r.chave),true));
  const maxAbs=Math.max(1,...rows.map(r=>Math.abs(r.delta)||0));
  return rows.map(r=>[r.chave,`${deltaText(r.delta)} · antes ${formatTotal(r.prev)} → agora ${formatTotal(r.cur)}`,Math.max(6,Math.round((Math.abs(r.delta)||0)/maxAbs*100)),r.delta<0]);
}
// Crescimentos e quedas lado a lado (duas colunas), em vez de uma lista só
// empilhada — mais fácil de comparar os dois lados de uma vez.
function sideBySideLists(bucket,formatTotal){
  const all=[...(bucket?.growing||[]),...(bucket?.falling||[])];
  const maxAbs=Math.max(1,...all.map(r=>Math.abs(r.delta)||0));
  const row=r=>[r.chave,`${deltaText(r.delta)} · antes ${formatTotal(r.prev)} → agora ${formatTotal(r.cur)}`,Math.max(6,Math.round((Math.abs(r.delta)||0)/maxAbs*100)),r.delta<0];
  return {growing:(bucket?.growing||[]).map(row),falling:(bucket?.falling||[]).map(row)};
}
function shareLeadersMetrics(bucket,formatTotal,limit=5){
  return (bucket?.leaders||[]).slice(0,limit).map(r=>[r.chave,`${r.share.toFixed(1)}% da base · ${formatTotal(r.cur)}`,'pie-chart']);
}
// Ponte de faturamento (waterfall/bridge chart): técnica padrão de mercado
// (popularizada pela McKinsey nos anos 90) pra explicar variação de
// faturamento pra board/diretoria sem enterrar a história numa planilha —
// mostra o quanto cada categoria empurrou o total pra cima ou pra baixo,
// em vez de só listar percentuais soltos. As barras reconciliam por
// construção: os dois pontos-âncora são a SOMA das categorias (não o KPI
// geral), então "anterior + todas as contribuições = atual" sempre fecha.
// Um waterfall/ponte "de verdade" (barras flutuantes, sem tocar o eixo)
// é a técnica de mercado pra isso, mas é uma convenção que só quem já viu
// antes reconhece de cara — pra quem não conhece, barra que não encosta no
// chão parece gráfico quebrado. Prioriza clareza: mostra a mesma pergunta
// (o que puxou o faturamento pra cima ou pra baixo) como barras normais,
// partindo de zero como todas as outras barras da apresentação.
function revenueBridgeChart(y){
  const rows=(y.categoria?.rows||[]).filter(r=>r.cur>0||r.prev>0);
  if(!rows.length)return null;
  const sorted=[...rows].sort((a,b)=>Math.abs(b.cur-b.prev)-Math.abs(a.cur-a.prev));
  const top=sorted.slice(0,7);
  const rest=sorted.slice(7);
  const segs=top.map(r=>({label:r.chave,delta:r.cur-r.prev}));
  if(rest.length)segs.push({label:'Demais categorias',delta:rest.reduce((s,r)=>s+(r.cur-r.prev),0)});
  return {waterfall:true,format:'money',labels:segs.map(s=>s.label),datasets:[{data:segs.map(s=>s.delta),pointColors:segs.map(s=>s.delta>=0?'green':'red'),deltas:segs.map(s=>s.delta)}]};
}
function topBottomHeadline(bucket,noun){
  const top=bucket?.growing?.[0],bottom=bucket?.falling?.find(r=>r.chave!==top?.chave)||bucket?.falling?.[0];
  if(!top&&!bottom)return `Comparativo por ${noun}: sem base comparável no per\xEDodo`;
  const parts=[];
  if(top)parts.push(`Maior crescimento: ${top.chave}`);
  if(bottom&&bottom.chave!==top?.chave)parts.push(`Maior queda: ${bottom.chave}`);
  return parts.join(' · ')||`Comparativo por ${noun}`;
}
// A comparação usa sempre o período selecionado no filtro (mês OU trimestre)
// contra o período imediatamente anterior de mesmo tamanho (state.compare —
// o mesmo "período anterior equivalente" já usado no resto do painel), em
// vez de um recorte fixo de ano civil. Assim o botão de período muda de
// verdade o que a Apresentação 1 mostra, em qualquer granularidade.
async function loadYoyBreakdown(){
  const current={...periodRange(state.period),label:periodLabel(state.period)};
  const previous={...state.compare,label:rangeLabel(state.compare)};
  const tasks=[
    ()=>regionalApi('/kpis',filtersForPeriod(current)), ()=>regionalApi('/kpis',filtersForPeriod(previous)),
    ()=>dimension('Regiao',current), ()=>dimension('Regiao',previous),
    ()=>dimension('Segmento',current), ()=>dimension('Segmento',previous),
    ()=>dimension('Grupo',current), ()=>dimension('Grupo',previous),
    ()=>dimension('UF',current), ()=>dimension('UF',previous),
  ];
  const names=['KPIs período atual','KPIs período anterior','Região atual','Região anterior','Segmento atual','Segmento anterior','Grupo atual','Grupo anterior','UF atual','UF anterior'];
  const results=await runWithConcurrency(tasks,3);
  const errors=[];
  const values=results.map((r,i)=>{if(r.status==='fulfilled')return r.value;errors.push(`${names[i]}: ${r.reason?.message||r.reason}`);return []});
  const [kpisCurRows,kpisPrevRows,regiaoCur,regiaoPrev,segmentoCurRaw,segmentoPrevRaw,grupoCur,grupoPrev,ufCur,ufPrev]=values;
  const segmentoCur=keepOnlyFoodSegments(segmentoCurRaw),segmentoPrev=keepOnlyFoodSegments(segmentoPrevRaw);
  state.yoy={
    current,previous,errors,
    kpisCur:normalizeKpis(Array.isArray(kpisCurRows)?kpisCurRows[0]:kpisCurRows),
    kpisPrev:normalizeKpis(Array.isArray(kpisPrevRows)?kpisPrevRows[0]:kpisPrevRows),
    regiao:yoyDimensionDelta(regiaoCur,regiaoPrev),
    segmento:yoyDimensionDelta(segmentoCur,segmentoPrev),
    categoria:yoyDimensionDelta(excludeNonCoreGroups(grupoCur),excludeNonCoreGroups(grupoPrev)),
    uf:yoyDimensionDelta(ufCur,ufPrev,27),
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
  for(const key of ['KPIs atuais','KPIs anteriores','Cidades atuais','Cidades anteriores','Grupos atuais','Grupos anteriores','Evolução','Clientes']) delete state.sourceErrors[key];
  const currentFilters=filtersForPeriod(period); const previousFilters=comparison?{p_de:comparison.de,p_ate:comparison.ate}:currentFilters;
  const tasks=[
    ()=>regionalApi('/kpis',currentFilters), ()=>regionalApi('/kpis',previousFilters),
    ()=>regionalApi('/agregado-cidades',currentFilters), ()=>regionalApi('/agregado-cidades',previousFilters),
    ()=>dimension('Grupo',range), ()=>dimension('Grupo',comparison||range),
    ()=>regionalApi('/evolucao-mensal',{}),
    ()=>regionalApi('/estrategia-clientes',{p_de:range.de,p_ate:range.ate}),
  ];
  const names=['KPIs atuais','KPIs anteriores','Cidades atuais','Cidades anteriores','Grupos atuais','Grupos anteriores','Evolução','Clientes'];
  const results=await runWithConcurrency(tasks,3);
  const values=results.map((r,i)=>{if(r.status==='fulfilled')return r.value;state.sourceErrors[names[i]]=r.reason?.message||String(r.reason);return []});
  const [kpisRows,previousKpisRows,cities,previousCities,groups,previousGroups,evolution,customerSignals]=values;
  const kpis=normalizeKpis(Array.isArray(kpisRows)?kpisRows[0]:kpisRows);
  const previousKpis=normalizeKpis(Array.isArray(previousKpisRows)?previousKpisRows[0]:previousKpisRows);
  if(customerSignals?.summary){kpis.n_clientes=number(customerSignals.summary.currentCustomers);previousKpis.n_clientes=number(customerSignals.summary.previousCustomers)}
  state.commercial={period,comparison,kpis,previousKpis,cities,previousCities,groups,previousGroups,evolution,customerSignals,capturedAt:new Date().toISOString()};
  // Oportunidades ficam restritas a região e categoria (produto) — sinais de
  // cliente/fornecedor individuais saíram por decisão explícita: ruído
  // demais pra decisão estratégica, cabem melhor em uma análise pontual.
  state.generatedOpportunities=[
    ...detectRegionalOpportunities(cities,previousCities,{minRevenue:50000,max:9}),
    ...detectDimensionOpportunities(excludeNonCoreGroups(groups),excludeNonCoreGroups(previousGroups),'categoria',{minRevenue:100000,max:8}),
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

function monthlyPaceRows(){
  const rows=Array.isArray(state.commercial?.evolution)?state.commercial.evolution:[];
  const agg=new Map();
  rows.forEach(r=>{
    const key=`${r.ano}-${String(r.mes).padStart(2,'0')}`;
    const cur=agg.get(key)||{valor:0,volume:0};
    cur.valor+=number(r.valor);cur.volume+=number(r.volume);
    agg.set(key,cur);
  });
  const today=currentMonth();
  const todayDay=Number(nowKey().slice(8,10));
  const meta=state.target;
  return [...agg.entries()].sort((a,b)=>a[0].localeCompare(b[0])).slice(-6).map(([key,v])=>{
    const [y,m]=key.split('-').map(Number);
    const daysInMonth=new Date(Date.UTC(y,m,0)).getUTCDate();
    const isCurrent=key===today;
    const isFuture=key>today;
    const elapsedDays=isCurrent?Math.min(todayDay,daysInMonth):(isFuture?0:daysInMonth);
    const remainingDays=Math.max(0,daysInMonth-elapsedDays);
    const gap=Math.max(0,meta-v.valor);
    const avgDiaRealizado=elapsedDays>0?v.valor/elapsedDays:0;
    const avgDiaNecessario=isCurrent&&remainingDays>0&&gap>0?gap/remainingDays:null;
    const projecao=isCurrent?avgDiaRealizado*daysInMonth:v.valor;
    const ratio=meta>0?v.valor/meta:0;
    const valorPorKg=v.volume>0?v.valor/v.volume:0;
    let health;
    if(isFuture)health='atencao';
    else if(!isCurrent)health=v.valor>=meta?'atingido':'abaixo';
    else{const projRatio=meta>0?projecao/meta:0;health=projRatio>=1?'no_ritmo':(projRatio>=.9?'atencao':'em_risco')}
    return {key,label:monthLabel(key),valor:v.valor,volume:v.volume,valorPorKg,ratio,daysInMonth,elapsedDays,remainingDays,avgDiaRealizado,avgDiaNecessario,projecao,gap,isCurrent,health};
  });
}
function renderMonthlyPace(){
  const tbody=$('monthlyPaceBody');if(!tbody)return;
  const rows=monthlyPaceRows();
  $('monthlyPaceEmpty').hidden=rows.length>0;
  $('monthlyPaceCaption').textContent=`Meta: ${moneyCompact(state.target)}/mês`;
  tbody.innerHTML=rows.map(r=>`<tr class="${r.isCurrent?'is-current':''}"><td>${esc(r.label)}${r.isCurrent?'<small>em andamento</small>':''}</td><td>${money(r.valor)}</td><td>${(r.ratio*100).toFixed(1)}%</td><td>${kg(r.volume)}</td><td>${money(r.valorPorKg)}/kg</td><td>${money(r.avgDiaRealizado)}</td><td>${r.isCurrent?(r.avgDiaNecessario!=null?money(r.avgDiaNecessario):'meta batida'):'—'}</td><td>${r.isCurrent?money(r.projecao):'—'}</td><td><span class="health ${r.health}">${healthLabel(r.health)}</span></td></tr>`).join('');
  const current=rows.find(r=>r.isCurrent);
  const todayEl=$('monthlyPaceToday');
  if(!current){todayEl.innerHTML='';icons();return}
  todayEl.innerHTML=current.gap<=0
    ? `<i data-lucide="party-popper"></i><span><strong>Meta de ${moneyCompact(state.target)} já batida em ${esc(current.label)}.</strong> Faturado até agora: ${money(current.valor)}.</span>`
    : `<i data-lucide="gauge"></i><span><strong>Faltam ${money(current.gap)} para bater a meta de ${esc(current.label)}.</strong> Restam ${current.remainingDays} dia(s) · média até agora ${money(current.avgDiaRealizado)}/dia · precisa vender ${current.avgDiaNecessario!=null?money(current.avgDiaNecessario):'—'}/dia nos dias restantes.</span>`;
  icons();
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
// "Score" sozinho não diz nada pra quem não construiu o algoritmo — troca
// por antes→agora sempre que a oportunidade já vem com evidência real
// (a maioria vem, de detectRegionalOpportunities/detectDimensionOpportunities).
function opportunityDelta(op){
  const ev=Array.isArray(op.evidence)?op.evidence[0]:null;
  if(ev&&ev.previous!=null&&ev.previous>0)return pct(ev.current,ev.previous);
  return null;
}
function opportunityRowValue(op){
  const ev=Array.isArray(op.evidence)?op.evidence[0]:null;
  if(ev&&ev.previous!=null&&ev.previous>0){
    const delta=pct(ev.current,ev.previous);
    return `${opportunityTypeLabel(op)} · ${deltaText(delta)} · antes ${moneyCompact(ev.previous)} → agora ${moneyCompact(ev.current)}`;
  }
  if(ev&&ev.current!=null)return `${opportunityTypeLabel(op)} · ${moneyCompact(ev.current)}`;
  return `${opportunityTypeLabel(op)} · Score ${(op.score||0).toFixed(0)}`;
}
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

function renderAll(){if(state.commercial)renderKpis();renderExecutivePortfolio();if(state.commercial)renderEvolution();if(state.commercial)renderMonthlyPace();renderOpportunities();renderProjectStrip();renderProjectList();renderTracking();renderReviews();icons()}

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
  const c=state.commercial||{kpis:normalizeKpis({}),previousKpis:normalizeKpis({}),evolution:[]};const latest=latestMeasurementsMap();const summary=summarizeProjects(state.projects,latest);const topOps=state.generatedOpportunities.slice(0,6);
  const activeAll=state.projects.filter(p=>!['encerrado','cancelado'].includes(p.status));const active=activeAll.slice(0,5);const selected=activeAll[0]||state.projects[0]||null;const actions=selected?state.actions.filter(a=>String(a.projeto_id)===String(selected.id)):[];
  const severityRank={em_risco:0,abaixo:1,atencao:2};
  const riskyProjects=activeAll.map(p=>({titulo:p.titulo,health:projectHealth(p).health})).filter(p=>p.health in severityRank).sort((a,b)=>severityRank[a.health]-severityRank[b.health]);
  const openProjectIds=new Set(activeAll.map(p=>String(p.id)));
  const allActions=state.actions.filter(a=>openProjectIds.has(String(a.projeto_id))&&!['concluida','cancelada'].includes(a.status)).sort((a,b)=>String(a.prazo||'9999').localeCompare(String(b.prazo||'9999')));
  const opportunityBreakdown=(()=>{const counts={};for(const op of state.generatedOpportunities){const label=opportunityTypeLabel(op);counts[label]=(counts[label]||0)+1}return Object.entries(counts).sort((a,b)=>b[1]-a[1])})();
  const yoy=state.yoy||{current:{label:'—'},previous:{label:'—'},kpisCur:normalizeKpis({}),kpisPrev:normalizeKpis({}),regiao:{growing:[],falling:[]},segmento:{growing:[],falling:[]},grupo:[]};
  return {c,summary,topOps,active,activeAll,selected,actions,allActions,riskyProjects,opportunityBreakdown,target:state.target,period:periodLabel(state.period),yoy};
}
// Placeholder de setor: a apresentação 1 hoje só tem dado real de Comercial
// (via SQL Server/PMG Bridge). Logística, Marketing, Financeiro e Compras
// ainda não têm fonte integrada aqui — em vez de inventar número, a área
// preenche na hora da reunião. Quando cada fonte for definida, estes slides
// passam a ler dado real do mesmo jeito que o slide Comercial já lê.
function placeholderSectorSlide(kicker,area,indicadores,icon='layout-grid'){
  return {kicker,icon,title:`${area} — dados do setor`,subtitle:`Espaço reservado para a equipe de ${area} apresentar os indicadores do período nesta reunião.`,columns:indicadores.map(label=>[label,'A apresentar pela área'])};
}

function buildOverviewSlides(){
  const d=presentationData();const y=d.yoy;
  const opsPreview=state.generatedOpportunities.slice(0,6);
  const bridge=revenueBridgeChart(y);
  const body=[
    ...(bridge?[{icon:'git-commit-horizontal',kicker:'O que puxou o faturamento',title:`De ${y.previous.label} a ${y.current.label}: o que puxou o faturamento pra cima ou pra baixo`,chart:bridge,
      subtitle:'Quanto cada categoria somou (verde) ou tirou (vermelho) do faturamento total, comparando com o período anterior.',source:'Fonte: SQL Server · dbo.Produtos.Grupo'}]:[]),
    {icon:'map-pin',kicker:'Por região',title:topBottomHeadline(y.regiao,'região'),sideLists:sideBySideLists(y.regiao,moneyCompact),
      subtitle:`As 5 regiões que mais cresceram e as 5 que mais caíram em faturamento, ${y.current.label} contra ${y.previous.label}.`,source:'Fonte: SQL Server · dbo.Clientes.Zona'},
    {icon:'map',kicker:'Região no mapa',title:'O mesmo comparativo, agora por estado',map:regionMapData(y),sideLists:mapSideLists(y.uf,moneyCompact),
      subtitle:'Verde é crescimento, vermelho é queda — quanto mais forte a cor, maior a variação. Cinza é estado sem base comparável no período. Ao lado, os 5 estados que mais cresceram e os 5 que mais caíram.',source:'Fonte: SQL Server · dbo.Clientes.UF'},
    {icon:'users',kicker:'Por segmento',title:topBottomHeadline(y.segmento,'segmento'),sideLists:sideBySideLists(y.segmento,moneyCompact),
      subtitle:'Mesmo recorte, agora por segmento de cliente — as 5 que mais cresceram e as 5 que mais caíram, lado a lado.',source:'Fonte: SQL Server · dbo.Clientes.Segmento'},
    {icon:'pie-chart',kicker:'Segmentos líderes',title:'Quem concentra a base de faturamento da PMG',metrics:shareLeadersMetrics(y.segmento,moneyCompact),
      subtitle:'Os 5 segmentos que representam a maior fatia do faturamento total no período — quanto maior o share, maior a dependência dele.',source:'Fonte: SQL Server · dbo.Clientes.Segmento'},
    {icon:'package',kicker:'Por categoria',title:topBottomHeadline(y.categoria,'categoria'),sideLists:sideBySideLists(y.categoria,moneyCompact),
      subtitle:'As categorias de produto que mais cresceram e mais caíram, lado a lado — mesma lógica de região e segmento, aqui é onde reforçar ou corrigir o mix.',source:'Fonte: SQL Server · dbo.Produtos.Grupo'},
    ...(opsPreview.length?[{icon:'radar',kicker:'Sinais de oportunidade',title:`${num(opsPreview.length)} sinal(is) de região e categoria fora do padrão`,list:opsPreview.map(op=>{const delta=opportunityDelta(op);return [op.title,opportunityRowValue(op),Math.max(6,Math.round(op.score)),delta!=null?delta<0:false]}),
      subtitle:'Sinais automáticos de queda (vermelho) ou aceleração (verde) fora do padrão histórico, com o número real por trás de cada um. Cada sinal vira projeto priorizado, com dono e prazo, na Apresentação 2.'}]:[]),
    placeholderSectorSlide('Próximas estratégias','Estratégia',['Onde dobrar a aposta','Onde corrigir rota','Onde reduzir investimento','Prioridade dos próximos 90 dias'],'compass'),
  ];
  const numbered=body.map((s,i)=>({...s,kicker:`${String(i+1).padStart(2,'0')} · ${s.kicker}`}));
  return [
    {kind:'cover',icon:'compass',kicker:'PMG · Planejamento Estratégico · Apresentação 1 de 2',title:'Onde crescemos, onde caímos',subtitle:`Comparação entre ${y.current.label} e o período anterior equivalente (${y.previous.label}) — por região, segmento e categoria.`},
    ...numbered,
    {kind:'cover',icon:'arrow-right-circle',kicker:'Próximo passo',title:'Com o retrato de hoje em mãos, seguimos para oportunidades',subtitle:'Este comparativo mostra onde crescemos e onde caímos. O passo seguinte é transformar cada sinal em prioridade, responsável e prazo — Apresentação 2.'},
  ];
}

function buildOpportunityActionSlides(){
  const d=presentationData();const selectedProgress=d.selected?projectHealth(d.selected):null;
  const body=[
    {icon:'radar',kicker:'Radar de oportunidades',title:`${num(state.generatedOpportunities.length)} sinal(is) comercial(is) identificado(s) no período`,metrics:[
      ['Oportunidades identificadas',num(state.generatedOpportunities.length),'radar'],
      ['Por região',num(state.generatedOpportunities.filter(op=>op.kind==='regional').length),'map-pin'],
      ['Por categoria',num(state.generatedOpportunities.filter(op=>op.kind==='categoria').length),'package'],
    ],subtitle:'Sinais de região e categoria, baseados em comparação histórica interna. Não são previsão de mercado.',source:'Fonte: SQL Server · dbo.Vendas'},
    {icon:'lightbulb',kicker:'Oportunidades priorizadas',title:d.topOps[0]?`Maior prioridade: ${d.topOps[0].title}`:'Sinais comerciais que merecem investigação',list:d.topOps.map(op=>[op.title,`Score ${op.score.toFixed(0)} · ${opportunityTypeLabel(op)}`,Math.max(6,Math.round(op.score))]),subtitle:'Ranking por score interno: quanto maior, mais o sinal se destaca do padrão histórico.'},
    ...(d.riskyProjects.length?[{icon:'circle-alert',kicker:'Atenção nos projetos',title:`${num(d.riskyProjects.length)} projeto(s) fora do ritmo esperado`,list:d.riskyProjects.slice(0,6).map(p=>[p.titulo,healthLabel(p.health),null,true]),subtitle:'Projetos estratégicos ativos com resultado abaixo do esperado para o tempo já decorrido.'}]:[]),
    {icon:'layout-grid',kicker:'Portfólio em execução',title:`${num(d.summary.active)} projeto(s) ativo(s), ${money(d.summary.committedPotential)} em metas comprometidas`,metrics:[['Faturamento no período',money(d.yoy.kpisCur.total_valor),'banknote'],['Clientes positivados',num(d.yoy.kpisCur.n_clientes),'user-round-plus'],['Projetos ativos',num(d.summary.active),'folder-kanban'],['No ritmo / atingidos',num(d.summary.achieved+Math.max(0,d.summary.active-d.summary.risk-d.summary.attention-d.summary.below-d.summary.achieved)),'circle-check'],['Em risco / atenção',num(d.summary.risk+d.summary.attention+d.summary.below),'circle-alert'],['Metas de faturamento comprometidas',money(d.summary.committedPotential),'target']],subtitle:'Cada projeto preserva o baseline (o número no início) e mede o resultado a cada 90 dias — dá pra ver o que já melhorou, não só a meta.',source:'Fonte: SQL Server · dbo.Vendas / dbo.Clientes'},
    ...(d.selected?[{icon:'folder-kanban',kicker:'Exemplo em execução',title:d.selected.titulo,subtitle:d.selected.objetivo,metrics:[['Baseline',formatProjectMetric(d.selected,normalizeKpis(safeJson(d.selected.baseline,{}))),'flag'],['Meta',d.selected.meta_tipo==='percentual'?`${number(d.selected.meta_valor).toFixed(1)}%`:money(d.selected.meta_valor),'target'],['Resultado atual',d.selected.meta_tipo==='percentual'?`${selectedProgress.delta.toFixed(1)}%`:formatProjectMetric(d.selected,normalizeKpis(projectLatest(d.selected)||{})),'gauge'],['Status',healthLabel(selectedProgress.health),selectedProgress.health==='atingido'?'circle-check':selectedProgress.health==='atencao'?'circle-alert':'circle-x']]}]:[]),
    {icon:'users-round',kicker:'Plano de ação por área',title:d.allActions.length?`${num(d.allActions.length)} ação(ões) em aberto nos projetos ativos`:'O plano de ação é interdepartamental',actions:d.allActions.slice(0,8),subtitle:'Ações registradas nos projetos estratégicos ativos, por departamento e responsável.'},
    {icon:'calendar-clock',kicker:'Ciclo de 90 dias',title:'Executar, medir e corrigir rota',columns:[['Baseline','Fotografia dos indicadores no início.','flag'],['Mês 1','Primeira medição e remoção de bloqueios.','footprints'],['Mês 2','Ajustes e reforço do que está performando.','settings-2'],['Mês 3','Fechamento, aprendizados e decisão de escalar ou recalcular.','flag-triangle-right']]},
    {icon:'shield-check',kicker:'Governança',title:'Um número precisa ter fonte e responsável',columns:[['Dados','Regional e SQL comercial alimentam indicadores.','database'],['Execução','Ações estratégicas podem virar Demandas.','workflow'],['Histórico','Baseline e medições ficam preservados no Supabase.','history'],['Decisão','Resultado final registra o que funcionou, gargalos e próximo passo.','gavel']]},
  ];
  const numbered=body.map((s,i)=>({...s,kicker:`${String(i+1).padStart(2,'0')} · ${s.kicker}`}));
  return [
    {kind:'cover',icon:'target',kicker:'PMG · Planejamento Estratégico · Apresentação 2 de 2',title:'Oportunidades e plano de ação',subtitle:`Sinais comerciais priorizados, com responsável, prazo e meta por área para os próximos 90 dias. Período-base: ${d.period}.`},
    ...numbered,
    {kind:'cover',icon:'flag',kicker:'Próxima reunião',title:'Não discutir só o número. Discutir a decisão.',subtitle:'O objetivo é sair com oportunidades priorizadas, responsáveis definidos, prazos e métricas para os próximos 90 dias.'}
  ];
}

function slidesForStage(stage){return stage==='oportunidades'?buildOpportunityActionSlides():buildOverviewSlides()}
function stageLabel(stage){return stage==='oportunidades'?'Etapa 2 de 2 · Oportunidades e plano':'Etapa 1 de 2 · Comparativo do período'}
function stageFileTag(stage){return stage==='oportunidades'?'Oportunidades_PlanoAcao':'Comparativo_Periodo'}
function metricColumns(count){
  if(count<=3)return Math.max(1,count);
  if(count===5)return 5;
  if(count%4===0)return 4;
  if(count%3===0)return 3;
  if(count%2===0)return count<=6?count/2:4;
  return 3;
}
function slideListRowHtml(item,index){
  const [l,v,pct,neg]=item;
  const negative=neg===true||/^-/.test(String(v).trim());
  const bar=pct!=null?`<div class="slide-bar-track"><i class="slide-bar${negative?' is-negative':''}" style="width:${Math.max(0,Math.min(100,pct))}%"></i></div>`:'';
  return `<div class="slide-list-row"><div class="slide-list-head"><span class="slide-rank">${index+1}</span><strong>${esc(l)}</strong><span class="${negative?'is-negative':''}">${esc(v)}</span></div>${bar}</div>`;
}
function slideIconHtml(name,cls){return name?`<i data-lucide="${esc(name)}" class="${cls}"></i>`:''}
function sideListsHtml(sideLists){
  return `<div class="slide-side-lists"><div class="slide-side-list-col"><div class="slide-side-list-head is-up"><i data-lucide="trending-up"></i>Cresceram</div><div class="slide-list">${sideLists.growing.length?sideLists.growing.map(slideListRowHtml).join(''):'<p class="slide-side-empty">Sem crescimento comparável no período.</p>'}</div></div><div class="slide-side-list-col"><div class="slide-side-list-head is-down"><i data-lucide="trending-down"></i>Caíram</div><div class="slide-list">${sideLists.falling.length?sideLists.falling.map(slideListRowHtml).join(''):'<p class="slide-side-empty">Sem queda comparável no período.</p>'}</div></div></div>`;
}
// Ao lado do mapa a coluna fica estreita demais pra duas sub-colunas
// (cresceram/caíram lado a lado) com o texto completo "antes → agora" —
// empilha as duas em vez de dividir a largura de novo.
function mapSideListsHtml(sideLists){
  return `<div class="slide-map-lists"><div class="slide-side-list-col"><div class="slide-side-list-head is-up"><i data-lucide="trending-up"></i>Cresceram</div><div class="slide-list slide-list-compact">${sideLists.growing.length?sideLists.growing.map(slideListRowHtml).join(''):'<p class="slide-side-empty">Sem crescimento comparável no período.</p>'}</div></div><div class="slide-side-list-col"><div class="slide-side-list-head is-down"><i data-lucide="trending-down"></i>Caíram</div><div class="slide-list slide-list-compact">${sideLists.falling.length?sideLists.falling.map(slideListRowHtml).join(''):'<p class="slide-side-empty">Sem queda comparável no período.</p>'}</div></div></div>`;
}
function mapHtml(){
  return `<div class="slide-map"><div class="map-svg-wrap"></div><div class="map-legend"><span class="map-legend-item"><i class="map-legend-swatch is-up"></i>Cresceu</span><span class="map-legend-item"><i class="map-legend-swatch is-down"></i>Caiu</span><span class="map-legend-item"><i class="map-legend-swatch is-flat"></i>Sem base comparável</span></div></div>`;
}
function slideHtml(slide){
  const brand=`<div class="slide-brand"><img src="/imagenssite/pmglogo.png" alt=""><span>PMG Connect</span></div>`;
  const source=slide.source?`<div class="slide-source">${esc(slide.source)}</div>`:'';
  const kickerIcon=slide.icon?`<i data-lucide="${esc(slide.icon)}"></i>`:'<i></i>';
  if(slide.kind==='cover')return `<section class="slide slide-cover"><span class="slide-kicker">${kickerIcon}${esc(slide.kicker)}</span><h2>${esc(slide.title)}</h2><p class="slide-sub">${esc(slide.subtitle||'')}</p>${brand}</section>`;
  return `<section class="slide">${brand}${source}<span class="slide-kicker">${kickerIcon}${esc(slide.kicker)}</span><h2>${esc(slide.title)}</h2>${slide.subtitle?`<p class="slide-sub">${esc(slide.subtitle)}</p>`:''}${slide.metrics?`<div class="slide-metrics" style="grid-template-columns:repeat(${metricColumns(slide.metrics.length)},1fr)">${slide.metrics.map(([l,v,icon])=>`<div class="slide-metric">${icon?`<span class="slide-metric-icon">${slideIconHtml(icon,'')}</span>`:''}<span>${esc(l)}</span><strong>${esc(v)}</strong></div>`).join('')}</div>`:''}${slide.list?`<div class="slide-list">${slide.list.map(slideListRowHtml).join('')}</div>`:''}${slide.map&&slide.sideLists?`<div class="slide-map-row">${mapHtml()}${mapSideListsHtml(slide.sideLists)}</div>`:slide.sideLists?sideListsHtml(slide.sideLists):''}${slide.columns?`<div class="slide-columns">${slide.columns.map(([l,v,icon])=>`<div class="slide-card">${icon?`<span class="slide-card-icon">${slideIconHtml(icon,'')}</span>`:''}<h3>${esc(l)}</h3><p>${esc(v)}</p></div>`).join('')}</div>`:''}${slide.actions?`<div class="slide-action-table">${slide.actions.length?slide.actions.map(a=>`<div class="slide-action-row"><strong>${esc(a.departamento)}</strong><span>${esc(a.titulo)}</span><span>${esc(collaboratorName(a.responsavel_id))}</span></div>`).join(''):'<p class="slide-sub">As ações serão definidas na reunião para cada departamento envolvido.</p>'}</div>`:''}${slide.chart?`<div class="slide-chart"><canvas></canvas></div>`:''}${slide.map&&!slide.sideLists?mapHtml():''}</section>`}
const SLIDE_CHART_PALETTE={green:'#2d7a4f',gold:'#b58a35',blue:'#3b82f6',red:'#a8443f'};
const SLIDE_CHART_PALETTE_LIGHT={green:'#7bd39a',gold:'#e9dcb0',blue:'#a6cbfd',red:'#e0a19c'};
function verticalGradient(ctx,chartArea,stops){
  if(!chartArea)return stops[stops.length-1][1];
  const gradient=ctx.createLinearGradient(0,chartArea.top,0,chartArea.bottom);
  stops.forEach(([offset,color])=>gradient.addColorStop(offset,color));
  return gradient;
}
function paintSlideChart(chartCfg,root,{animate=true}={}){
  const canvas=root.querySelector('.slide-chart canvas');
  if(!canvas||!chartCfg||!window.Chart)return null;
  const formatAxis=chartCfg.format==='money'?v=>moneyCompact(v):chartCfg.format==='kg'?v=>kg(v):v=>num(v);
  const formatTip=chartCfg.format==='money'?v=>money(v):chartCfg.format==='kg'?v=>kg(v):v=>num(v);
  const single=chartCfg.datasets.length===1;
  if(chartCfg.waterfall){
    const ds=chartCfg.datasets[0];
    return new Chart(canvas,{type:'bar',data:{labels:chartCfg.labels,datasets:[{
      data:ds.data,
      backgroundColor:ds.pointColors.map(c=>SLIDE_CHART_PALETTE[c]||SLIDE_CHART_PALETTE.green),
      borderRadius:6,borderSkipped:false,maxBarThickness:56,
    }]},options:{
      responsive:true,maintainAspectRatio:false,animation:animate?{duration:900,easing:'easeOutCubic'}:false,
      scales:{x:{grid:{display:false},ticks:{font:{size:10,weight:'bold'},color:'#6d766f',maxRotation:0,autoSkip:false}},y:{grid:{color:'#e9ece7'},ticks:{font:{size:10},color:'#6d766f',callback:formatAxis}}},
      plugins:{legend:{display:false},tooltip:{backgroundColor:'#173d2a',padding:10,cornerRadius:8,titleFont:{size:11},bodyFont:{size:11},callbacks:{label:ctx=>formatTip(ds.deltas[ctx.dataIndex])}}},
    }});
  }
  const datasets=chartCfg.datasets.map(ds=>{
    const color=SLIDE_CHART_PALETTE[ds.color]||SLIDE_CHART_PALETTE.green;
    const light=SLIDE_CHART_PALETTE_LIGHT[ds.color]||SLIDE_CHART_PALETTE_LIGHT.green;
    return{
      label:ds.label,data:ds.data,borderColor:color,
      backgroundColor:chartCfg.type==='bar'
        ?(context)=>verticalGradient(context.chart.ctx,context.chart.chartArea,[[0,light],[1,color]])
        :(context)=>verticalGradient(context.chart.ctx,context.chart.chartArea,[[0,`${color}59`],[1,`${color}02`]]),
      borderWidth:chartCfg.type==='bar'?0:3,tension:.4,pointRadius:0,pointHoverRadius:5,pointHoverBackgroundColor:color,pointHoverBorderColor:'#fff',pointHoverBorderWidth:2,
      fill:chartCfg.type==='line'&&single,borderRadius:chartCfg.type==='bar'?{topLeft:8,topRight:8}:0,borderSkipped:false,maxBarThickness:38,spanGaps:true,
    };
  });
  return new Chart(canvas,{type:chartCfg.type,data:{labels:chartCfg.labels,datasets},options:{
    responsive:true,maintainAspectRatio:false,animation:animate?{duration:900,easing:'easeOutCubic'}:false,
    interaction:{mode:'index',intersect:false},
    scales:{x:{grid:{display:false},ticks:{font:{size:10},color:'#6d766f',maxRotation:0,autoSkip:true}},y:{grid:{color:'#e9ece7'},ticks:{font:{size:10},color:'#6d766f',callback:formatAxis}}},
    plugins:{legend:{display:!single,position:'top',align:'end',labels:{boxWidth:10,usePointStyle:true,pointStyle:'circle',font:{size:10},color:'#6d766f'}},tooltip:{backgroundColor:'#173d2a',padding:10,cornerRadius:8,titleFont:{size:11},bodyFont:{size:11},callbacks:{label:ctx=>`${ctx.dataset.label}: ${formatTip(ctx.parsed.y)}`}}},
  }});
}
// Mapa do Brasil (choropleth) pra "por região": dbo.Clientes.Zona é
// granular demais pra um mapa (525 valores, tipo "ZONA SUL 2"), mas
// dbo.Clientes.UF já dá o estado de verdade — usa a mesma comparação
// (período atual x anterior) e só muda de granularidade geográfica.
const UF_NAMES={ac:'Acre',al:'Alagoas',ap:'Amapá',am:'Amazonas',ba:'Bahia',ce:'Ceará',df:'Distrito Federal',es:'Espírito Santo',go:'Goiás',ma:'Maranhão',mt:'Mato Grosso',ms:'Mato Grosso do Sul',mg:'Minas Gerais',pa:'Pará',pb:'Paraíba',pr:'Paraná',pe:'Pernambuco',pi:'Piauí',rj:'Rio de Janeiro',rn:'Rio Grande do Norte',rs:'Rio Grande do Sul',ro:'Rondônia',rr:'Roraima',sc:'Santa Catarina',sp:'São Paulo',se:'Sergipe',to:'Tocantins'};
function regionMapData(y){
  const rows=y.uf?.rows||[];
  const byUf=new Map();
  for(const r of rows){const code=String(r.chave||'').trim().toLowerCase();if(code.length===2)byUf.set(code,r)}
  const maxAbs=Math.max(1,...rows.filter(r=>r.prev>0).map(r=>Math.abs(r.delta)||0));
  return {byUf,maxAbs};
}
// Ao lado do mapa: os 5 estados (nome completo, não a sigla) que mais
// cresceram e os 5 que mais caíram — o mapa por si só só mostra a sigla
// no hover, o que não é o suficiente pra quem quer o nome do estado.
function mapSideLists(bucket,formatTotal,limit=5){
  const growingAll=(bucket?.growing||[]).slice(0,limit);
  const fallingAll=(bucket?.falling||[]).slice(0,limit);
  const all=[...growingAll,...fallingAll];
  const maxAbs=Math.max(1,...all.map(r=>Math.abs(r.delta)||0));
  const row=r=>{
    const name=UF_NAMES[String(r.chave||'').trim().toLowerCase()]||r.chave;
    return [name,`${deltaText(r.delta)} · antes ${formatTotal(r.prev)} → agora ${formatTotal(r.cur)}`,Math.max(6,Math.round((Math.abs(r.delta)||0)/maxAbs*100)),r.delta<0];
  };
  return {growing:growingAll.map(row),falling:fallingAll.map(row)};
}
function ufFillColor(row,maxAbs){
  if(!row||(row.cur<=0&&row.prev<=0))return '#e3e7e1';
  if(row.delta==null)return '#b58a35';
  const intensity=0.22+Math.min(1,Math.abs(row.delta)/maxAbs)*0.78;
  const base=row.delta>=0?[45,122,79]:[168,68,63];
  const mix=base.map(c=>Math.round(255+(c-255)*intensity));
  return `rgb(${mix.join(',')})`;
}
let brazilSvgPromise=null;
function loadBrazilSvg(){
  if(!brazilSvgPromise)brazilSvgPromise=fetch('/assets/brasil-mapa.svg').then(r=>r.text());
  return brazilSvgPromise;
}
async function paintSlideMap(mapCfg,root){
  const wrap=root.querySelector('.slide-map .map-svg-wrap');
  if(!wrap||!mapCfg)return;
  let svgText;
  try{svgText=await loadBrazilSvg()}catch{return}
  wrap.innerHTML=svgText;
  const svg=wrap.querySelector('svg');if(!svg)return;
  svg.setAttribute('preserveAspectRatio','xMidYMid meet');
  svg.querySelectorAll('path[id]').forEach(path=>{
    const row=mapCfg.byUf.get(path.id.toLowerCase());
    const name=path.getAttribute('aria-label')||path.id.toUpperCase();
    path.setAttribute('fill',ufFillColor(row,mapCfg.maxAbs));
    path.setAttribute('stroke','#fbfbf8');path.setAttribute('stroke-width','1.1');
    const label=!row||(row.cur<=0&&row.prev<=0)?`${name}: sem base comparável`:row.delta==null?`${name}: novo no período (${money(row.cur)})`:`${name}: ${deltaText(row.delta)} · ${moneyCompact(row.cur)}`;
    path.innerHTML=`<title>${esc(label)}</title>`;
  });
}
let presentSlideChart=null;
function goToSlide(index,{initial=false}={}){
  const previous=state.presentationIndex;const clamped=Math.max(0,Math.min(index,state.slides.length-1));
  const back=!initial&&clamped<previous;state.presentationIndex=clamped;
  const el=$('presentationStage');el.innerHTML=slideHtml(state.slides[clamped]);icons();
  presentSlideChart?.destroy();presentSlideChart=null;
  if(state.slides[clamped].chart)presentSlideChart=paintSlideChart(state.slides[clamped].chart,el);
  if(state.slides[clamped].map)paintSlideMap(state.slides[clamped].map,el).catch(()=>{});
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
  if(!state.yoy){
    $('presentationStage').innerHTML=`<section class="slide slide-cover"><span class="slide-kicker">Carregando</span><h2>Preparando os dados do período…</h2><p class="slide-sub">Buscando faturamento, peso, região, segmento e clientes do período.</p></section>`;
    try{await loadYoyBreakdown()}catch(error){toast(error.message||String(error),'error')}
  }
  renderPresentation();
}

async function captureSlideImage(slideData,container){
  container.innerHTML=slideHtml(slideData);
  const slideEl=container.querySelector('.slide');
  slideEl.classList.add('slide-export');
  try{window.lucide?.createIcons({attrs:{'stroke-width':1.9}})}catch{}
  let exportChart=null;
  if(slideData.chart)exportChart=paintSlideChart(slideData.chart,container,{animate:false});
  if(slideData.map)await paintSlideMap(slideData.map,container).catch(()=>{});
  const logo=slideEl.querySelector('.slide-brand img');
  if(logo&&!logo.complete)await new Promise(resolve=>{logo.addEventListener('load',resolve,{once:true});logo.addEventListener('error',resolve,{once:true})});
  await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
  const canvas=await window.html2canvas(slideEl,{scale:2,useCORS:true,backgroundColor:'#ffffff'});
  exportChart?.destroy();
  return canvas.toDataURL('image/jpeg',0.93);
}
async function exportPptx(stage){
  if(!window.PptxGenJS)throw new Error('Biblioteca de PowerPoint não carregou. Use o modo Apresentar/Imprimir como alternativa.');
  if(!window.html2canvas)throw new Error('Biblioteca de captura de slide não carregou. Recarregue a página e tente novamente.');
  const slides=slidesForStage(stage);
  toast(`Gerando PowerPoint com ${slides.length} slide(s)…`);
  const pptx=new window.PptxGenJS();pptx.layout='LAYOUT_WIDE';pptx.author='PMG Connect';pptx.subject='Planejamento Estratégico PMG';pptx.title='PMG Rumo aos R$ 200 milhões';pptx.company='PMG';pptx.lang='pt-BR';
  const container=document.createElement('div');
  container.style.cssText='position:fixed;left:-10000px;top:0;width:1280px;pointer-events:none;';
  document.body.appendChild(container);
  try{
    for(const s of slides){
      const dataUrl=await captureSlideImage(s,container);
      const slide=pptx.addSlide();slide.background={color:'FFFFFF'};
      slide.addImage({data:dataUrl,x:0,y:0,w:13.333,h:7.5});
    }
  }finally{container.remove()}
  await pptx.writeFile({fileName:`PMG_Planejamento_${stageFileTag(stage)}_${state.period||nowKey()}.pptx`});toast('PowerPoint gerado com os dados atuais.');
}

// Arquivo .html único e autocontido: cada slide vira uma imagem embutida em
// base64 (mesma captura usada no PPTX), sem nenhuma chamada de API depois de
// gerado. Dá pra abrir em qualquer computador, fora da rede da PMG, sem
// precisar da ponte local (localhost:3001) nem de login — é só a "foto" da
// apresentação no momento da exportação, não um espelho ao vivo do site.
async function exportStandaloneHtml(stage){
  if(!window.html2canvas)throw new Error('Biblioteca de captura de slide não carregou. Recarregue a página e tente novamente.');
  const slides=slidesForStage(stage);
  toast(`Gerando arquivo HTML com ${slides.length} slide(s)…`);
  const container=document.createElement('div');
  container.style.cssText='position:fixed;left:-10000px;top:0;width:1280px;pointer-events:none;';
  document.body.appendChild(container);
  const images=[];
  try{for(const s of slides)images.push(await captureSlideImage(s,container))}
  finally{container.remove()}
  const title=`PMG · Planejamento Estratégico · ${stageLabel(stage).split(' · ').slice(1).join(' · ')}`;
  const html=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<style>
html,body{margin:0;height:100%;background:#0e1712;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;overflow:hidden}
#stage{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box}
#stage img{max-width:100%;max-height:100%;box-shadow:0 30px 80px rgba(0,0,0,.5);border-radius:10px;user-select:none}
.nav{position:fixed;bottom:22px;left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:16px;background:#0b1510;padding:10px 18px;border-radius:999px;color:#fff;font-size:13px;box-shadow:0 18px 40px rgba(0,0,0,.5)}
.nav button{background:#16251c;border:1px solid #34443a;color:#fff;border-radius:999px;width:34px;height:34px;cursor:pointer;font-size:16px;line-height:1}
.nav button:hover:not(:disabled){background:#2d7a4f;border-color:#2d7a4f}
.nav button:disabled{opacity:.3;cursor:default}
.nav span{min-width:44px;text-align:center;font-variant-numeric:tabular-nums}
</style></head>
<body>
<div id="stage"><img id="slideImg" alt="Slide da apresentação"></div>
<div class="nav"><button id="prevBtn" aria-label="Slide anterior">‹</button><span id="counter"></span><button id="nextBtn" aria-label="Próximo slide">›</button></div>
<script>
const SLIDES=${JSON.stringify(images)};
let i=0;
const img=document.getElementById('slideImg'),counter=document.getElementById('counter'),prevBtn=document.getElementById('prevBtn'),nextBtn=document.getElementById('nextBtn');
function render(){img.src=SLIDES[i];counter.textContent=(i+1)+' / '+SLIDES.length;prevBtn.disabled=i===0;nextBtn.disabled=i===SLIDES.length-1}
function go(delta){const next=i+delta;if(next<0||next>=SLIDES.length)return;i=next;render()}
prevBtn.addEventListener('click',()=>go(-1));nextBtn.addEventListener('click',()=>go(1));
document.addEventListener('keydown',e=>{if(e.key==='ArrowLeft')go(-1);if(e.key==='ArrowRight')go(1)});
render();
</script>
</body></html>`;
  const blob=new Blob([html],{type:'text/html'});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');a.href=url;a.download=`PMG_Planejamento_${stageFileTag(stage)}_${state.period||nowKey()}.html`;document.body.appendChild(a);a.click();a.remove();
  URL.revokeObjectURL(url);
  toast('Arquivo HTML gerado — pode ser aberto em qualquer computador, sem precisar da rede da PMG.');
}

function bindEvents(){
  document.addEventListener('click',async event=>{const el=event.target.closest('button,[data-project-id],a');if(!el)return;try{
    if(el.matches('.nav-item'))return switchView(el.dataset.view);if(el.dataset.go)return switchView(el.dataset.go);if('newProject' in el.dataset)return openProjectDialog();if(el.dataset.projectId){state.selectedProjectId=el.dataset.projectId;renderProjectList();return}
    if(el.dataset.saveOp){await saveGeneratedOpportunity(el.dataset.saveOp);return}if(el.dataset.projectOp){let op=el.dataset.saved==='1'?findSaved(el.dataset.projectOp):findGenerated(el.dataset.projectOp);if(!op&&el.dataset.saved!=='1'){const saved=await saveGeneratedOpportunity(el.dataset.projectOp);op=saved?savedAsOp(saved):null}openProjectDialog(op);return}
    if(el.dataset.addAction){openAction(el.dataset.addAction);return}if(el.dataset.editAction){openAction(state.actions.find(a=>String(a.id)===String(el.dataset.editAction))?.projeto_id,state.actions.find(a=>String(a.id)===String(el.dataset.editAction)));return}if(el.dataset.demandAction){await createDemand(el.dataset.demandAction);return}if(el.dataset.measureProject){await measureProject(el.dataset.measureProject);return}if(el.dataset.reviewProject){openReview(el.dataset.reviewProject);return}
  }catch(error){console.error(error);toast(error.message||String(error),'error')}});
  document.querySelectorAll('[data-op-filter]').forEach(btn=>btn.addEventListener('click',()=>{document.querySelectorAll('[data-op-filter]').forEach(x=>x.classList.remove('active'));btn.classList.add('active');state.opFilter=btn.dataset.opFilter;renderOpportunities()}));
  $('mobileMenu').addEventListener('click',()=>$('strategyNav').classList.toggle('open'));
  $('collapseNavBtn').addEventListener('click',()=>{const collapsed=$('strategyNav').classList.toggle('collapsed');try{localStorage.setItem('pmg_estrategia_nav_collapsed',collapsed?'1':'0')}catch{}});$('refreshBtn').addEventListener('click',async()=>{pollSnapshotStatus();await loadCommercial();await loadPersistence();renderAll()});
  $('periodTrigger').addEventListener('click',event=>{event.stopPropagation();const hidden=$('periodPanel').hidden;$('periodPanel').hidden=!hidden;$('periodFilter').setAttribute('aria-expanded',String(hidden))});
  $('periodPanel').addEventListener('click',event=>event.stopPropagation());
  document.addEventListener('click',()=>{if(!$('periodPanel').hidden){$('periodPanel').hidden=true;$('periodFilter').setAttribute('aria-expanded','false')}});
  $('periodPanel').querySelectorAll('.context-preset-btn[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{
    if(btn.dataset.mode==='intervalo')return toggleRangeSelectMode(!state.rangeSelectMode);
    toggleRangeSelectMode(false);
    applyPeriodChange({periodMode:btn.dataset.mode}).catch(e=>toast(e.message,'error'));
  }));
  $('periodPanel').querySelectorAll('.context-preset-btn[data-compare]').forEach(btn=>btn.addEventListener('click',()=>{
    applyCompareModeChange(state.compareMode===btn.dataset.compare?'auto':btn.dataset.compare).catch(e=>toast(e.message,'error'));
  }));
  $('periodCalendar').addEventListener('click',event=>{
    const cell=event.target.closest('.context-month-cell');if(!cell||cell.disabled)return;
    const target=handlePeriodCellClick(cell.dataset.val);
    if(!target)return;
    if(!isCustomRange(target)&&!state.periods.includes(target))return;
    $('periodPanel').hidden=true;$('periodFilter').setAttribute('aria-expanded','false');
    applyPeriodChange({period:target}).catch(e=>toast(e.message,'error'));
  });
  $('compareModeSelect').addEventListener('change',()=>applyCompareModeChange($('compareModeSelect').value).catch(e=>toast(e.message,'error')));
  $('compareCustomSelect').addEventListener('change',async()=>{state.customComparePeriod=$('compareCustomSelect').value;await loadCommercial();await loadYoyBreakdown().catch(error=>{state.sourceErrors['Comparativo do período']=error.message||String(error)})});$('manualOpportunityBtn').addEventListener('click',openManualOpportunity);$('newProjectBtn').addEventListener('click',()=>openProjectDialog());$('presentStage1Btn').addEventListener('click',()=>openPresentation('visao').catch(e=>toast(e.message,'error')));$('presentStage2Btn').addEventListener('click',()=>openPresentation('oportunidades').catch(e=>toast(e.message,'error')));$('presentExportBtn').addEventListener('click',()=>exportPptx(state.presentationStage).catch(e=>toast(e.message,'error')));$('presentExportHtmlBtn').addEventListener('click',()=>exportStandaloneHtml(state.presentationStage).catch(e=>toast(e.message,'error')));
  $('presentPeriodTrigger').addEventListener('click',event=>{event.stopPropagation();const hidden=$('presentPeriodPanel').hidden;$('presentPeriodPanel').hidden=!hidden;$('presentPeriodTrigger').setAttribute('aria-expanded',String(hidden))});
  $('presentPeriodPanel').addEventListener('click',event=>event.stopPropagation());
  document.addEventListener('click',()=>{if(!$('presentPeriodPanel').hidden){$('presentPeriodPanel').hidden=true;$('presentPeriodTrigger').setAttribute('aria-expanded','false')}});
  $('presentPeriodPanel').querySelectorAll('.pt-preset-btn[data-mode]').forEach(btn=>btn.addEventListener('click',()=>{
    if(btn.dataset.mode==='intervalo')return toggleRangeSelectMode(!state.rangeSelectMode);
    toggleRangeSelectMode(false);
    changePresentationPeriod({periodMode:btn.dataset.mode,closePanel:false}).catch(e=>toast(e.message,'error'));
  }));
  $('presentPeriodPanel').querySelectorAll('.pt-preset-btn[data-compare]').forEach(btn=>btn.addEventListener('click',async()=>{
    const nextMode=state.compareMode===btn.dataset.compare?'auto':btn.dataset.compare;
    $('presentationStage').innerHTML=`<section class="slide slide-cover"><span class="slide-kicker">Carregando</span><h2>Atualizando comparação…</h2><p class="slide-sub">Recalculando indicadores com a nova régua de comparação.</p></section>`;
    try{await applyCompareModeChange(nextMode)}catch(error){toast(error.message||String(error),'error')}
    renderPresentation();
  }));
  $('presentPeriodCalendar').addEventListener('click',event=>{
    const cell=event.target.closest('.pt-month-cell');if(!cell||cell.disabled)return;
    const target=handlePeriodCellClick(cell.dataset.val);
    if(!target)return;
    if(!isCustomRange(target)&&!state.periods.includes(target))return;
    changePresentationPeriod({period:target}).catch(e=>toast(e.message,'error'));
  });
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
  try{const ok=await bootstrapAuth();if(!ok)return;pollSnapshotStatus();await Promise.all([loadPeriods(),loadPersistence()]);await loadCommercial();renderAll()}catch(error){console.error(error);setSourceStatus(false,'Falha de inicialização');warning(`<strong>Não foi possível iniciar o Planejamento Estratégico.</strong> ${esc(error.message||error)}`);toast(error.message||String(error),'error')}
}
init();
