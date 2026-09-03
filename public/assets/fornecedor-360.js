import {
  buildSupplierQualityIssues,
  normalizeSupplierText,
  resolveSupplierIdentity,
} from './supplier-identity-core.js';
import {
  loadSupplierIdentityContext,
  registerSupplierIdentity,
  reviewSupplierIdentity,
  saveSupplierQualityDecision,
  supplierQueryValues,
  uniqueExternalSupplierRecords,
} from './supplier-identity-service.js';
import { buildSupplierFinanceComposition } from './financial-lineage-core.js';

const CAMPAIGN_DB = 'pmg_campanhas_db';
const CAMPAIGN_DB_VERSION = 2;
const CAMPAIGN_CONTEXT_ID = 'commercial-context-v6';
const QUALITY_LIMIT = 120;

const state = {
  db:null,
  profile:null,
  identity:null,
  activeSupplier:null,
  supplierData:null,
  activeTab:'overview',
  qualityIssues:[],
  qualityFilter:'pendente',
  qualityLoading:false,
  focusReturn:null,
  qualityFocusReturn:null,
  lineageFocusReturn:null,
  qualitySources:[],
};

const htmlEscape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
const attrEscape = value => htmlEscape(value).replace(/`/g, '&#096;');
const money = value => Number(value || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const number = value => Number(value || 0).toLocaleString('pt-BR');
const date = value => {
  const raw = String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return value ? new Date(value).toLocaleDateString('pt-BR') : '—';
  const [year, month, day] = raw.split('-');
  return `${day}/${month}/${year}`;
};
const dateTime = value => value ? new Date(value).toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' }) : '—';
const saoPauloDateKey = value => {
  const formatted = new Intl.DateTimeFormat('en-CA', { timeZone:'America/Sao_Paulo', year:'numeric', month:'2-digit', day:'2-digit' }).format(value || new Date());
  return formatted;
};
const isManager = () => state.profile?.role === 'gestor';

function sourceError(label, error) {
  return { ok:false, label, error:error?.message || String(error || 'Fonte indisponível') };
}

async function safe(label, fn, fallback) {
  try {
    const value = await fn();
    return { ok:true, label, value };
  } catch (error) {
    console.warn(`[Fornecedor 360] ${label}:`, error?.message || error);
    return { ...sourceError(label, error), value:fallback };
  }
}

function dedupeById(rows = []) {
  const map = new Map();
  rows.forEach(row => { if (row?.id != null) map.set(String(row.id), row); });
  return [...map.values()];
}

function chunk(values, size = 80) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}

async function openCampaignDb() {
  if (!('indexedDB' in window)) return null;
  return new Promise(resolve => {
    const request = indexedDB.open(CAMPAIGN_DB, CAMPAIGN_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('campanhas')) database.createObjectStore('campanhas', { keyPath:'id' });
      if (!database.objectStoreNames.contains('config')) database.createObjectStore('config', { keyPath:'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function readStore(db, name) {
  if (!db?.objectStoreNames.contains(name)) return [];
  return new Promise(resolve => {
    const request = db.transaction(name).objectStore(name).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

async function loadCampaignLocalContext() {
  const db = await openCampaignDb();
  if (!db) return { campaigns:[], suppliers:[], available:false };
  try {
    const [campaigns, configs] = await Promise.all([readStore(db, 'campanhas'), readStore(db, 'config')]);
    const row = configs.find(item => item?.id === CAMPAIGN_CONTEXT_ID) || null;
    const context = row?.context || row || {};
    return { campaigns, suppliers:context.suppliers || [], products:context.products || [], available:true };
  } finally {
    db.close();
  }
}

function trapFocus(container, event) {
  if (event.key !== 'Tab' || !container || container.hidden) return false;
  const focusable=[...container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')].filter(item=>item.getClientRects().length && item.getAttribute('aria-hidden')!=='true');
  if (!focusable.length) return false;
  const first=focusable[0], last=focusable.at(-1);
  if (event.shiftKey && document.activeElement===first) { event.preventDefault(); last.focus(); return true; }
  if (!event.shiftKey && document.activeElement===last) { event.preventDefault(); first.focus(); return true; }
  return false;
}

function injectUi() {
  if (document.getElementById('s360Backdrop')) return;
  document.body.insertAdjacentHTML('beforeend', `
    <div class="s360-backdrop" id="s360Backdrop" hidden>
      <aside class="s360-panel" role="dialog" aria-modal="true" aria-labelledby="s360Title">
        <header class="s360-head">
          <div class="s360-head-main"><span class="s360-eyebrow">Fornecedor 360</span><h2 id="s360Title">Fornecedor</h2><p id="s360Subtitle">Visão operacional conectada</p></div>
          <div class="s360-head-actions" id="s360HeadActions"><button type="button" class="s360-close" id="s360Close" aria-label="Fechar Fornecedor 360">×</button></div>
        </header>
        <div class="s360-statusline" id="s360Statusline"></div>
        <nav class="s360-tabs" id="s360Tabs" aria-label="Seções do fornecedor"></nav>
        <main class="s360-content" id="s360Content"><div class="s360-loading">Carregando fornecedor…</div></main>
      </aside>
    </div>
    <div class="s360-lineage-modal" id="s360LineageModal" hidden>
      <section class="s360-modal-card" role="dialog" aria-modal="true" aria-labelledby="s360LineageTitle">
        <header class="s360-modal-head"><h3 id="s360LineageTitle">Composição do indicador</h3><button type="button" data-s360-close-lineage aria-label="Fechar composição">×</button></header>
        <div class="s360-modal-body" id="s360LineageBody"></div>
      </section>
    </div>
    <div class="s360-quality-modal" id="s360QualityModal" hidden>
      <section class="s360-modal-card" role="dialog" aria-modal="true" aria-labelledby="s360QualityTitle">
        <header class="s360-modal-head"><div><span class="s360-eyebrow">Fornecedor · qualidade</span><h3 id="s360QualityTitle">Qualidade dos Dados</h3></div><button type="button" data-s360-close-quality aria-label="Fechar Qualidade dos Dados">×</button></header>
        <div class="s360-modal-body" id="s360QualityBody"></div>
      </section>
    </div>`);

  const toolbar = document.querySelector('.toolbar .spacer');
  if (toolbar && !document.getElementById('s360QualityButton')) {
    toolbar.insertAdjacentHTML('afterend', `<button class="btn-ghost s360-trigger" id="s360QualityButton" type="button">Qualidade dos dados</button>`);
  }

  document.getElementById('s360Close').addEventListener('click', closeSupplier360);
  document.getElementById('s360Backdrop').addEventListener('click', event => { if (event.target.id === 's360Backdrop') closeSupplier360(); });
  document.querySelector('[data-s360-close-lineage]').addEventListener('click', closeLineage);
  document.querySelector('[data-s360-close-quality]').addEventListener('click', closeQuality);
  document.getElementById('s360LineageModal').addEventListener('click', event => { if (event.target.id === 's360LineageModal') closeLineage(); });
  document.getElementById('s360QualityModal').addEventListener('click', event => { if (event.target.id === 's360QualityModal') closeQuality(); });
  document.getElementById('s360QualityButton')?.addEventListener('click', openQuality);
  document.getElementById('s360QualityBody')?.addEventListener('click', event => {
    const filter = event.target.closest('[data-quality-filter]');
    if (filter) {
      state.qualityFilter = filter.dataset.qualityFilter || 'pendente';
      renderQuality(state.qualitySources || []);
      return;
    }
    qualityAction(event);
  });
  document.addEventListener('keydown', event => {
    const lineage=document.getElementById('s360LineageModal'), quality=document.getElementById('s360QualityModal'), supplier=document.getElementById('s360Backdrop');
    if (event.key === 'Tab') {
      if (!quality.hidden) return trapFocus(quality,event);
      if (!lineage.hidden) return trapFocus(lineage,event);
      if (!supplier.hidden) return trapFocus(supplier,event);
    }
    if (event.key !== 'Escape') return;
    if (!lineage.hidden) return closeLineage();
    if (!quality.hidden) return closeQuality();
    if (!supplier.hidden) closeSupplier360();
  });
}

function keepUrlSupplier(id = null) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('fornecedor', id);
  else url.searchParams.delete('fornecedor');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function keepQualityUrl(open) {
  const url = new URL(location.href);
  if (open) url.searchParams.set('view', 'qualidade');
  else if (url.searchParams.get('view') === 'qualidade') url.searchParams.delete('view');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
}

function closeSupplier360() {
  const root = document.getElementById('s360Backdrop');
  if (root.hidden) return;
  root.hidden = true;
  document.body.style.removeProperty('overflow');
  keepUrlSupplier(null);
  const target = state.focusReturn;
  state.focusReturn = null;
  if (target?.isConnected) target.focus();
}

function closeLineage() {
  const modal = document.getElementById('s360LineageModal');
  modal.hidden = true;
  const target=state.lineageFocusReturn; state.lineageFocusReturn=null;
  if(target?.isConnected) target.focus(); else document.getElementById('s360Close')?.focus();
}

function closeQuality() {
  const modal = document.getElementById('s360QualityModal');
  modal.hidden = true;
  keepQualityUrl(false);
  const target=state.qualityFocusReturn; state.qualityFocusReturn=null;
  if(target?.isConnected) target.focus(); else document.getElementById('s360QualityButton')?.focus();
}

function identityChips(supplier, identities) {
  const rows = (identities || []).filter(item => String(item.fornecedor_id) === String(supplier.id) && item.estado === 'confirmado');
  return rows.length ? `<div class="s360-identity-list">${rows.map(item => `<span class="s360-identity"><b>${htmlEscape(item.tipo)}</b>${htmlEscape(item.valor_original)}<small>${htmlEscape(item.origem)}</small></span>`).join('')}</div>` : `<div class="s360-empty">Nenhum alias externo confirmado. O nome/CNPJ do cadastro continuam válidos como identidade canônica.</div>`;
}

async function querySupplierFinance(supplier, identities) {
  const values = supplierQueryValues(supplier, identities);
  const fields = 'id,codigo,controle,ano_referencia,fornecedor,fornecedor_codigo,natureza,impacta_totais,categoria,titulo,status,data_inicio,data_fim,valor_acordado,origem_importacao,criado_em,atualizado_em';
  const queries = [];
  if (supplier.nome) queries.push(state.db.from('acompanhamento_registros').select(fields).ilike('fornecedor', supplier.nome).limit(300));
  for (const names of chunk(values.names.filter(name => normalizeSupplierText(name) !== normalizeSupplierText(supplier.nome)), 30)) {
    if (names.length) queries.push(state.db.from('acompanhamento_registros').select(fields).in('fornecedor', names).limit(300));
  }
  for (const codes of chunk(values.codes, 30)) {
    if (codes.length) queries.push(state.db.from('acompanhamento_registros').select(fields).in('fornecedor_codigo', codes).limit(300));
  }
  if (!queries.length) return { records:[], payments:[], composition:buildSupplierFinanceComposition([], [], { today:saoPauloDateKey() }) };
  const results = await Promise.all(queries);
  const errors = results.filter(item => item.error).map(item => item.error);
  if (errors.length === results.length) throw errors[0];
  const records = dedupeById(results.flatMap(item => item.data || [])).sort((a,b) => String(b.atualizado_em || '').localeCompare(String(a.atualizado_em || '')));
  const ids = records.map(row => row.id);
  const paymentResults = [];
  for (const idsPart of chunk(ids, 80)) {
    if (!idsPart.length) continue;
    const result = await state.db.from('acompanhamento_pagamentos')
      .select('id,registro_id,parcela,descricao,valor_previsto,valor_pago,vencimento,pago_em,status,forma_pagamento,criado_em,atualizado_em')
      .in('registro_id', idsPart)
      .order('vencimento', { ascending:true });
    if (result.error) throw result.error;
    paymentResults.push(...(result.data || []));
  }
  return { records, payments:paymentResults, composition:buildSupplierFinanceComposition(records, paymentResults, { today:saoPauloDateKey() }) };
}

async function querySupplierTasks(supplier) {
  const result = await state.db.from('tarefas')
    .select('id,titulo,descricao,status,prioridade,prazo,prazo_em,projeto,fornecedor_id,criado_em,atualizado_em,concluida_em')
    .eq('fornecedor_id', supplier.id)
    .order('atualizado_em', { ascending:false })
    .limit(160);
  if (result.error) throw result.error;
  return result.data || [];
}

async function querySupplierDocuments(supplier, identityIndex) {
  const result = await state.db.from('acompanhamento_documentos_itens')
    .select('id,entrada_id,tipo,confianca,status,dados_extraidos,dados_conferidos,registro_id,pagamento_id,criado_em,atualizado_em,entrada:acompanhamento_documentos_entrada(id,nome_arquivo,status,criado_em)')
    .order('criado_em', { ascending:false })
    .limit(450);
  if (result.error) throw result.error;
  return (result.data || []).filter(item => {
    const data = Object.keys(item.dados_conferidos || {}).length ? item.dados_conferidos : (item.dados_extraidos || {});
    const resolved = resolveSupplierIdentity({ name:data.fornecedor, code:data.fornecedor_codigo, cnpj:data.cnpj, source:'documentos' }, identityIndex, { source:'documentos' });
    return resolved.status === 'resolved' && String(resolved.supplier.id) === String(supplier.id);
  });
}

function campaignsForSupplier(supplier, identityIndex, local) {
  return (local.campaigns || []).filter(campaign => (campaign.suppliers || []).some(item => {
    const resolved = resolveSupplierIdentity({ code:item.id ?? item.code, name:item.name ?? item.nome, source:'sql_comercial' }, identityIndex, { source:'sql_comercial' });
    return resolved.status === 'resolved' && String(resolved.supplier.id) === String(supplier.id);
  }));
}


async function queryWave2SupplierData(supplier) {
  const [obligations, assets, contacts, trainings, followups, audit] = await Promise.all([
    safe('Pendências', async()=>{const r=await state.db.from('fornecedor_obrigacoes').select('*').eq('fornecedor_id',supplier.id).order('prazo',{ascending:true,nullsFirst:false}).limit(400);if(r.error)throw r.error;return r.data||[]}, []),
    safe('Materiais', async()=>{const r=await state.db.from('fornecedor_assets').select('*').eq('fornecedor_id',supplier.id).order('criado_em',{ascending:false}).limit(300);if(r.error)throw r.error;return r.data||[]}, []),
    safe('Contatos Wave 2', async()=>{const r=await state.db.from('fornecedor_contatos').select('*').eq('fornecedor_id',supplier.id).order('ativo',{ascending:false}).order('preferido',{ascending:false}).order('nome').limit(200);if(r.error)throw r.error;return r.data||[]}, []),
    safe('Academia Wave 2', async()=>{const r=await state.db.from('academia_reservas').select('id,titulo,descricao,inicio_em,fim_em,status,fornecedor_id,modalidade,local_treinamento').eq('tipo_registro','treinamento').eq('fornecedor_id',supplier.id).order('inicio_em',{ascending:false}).limit(150);if(r.error)throw r.error;return r.data||[]}, []),
    safe('Follow-ups', async()=>{const r=await state.db.from('fornecedor_followups').select('*,contato:fornecedor_contatos(id,nome,departamento)').eq('fornecedor_id',supplier.id).order('realizado_em',{ascending:false}).limit(200);if(r.error)throw r.error;return r.data||[]}, []),
    safe('Auditoria Wave 2', async()=>{const r=await state.db.from('operational_audit_events').select('*').eq('fornecedor_id',supplier.id).order('criado_em',{ascending:false}).limit(250);if(r.error)throw r.error;return r.data||[]}, []),
  ]);
  return { obligations, assets, contacts, trainings, followups, audit };
}

function buildTimeline(data) {
  const rows = [];
  (data.finance?.value?.records || []).forEach(record => rows.push({ date:record.atualizado_em || record.criado_em, type:'Financeiro', title:record.titulo || record.fornecedor || 'Acompanhamento financeiro', detail:money(record.valor_acordado), href:`/acompanhamento.html?registro=${encodeURIComponent(record.id)}` }));
  (data.finance?.value?.payments || []).filter(payment => payment.status === 'pago').forEach(payment => rows.push({ date:payment.pago_em || payment.atualizado_em, type:'Pagamento', title:payment.descricao || 'Pagamento confirmado', detail:money(payment.valor_pago || payment.valor_previsto), href:`/acompanhamento.html?view=pagamentos&registro=${encodeURIComponent(payment.registro_id)}` }));
  (data.tasks?.value || []).forEach(task => rows.push({ date:task.concluida_em || task.atualizado_em || task.criado_em, type:'Demanda', title:task.titulo, detail:task.status === 'concluida' ? 'Concluída' : 'Atualizada', href:`/demandas.html?tarefa=${encodeURIComponent(task.id)}` }));
  (data.documents?.value || []).forEach(item => rows.push({ date:item.atualizado_em || item.criado_em, type:'Documento', title:item.entrada?.nome_arquivo || 'Documento', detail:item.status === 'aprovado' ? 'Aprovado' : 'Atualizado', href:`/acompanhamento.html?view=documentos&documento=${encodeURIComponent(item.entrada_id)}` }));
  (data.campaigns?.value || []).forEach(campaign => rows.push({ date:campaign.updatedAt || campaign.createdAt || campaign.start, type:'Campanha', title:campaign.name || campaign.nome || 'Campanha', detail:campaign.end ? `Período até ${date(campaign.end)}` : 'Campanha relacionada', href:`/campanhas.html?campanha=${encodeURIComponent(campaign.id)}` }));
  (data.obligations?.value || []).forEach(item=>rows.push({date:item.atualizado_em||item.criado_em,type:'Pendência',title:item.titulo,detail:`${item.status||'pendente'} · ${item.direcao_responsabilidade==='fornecedor'?'aguardando fornecedor':item.direcao_responsabilidade==='pmg'?'aguardando PMG':'concluído'}`,href:`/operacoes.html?view=obrigacoes&obrigacao=${encodeURIComponent(item.id)}`}));
  (data.assets?.value || []).forEach(item=>rows.push({date:item.criado_em,type:'Material',title:item.nome_original||item.tipo||'Material recebido',detail:item.status_revisao||item.mime||'',href:`/operacoes.html?view=materiais&fornecedor=${encodeURIComponent(item.fornecedor_id)}`}));
  (data.followups?.value || []).forEach(item=>rows.push({date:item.realizado_em||item.criado_em,type:'Follow-up',title:`Cobrança via ${item.canal||'contato'}`,detail:item.contato?.nome||item.observacoes||'',href:`/operacoes.html?view=obrigacoes&fornecedor=${encodeURIComponent(item.fornecedor_id)}`}));
  (data.audit?.value || []).forEach(item=>rows.push({date:item.criado_em,type:'Operação',title:String(item.acao||'Atualização').replaceAll('_',' '),detail:item.entidade_tipo||'',href:`/operacoes.html?fornecedor=${encodeURIComponent(item.fornecedor_id||'')}`}));
  return rows.filter(item => item.date).sort((a,b) => new Date(b.date) - new Date(a.date)).slice(0,100);
}

async function loadSupplierData(supplier) {
  const identityIndex = state.identity.index;
  const localCampaigns = await safe('Campanhas', loadCampaignLocalContext, { campaigns:[], suppliers:[], available:false });
  const [finance, tasks, documents, wave2] = await Promise.all([
    safe('Financeiro', () => querySupplierFinance(supplier, state.identity.identities), { records:[], payments:[], composition:buildSupplierFinanceComposition([], [], { today:saoPauloDateKey() }) }),
    safe('Demandas', () => querySupplierTasks(supplier), []),
    safe('Documentos', () => querySupplierDocuments(supplier, identityIndex), []),
    queryWave2SupplierData(supplier),
  ]);
  const campaigns = localCampaigns.ok
    ? { ok:true, label:'Campanhas', value:campaignsForSupplier(supplier, identityIndex, localCampaigns.value) }
    : localCampaigns;
  const data = { finance, tasks, documents, campaigns, ...wave2 };
  data.timeline = buildTimeline(data);
  return data;
}

function statusChip(text, tone = '') { return `<span class="s360-chip ${tone}">${htmlEscape(text)}</span>`; }

function renderShell(supplier) {
  document.getElementById('s360Title').textContent = supplier.nome || 'Fornecedor';
  document.getElementById('s360Subtitle').textContent = [supplier.cnpj, supplier.categoria, `ID canônico ${supplier.id}`].filter(Boolean).join(' · ');
  const pendingAliases = state.identity.identities.filter(item => String(item.fornecedor_id) === String(supplier.id) && item.estado === 'sugerido').length;
  const values = supplierQueryValues(supplier, state.identity.identities);
  document.getElementById('s360Statusline').innerHTML = [
    statusChip(supplier.status === 'inativo' ? 'Inativo' : 'Ativo', supplier.status === 'inativo' ? 'danger' : 'good'),
    statusChip(state.identity.available ? 'Identidade canônica ativa' : 'Wave 1B SQL pendente', state.identity.available ? 'good' : 'attention'),
    pendingAliases ? statusChip(`${pendingAliases} identidade(s) para revisar`, 'attention') : '',
    values.codes.length ? statusChip(`${values.codes.length} código(s) externo(s)`) : '',
  ].join('');

  const tabs = [
    ['overview','Visão Geral'], ['pending','Pendências'], ['commercial','Comercial'], ['finance','Financeiro'], ['campaigns','Campanhas'],
    ['tasks','Demandas'], ['documents','Documentos'], ['materials','Materiais'], ['catalog','Catálogo'], ['contacts','Contatos'], ['academy','Academia'], ['history','Histórico'],
  ];
  document.getElementById('s360Tabs').innerHTML = tabs.map(([id,label]) => `<button type="button" data-s360-tab="${id}" class="${state.activeTab === id ? 'active' : ''}">${label}</button>`).join('');
  document.getElementById('s360HeadActions').innerHTML = `
    <a href="/demandas.html?fornecedor=${encodeURIComponent(supplier.id)}&nova=1">Nova demanda</a>
    <a href="/demandas.html?fornecedor=${encodeURIComponent(supplier.id)}">Ver demandas</a>
    <button type="button" data-s360-quality>Qualidade</button>
    <button type="button" class="s360-close" id="s360Close" aria-label="Fechar Fornecedor 360">×</button>`;
  document.getElementById('s360Close').addEventListener('click', closeSupplier360);
  document.querySelector('[data-s360-quality]')?.addEventListener('click', openQuality);
  document.querySelectorAll('[data-s360-tab]').forEach(button => button.addEventListener('click', () => {
    state.activeTab = button.dataset.s360Tab;
    renderShell(state.activeSupplier);
    renderActiveTab();
  }));
}

function sourceFailure(source) {
  return `<div class="s360-source-error"><strong>${htmlEscape(source.label)} temporariamente indisponível.</strong><br>${htmlEscape(source.error || 'A fonte falhou sem comprometer as demais seções.')}</div>`;
}

function freshnessCard(label, value) {
  return `<div class="s360-card s360-fresh"><b>${htmlEscape(label)}</b><span>${htmlEscape(value || 'Sem atualização conhecida')}</span></div>`;
}

function renderOverview() {
  const s = state.activeSupplier;
  const d = state.supplierData;
  const finance = d.finance.value?.composition || buildSupplierFinanceComposition([], [], { today:saoPauloDateKey() });
  const tasks = d.tasks.value || [];
  const docs = d.documents.value || [];
  const campaigns = d.campaigns.value || [];
  const openTasks = tasks.filter(item => item.status !== 'concluida').length;
  const overdueTasks = tasks.filter(item => item.status !== 'concluida' && String(item.prazo_em || item.prazo || '').slice(0,10) < saoPauloDateKey()).length;
  const pendingDocs = docs.filter(item => item.status === 'aguardando_conferencia').length;
  const activeCampaigns = campaigns.filter(item => {
    const today = saoPauloDateKey(), start = String(item.start || '').slice(0,10), end = String(item.end || '').slice(0,10);
    return start && end && today >= start && today <= end;
  }).length;
  const latestFinance = d.finance.value?.records?.[0]?.atualizado_em || null;
  const latestDoc = docs[0]?.atualizado_em || docs[0]?.criado_em || null;
  return `
    ${state.identity.available ? '' : `<div class="s360-install">A camada persistente de identidade ainda não existe neste banco. Execute <code>sql/26-FORNECEDOR-IDENTIDADE-WAVE1B.sql</code>. O Fornecedor 360 continua mostrando fontes que não dependem da migration.</div>`}
    <div class="s360-grid">
      <article class="s360-card"><span class="label">Comercial</span><strong class="value">${money(s.total_valor)}</strong><small>${number(s.total_pedidos)} pedidos · ${Number(s.total_kg || 0).toLocaleString('pt-BR',{maximumFractionDigits:1})} kg</small></article>
      <article class="s360-card"><span class="label">Financeiro acompanhado</span><strong class="value">${money(finance.totalFollowed)}</strong><small>${finance.recordCount} registro(s) associados</small><button class="lineage" type="button" data-s360-lineage>Ver composição →</button></article>
      <article class="s360-card"><span class="label">Saldo em aberto</span><strong class="value">${money(finance.totalOutstanding)}</strong><small>${finance.totalOverdue > 0 ? `${money(finance.totalOverdue)} vencidos` : 'Sem vencido identificado'}</small><button class="lineage" type="button" data-s360-lineage>Ver composição →</button></article>
      <article class="s360-card"><span class="label">Operação</span><strong class="value">${openTasks + pendingDocs}</strong><small>${openTasks} demanda(s) aberta(s) · ${pendingDocs} documento(s) para revisar</small></article>
      <article class="s360-card"><span class="label">Campanhas ativas</span><strong class="value">${activeCampaigns}</strong><small>${campaigns.length} campanha(s) relacionada(s) no navegador atual</small></article>
      <article class="s360-card"><span class="label">Demandas atrasadas</span><strong class="value">${overdueTasks}</strong><small>${tasks.length} demanda(s) vinculada(s) ao fornecedor</small></article>
      <article class="s360-card"><span class="label">Documentos</span><strong class="value">${docs.length}</strong><small>${pendingDocs} aguardando conferência</small></article>
      <article class="s360-card"><span class="label">Qualidade</span><strong class="value">${state.identity.identities.filter(item => String(item.fornecedor_id) === String(s.id) && item.estado === 'sugerido').length}</strong><small>identidades aguardando revisão</small></article>
    </div>
    <section class="s360-section"><div class="s360-section-head"><div><h3>Frescor das fontes</h3><p>Quando cada contexto relacionado ao fornecedor foi atualizado.</p></div></div><div class="s360-source-grid">
      ${freshnessCard('Comercial', s.ultimo_upload ? `Upload ${dateTime(s.ultimo_upload)}` : 'Sem upload registrado')}
      ${freshnessCard('Financeiro', latestFinance ? `Última atualização ${dateTime(latestFinance)}` : d.finance.ok ? 'Sem registros relacionados' : 'Fonte indisponível')}
      ${freshnessCard('Documentos', latestDoc ? `Último item ${dateTime(latestDoc)}` : d.documents.ok ? 'Sem documentos relacionados' : 'Fonte indisponível')}
      ${freshnessCard('Identidade', state.identity.available ? `Contexto carregado · ${state.identity.identities.length} identidade(s)` : 'Migration pendente')}
    </div></section>
    <section class="s360-section"><div class="s360-section-head"><div><h3>Identidades confirmadas</h3><p>Valores externos preservados que resolvem para este fornecedor canônico.</p></div></div>${identityChips(s,state.identity.identities)}</section>
    <section class="s360-section"><div class="s360-section-head"><div><h3>Atividade recente</h3><p>Eventos reconstruídos a partir das fontes originais, sem duplicar histórico.</p></div><button type="button" class="btn-ghost" data-s360-tab-jump="history">Ver tudo</button></div>${renderTimelineRows(d.timeline.slice(0,8))}</section>`;
}

function renderCommercial() {
  const s = state.activeSupplier;
  return `<div class="s360-grid">
    <article class="s360-card"><span class="label">Faturamento da carga</span><strong class="value">${money(s.total_valor)}</strong><small>Campo consolidado no cadastro do fornecedor.</small></article>
    <article class="s360-card"><span class="label">Pedidos</span><strong class="value">${number(s.total_pedidos)}</strong><small>${number(s.total_linhas)} linhas importadas.</small></article>
    <article class="s360-card"><span class="label">Volume</span><strong class="value">${Number(s.total_kg || 0).toLocaleString('pt-BR',{maximumFractionDigits:1})} kg</strong><small>Último upload: ${s.ultimo_upload ? dateTime(s.ultimo_upload) : 'nunca'}</small></article>
    <article class="s360-card"><span class="label">Sell-In configurado</span><strong class="value">${Number(s.pct_sellin || 0).toLocaleString('pt-BR',{maximumFractionDigits:2})}%</strong><small>Percentual configurado no cadastro.</small></article>
  </div><section class="s360-section"><div class="s360-section-head"><div><h3>Origem</h3><p>O Fornecedor 360 não recalcula o dashboard comercial: reaproveita os totais já mantidos pelo módulo de Fornecedores.</p></div></div><a class="s360-row" href="/fornecedores.html"><span><strong>Gestão de Fornecedores</strong><small>Abra uploads, Sell-In e dados detalhados na fonte operacional.</small></span><span class="s360-row-side">Abrir módulo →</span></a></section>`;
}

function renderFinance() {
  const source = state.supplierData.finance;
  if (!source.ok) return sourceFailure(source);
  const { composition, records } = source.value;
  return `<div class="s360-grid">
    <article class="s360-card"><span class="label">Valor acompanhado</span><strong class="value">${money(composition.totalFollowed)}</strong><small>${composition.recordCount} registro(s) que impactam totais.</small><button class="lineage" data-s360-lineage type="button">Ver composição →</button></article>
    <article class="s360-card"><span class="label">Realizado</span><strong class="value">${money(composition.totalRealized)}</strong><small>${composition.paymentCount} lançamento(s) financeiro(s).</small><button class="lineage" data-s360-lineage type="button">Ver composição →</button></article>
    <article class="s360-card"><span class="label">Em aberto</span><strong class="value">${money(composition.totalOutstanding)}</strong><small>Valor acompanhado menos pagamentos realizados por registro.</small><button class="lineage" data-s360-lineage type="button">Ver composição →</button></article>
    <article class="s360-card"><span class="label">Vencido</span><strong class="value">${money(composition.totalOverdue)}</strong><small>Parcelas abertas com vencimento anterior a hoje.</small><button class="lineage" data-s360-lineage type="button">Ver composição →</button></article>
  </div><section class="s360-section"><div class="s360-section-head"><div><h3>Registros financeiros relacionados</h3><p>Associação por nome/código canônico e aliases confirmados.</p></div></div><div class="s360-list">${records.length ? records.map(record => `<a class="s360-row" href="/acompanhamento.html?registro=${encodeURIComponent(record.id)}"><span><strong>${htmlEscape(record.titulo || record.fornecedor || 'Acompanhamento')}</strong><small>${htmlEscape([record.categoria,record.origem_importacao,record.fornecedor_codigo && `cód. ${record.fornecedor_codigo}`].filter(Boolean).join(' · '))}</small></span><span class="s360-row-side">${money(record.valor_acordado)}<br>${date(record.data_inicio)}</span></a>`).join('') : `<div class="s360-empty">Nenhum registro financeiro foi resolvido para este fornecedor.</div>`}</div></section>`;
}

function renderCampaigns() {
  const source = state.supplierData.campaigns;
  if (!source.ok) return sourceFailure(source);
  const rows = source.value || [];
  return `<section><div class="s360-section-head"><div><h3>Campanhas relacionadas</h3><p>Resolução por código confirmado, alias confirmado ou nome canônico exato.</p></div></div><div class="s360-list">${rows.length ? rows.map(campaign => `<a class="s360-row" href="/campanhas.html?campanha=${encodeURIComponent(campaign.id)}"><span><strong>${htmlEscape(campaign.name || campaign.nome || 'Campanha')}</strong><small>${htmlEscape((campaign.suppliers || []).map(item => `${item.name || item.nome} (${item.id ?? item.code ?? '—'})`).join(' · '))}</small></span><span class="s360-row-side">${campaign.start ? date(campaign.start) : '—'} → ${campaign.end ? date(campaign.end) : '—'}</span></a>`).join('') : `<div class="s360-empty">Nenhuma campanha do navegador atual foi resolvida para este fornecedor.</div>`}</div></section>`;
}

function renderTasks() {
  const source = state.supplierData.tasks;
  if (!source.ok) return `${sourceFailure(source)}<div class="s360-install">Se o erro mencionar <code>fornecedor_id</code>, execute a migration Wave 1B para habilitar vínculos persistentes de Demandas.</div>`;
  const rows = source.value || [];
  return `<section><div class="s360-section-head"><div><h3>Demandas vinculadas</h3><p>Vínculo persistente pelo ID canônico do fornecedor.</p></div><a class="btn-primary" href="/demandas.html?fornecedor=${encodeURIComponent(state.activeSupplier.id)}">Abrir Demandas</a></div><div class="s360-list">${rows.length ? rows.map(task => `<a class="s360-row" href="/demandas.html?tarefa=${encodeURIComponent(task.id)}"><span><strong>${htmlEscape(task.titulo)}</strong><small>${htmlEscape([task.projeto,task.prioridade,task.status].filter(Boolean).join(' · '))}</small></span><span class="s360-row-side">${task.prazo_em || task.prazo ? date(task.prazo_em || task.prazo) : 'Sem prazo'}</span></a>`).join('') : `<div class="s360-empty">Nenhuma demanda foi vinculada a este fornecedor.</div>`}</div></section>`;
}

function renderDocuments() {
  const source = state.supplierData.documents;
  if (!source.ok) return sourceFailure(source);
  const rows = source.value || [];
  return `<section><div class="s360-section-head"><div><h3>Documentos relacionados</h3><p>Fornecedor resolvido a partir dos dados conferidos/OCR, sem alterar o valor original extraído.</p></div></div><div class="s360-list">${rows.length ? rows.map(item => { const data=Object.keys(item.dados_conferidos || {}).length ? item.dados_conferidos : item.dados_extraidos || {}; return `<a class="s360-row" href="/acompanhamento.html?view=documentos&documento=${encodeURIComponent(item.entrada_id)}"><span><strong>${htmlEscape(item.entrada?.nome_arquivo || data.titulo_sugerido || 'Documento')}</strong><small>${htmlEscape([data.fornecedor,data.fornecedor_codigo && `cód. ${data.fornecedor_codigo}`,item.tipo].filter(Boolean).join(' · '))}</small></span><span class="s360-row-side">${htmlEscape(item.status)}<br>${date(item.criado_em)}</span></a>`; }).join('') : `<div class="s360-empty">Nenhum documento recente foi resolvido para este fornecedor.</div>`}</div></section>`;
}

function renderPending() {
  const source=state.supplierData.obligations;if(!source?.ok)return sourceFailure(source);const rows=source.value||[];const today=saoPauloDateKey();
  const open=rows.filter(o=>!['aprovado','dispensado'].includes(o.status));const overdue=open.filter(o=>o.prazo&&String(o.prazo).slice(0,10)<today);
  return `<div class="s360-grid"><article class="s360-card"><span class="label">Pendências abertas</span><strong class="value">${number(open.length)}</strong><small>${overdue.length} atrasada(s)</small></article><article class="s360-card"><span class="label">Aguardando fornecedor</span><strong class="value">${number(open.filter(o=>o.direcao_responsabilidade==='fornecedor').length)}</strong><small>Itens fora da ação PMG</small></article><article class="s360-card"><span class="label">Aguardando PMG</span><strong class="value">${number(open.filter(o=>o.direcao_responsabilidade==='pmg').length)}</strong><small>Revisão ou ação interna</small></article></div><section><div class="s360-section-head"><div><h3>Obrigações do fornecedor</h3><p>Fonte estruturada da Wave 2.</p></div><a class="btn-primary" href="/operacoes.html?view=obrigacoes&fornecedor=${encodeURIComponent(state.activeSupplier.id)}">Abrir Operações</a></div><div class="s360-list">${rows.length?rows.map(o=>`<a class="s360-row" href="/operacoes.html?view=obrigacoes&obrigacao=${encodeURIComponent(o.id)}"><span><strong>${htmlEscape(o.titulo)}</strong><small>${htmlEscape([o.tipo,o.status,o.direcao_responsabilidade==='fornecedor'?'Aguardando fornecedor':o.direcao_responsabilidade==='pmg'?'Aguardando PMG':'Concluído'].filter(Boolean).join(' · '))}</small></span><span class="s360-row-side">${o.prazo?date(o.prazo):'Sem prazo'}</span></a>`).join(''):'<div class="s360-empty">Nenhuma obrigação cadastrada.</div>'}</div></section>`;
}
function renderMaterials() {
  const source=state.supplierData.assets;if(!source?.ok)return sourceFailure(source);const rows=source.value||[];
  return `<section><div class="s360-section-head"><div><h3>Biblioteca de materiais</h3><p>Arquivos privados associados ao fornecedor.</p></div><a class="btn-primary" href="/operacoes.html?view=materiais&fornecedor=${encodeURIComponent(state.activeSupplier.id)}">Abrir Materiais</a></div><div class="s360-list">${rows.length?rows.map(a=>`<a class="s360-row" href="/operacoes.html?view=materiais&fornecedor=${encodeURIComponent(state.activeSupplier.id)}"><span><strong>${htmlEscape(a.nome_original||a.tipo||'Material')}</strong><small>${htmlEscape([a.tipo,a.mime,a.status_revisao].filter(Boolean).join(' · '))}</small></span><span class="s360-row-side">${a.tamanho_bytes?`${(Number(a.tamanho_bytes)/1048576).toFixed(1)} MB`:''}<br>${date(a.criado_em)}</span></a>`).join(''):'<div class="s360-empty">Nenhum material armazenado para este fornecedor.</div>'}</div></section>`;
}
function renderCatalog() {
  const obligations=state.supplierData.obligations?.value||[],assets=state.supplierData.assets?.value||[];const rows=obligations.filter(o=>o.contexto==='catalogo'||['anuncio_catalogo','logo','imagem_produto'].includes(o.tipo));
  return `<section><div class="s360-section-head"><div><h3>Participação no Catálogo</h3><p>Status estruturado por obrigação e material recebido.</p></div><a class="btn-primary" href="/operacoes.html?view=matriz&fornecedor=${encodeURIComponent(state.activeSupplier.id)}">Ver matriz</a></div><div class="s360-grid">${['anuncio_catalogo','logo','imagem_produto'].map(type=>{const item=rows.filter(o=>o.tipo===type).sort((a,b)=>String(b.atualizado_em||'').localeCompare(String(a.atualizado_em||'')))[0];const related=assets.filter(a=>a.obrigacao_id&&item&&String(a.obrigacao_id)===String(item.id));return `<article class="s360-card"><span class="label">${htmlEscape(type==='anuncio_catalogo'?'Anúncio':type==='logo'?'Logo':'Imagens de produto')}</span><strong class="value" style="font-size:17px">${htmlEscape(item?.status?.replaceAll('_',' ')||'Não solicitado')}</strong><small>${related.length?`${related.length} material(is) recebido(s)`:item?.prazo?`Prazo ${date(item.prazo)}`:'Sem registro'}</small></article>`}).join('')}</div><div class="s360-list">${rows.length?rows.map(o=>`<a class="s360-row" href="/operacoes.html?view=obrigacoes&obrigacao=${encodeURIComponent(o.id)}"><span><strong>${htmlEscape(o.titulo)}</strong><small>${htmlEscape(o.status)}</small></span><span class="s360-row-side">${o.prazo?date(o.prazo):'—'}</span></a>`).join(''):'<div class="s360-empty">Nenhum material de catálogo foi solicitado ainda.</div>'}</div></section>`;
}
function renderContacts() {
  const source=state.supplierData.contacts;if(!source?.ok)return sourceFailure(source);const rows=source.value||[];const departments=['Marketing','Comercial','Financeiro','Diretoria','Logística','Outros'];
  return `<section><div class="s360-section-head"><div><h3>Contatos por área</h3><p>Contatos inativos permanecem no histórico, mas não são priorizados em follow-ups.</p></div><a class="btn-primary" href="/operacoes.html?view=contatos&fornecedor=${encodeURIComponent(state.activeSupplier.id)}">Gerenciar contatos</a></div>${departments.map(dep=>{const items=rows.filter(c=>c.departamento===dep);if(!items.length)return'';return `<div class="s360-section"><h4>${dep}</h4><div class="s360-list">${items.map(c=>`<div class="s360-row"><span><strong>${htmlEscape(c.nome)}${c.preferido?' · Preferido':''}</strong><small>${htmlEscape([c.cargo,c.email,c.telefone||c.whatsapp].filter(Boolean).join(' · '))}</small></span><span class="s360-row-side">${c.ativo===false?'Inativo':'Ativo'}</span></div>`).join('')}</div></div>`}).join('')||'<div class="s360-empty">Nenhum contato múltiplo cadastrado.</div>'}</section>`;
}
function renderAcademy() {
  const source=state.supplierData.trainings;if(!source?.ok)return sourceFailure(source);const rows=source.value||[];
  return `<section><div class="s360-section-head"><div><h3>Academia PMG</h3><p>Treinamentos vinculados a este fornecedor/tema.</p></div><a class="btn-primary" href="/demandas.html?view=academia&fornecedor=${encodeURIComponent(state.activeSupplier.id)}">Abrir Academia</a></div><div class="s360-list">${rows.length?rows.map(t=>`<a class="s360-row" href="/demandas.html?view=academia&treinamento=${encodeURIComponent(t.id)}"><span><strong>${htmlEscape(t.titulo||'Treinamento')}</strong><small>${htmlEscape([t.modalidade,t.local_treinamento,t.status].filter(Boolean).join(' · '))}</small></span><span class="s360-row-side">${date(t.inicio_em)}</span></a>`).join(''):'<div class="s360-empty">Nenhum treinamento vinculado ao fornecedor.</div>'}</div></section>`;
}

function renderTimelineRows(rows) {
  return rows.length ? `<div class="s360-timeline">${rows.map(item => `<div class="s360-time"><span class="s360-time-date">${date(item.date)}</span><span class="s360-time-rail"><i class="s360-time-dot"></i></span><a class="s360-time-card" href="${attrEscape(item.href || '#')}"><strong>${htmlEscape(item.title)}</strong><small>${htmlEscape(item.type)} · ${htmlEscape(item.detail || '')}</small></a></div>`).join('')}</div>` : `<div class="s360-empty">Nenhuma atividade relacionada foi encontrada nas fontes disponíveis.</div>`;
}

function renderHistory() { return renderTimelineRows(state.supplierData.timeline || []); }

function renderLineage() {
  const source = state.supplierData?.finance;
  if (!source?.ok) return;
  const composition = source.value.composition;
  const sourceRows=composition.rows.map(row=>row.record);
  const dateKeys=sourceRows.flatMap(row=>[row.data_inicio,row.data_fim]).map(value=>String(value||'').slice(0,10)).filter(value=>/^\d{4}-\d{2}-\d{2}$/.test(value)).sort();
  const competencies=[...new Set(sourceRows.map(row=>row.ano_referencia).filter(Boolean))].sort();
  const lastUpdate=sourceRows.map(row=>row.atualizado_em||row.criado_em).filter(Boolean).sort().at(-1) || null;
  document.getElementById('s360LineageBody').innerHTML = `
    <div class="s360-lineage-summary">
      <div><span>Valor acompanhado</span><strong>${money(composition.totalFollowed)}</strong></div>
      <div><span>Realizado</span><strong>${money(composition.totalRealized)}</strong></div>
      <div><span>Em aberto</span><strong>${money(composition.totalOutstanding)}</strong></div>
      <div><span>Vencido</span><strong>${money(composition.totalOverdue)}</strong></div>
    </div>
    <div class="s360-install"><strong>Fonte:</strong> <code>acompanhamento_registros</code> + <code>acompanhamento_pagamentos</code>. <strong>Registros:</strong> ${composition.recordCount}. <strong>Período:</strong> ${dateKeys.length ? `${date(dateKeys[0])} a ${date(dateKeys.at(-1))}` : 'sem intervalo informado'}. <strong>Ano/competência:</strong> ${competencies.length ? competencies.join(', ') : 'não informado'}. <strong>Última atualização:</strong> ${lastUpdate ? dateTime(lastUpdate) : 'não informada'}.<br><strong>Método:</strong> valor acompanhado = soma de <code>valor_acordado</code> dos registros que impactam totais; realizado = soma dos pagamentos realizados; aberto = máximo de acordado − realizado por registro; vencido = parcelas abertas vencidas.</div>
    <div style="overflow:auto"><table class="s360-lineage-table"><thead><tr><th>Registro</th><th>Fonte</th><th>Fornecedor original</th><th class="num">Acompanhado</th><th class="num">Realizado</th><th class="num">Aberto</th><th class="num">Vencido</th></tr></thead><tbody>${composition.rows.map(row => `<tr><td><a href="/acompanhamento.html?registro=${encodeURIComponent(row.record.id)}">${htmlEscape(row.record.titulo || row.record.id)}</a></td><td>${htmlEscape(row.record.origem_importacao || row.record.controle || 'Central')}</td><td>${htmlEscape(row.record.fornecedor || '—')}</td><td class="num">${money(row.followed)}</td><td class="num">${money(row.realized)}</td><td class="num">${money(row.outstanding)}</td><td class="num">${money(row.overdue)}</td></tr>`).join('') || `<tr><td colspan="7">Nenhum registro compõe o indicador.</td></tr>`}</tbody></table></div>`;
  state.lineageFocusReturn=document.activeElement instanceof HTMLElement ? document.activeElement : null;
  document.getElementById('s360LineageModal').hidden = false;
  document.querySelector('[data-s360-close-lineage]')?.focus();
}

function bindTabContent() {
  document.querySelectorAll('[data-s360-lineage]').forEach(button => button.addEventListener('click', renderLineage));
  document.querySelectorAll('[data-s360-tab-jump]').forEach(button => button.addEventListener('click', () => {
    state.activeTab = button.dataset.s360TabJump;
    renderShell(state.activeSupplier);
    renderActiveTab();
  }));
}

function renderActiveTab() {
  const content = document.getElementById('s360Content');
  const renderers = { overview:renderOverview, pending:renderPending, commercial:renderCommercial, finance:renderFinance, campaigns:renderCampaigns, tasks:renderTasks, documents:renderDocuments, materials:renderMaterials, catalog:renderCatalog, contacts:renderContacts, academy:renderAcademy, history:renderHistory };
  content.innerHTML = (renderers[state.activeTab] || renderOverview)();
  bindTabContent();
}

async function openSupplier360(supplierId, trigger = document.activeElement) {
  state.focusReturn = trigger instanceof HTMLElement ? trigger : null;
  if (!state.identity) {
    try { state.identity = await loadSupplierIdentityContext(state.db); }
    catch (error) {
      console.warn('[Fornecedor 360] identidade indisponível, usando cadastro canônico:', error?.message || error);
      const result = await state.db.from('fornecedores').select('id,nome,cnpj,categoria,slug,contato,email,status,ultimo_upload,total_pedidos,total_linhas,total_valor,total_kg,pct_sellin,criado_em,atualizado_em').order('nome');
      if (result.error) throw result.error;
      const suppliers = result.data || [];
      state.identity = { suppliers, identities:[], decisions:[], available:false, installError:error, index:(await import('./supplier-identity-core.js')).buildSupplierIdentityIndex(suppliers, []) };
    }
  }
  const supplier = state.identity.suppliers.find(item => String(item.id) === String(supplierId));
  injectUi();
  const root = document.getElementById('s360Backdrop');
  root.hidden = false;
  document.body.style.overflow = 'hidden';
  state.activeTab = 'overview';
  state.activeSupplier = supplier || null;
  keepUrlSupplier(supplierId);
  if (!supplier) {
    document.getElementById('s360Title').textContent = 'Fornecedor não encontrado';
    document.getElementById('s360Subtitle').textContent = `ID canônico ${supplierId}`;
    document.getElementById('s360Tabs').innerHTML = '';
    document.getElementById('s360Statusline').innerHTML = statusChip('Não encontrado', 'danger');
    document.getElementById('s360Content').innerHTML = `<div class="s360-empty">O fornecedor informado não existe no cadastro atual ou não está acessível para esta sessão.</div>`;
    document.getElementById('s360Close')?.focus();
    return;
  }
  renderShell(supplier);
  document.getElementById('s360Content').innerHTML = `<div class="s360-loading">Conectando Financeiro, Demandas, Documentos e Campanhas…</div>`;
  state.supplierData = await loadSupplierData(supplier);
  renderActiveTab();
  document.getElementById('s360Close')?.focus();
}

async function loadExternalQualityRecords() {
  const [finance, documents, campaigns] = await Promise.all([
    safe('Qualidade · Financeiro', async () => {
      const result = await state.db.from('acompanhamento_registros').select('id,fornecedor,fornecedor_codigo,origem_importacao,atualizado_em').not('fornecedor','is',null).order('atualizado_em',{ascending:false}).limit(1500);
      if (result.error) throw result.error;
      return (result.data || []).map(row => ({ source:'acompanhamento', entityType:'financeiro', entityId:row.id, name:row.fornecedor, code:row.fornecedor_codigo, raw:row }));
    }, []),
    safe('Qualidade · Documentos', async () => {
      const result = await state.db.from('acompanhamento_documentos_itens').select('id,entrada_id,dados_extraidos,dados_conferidos,atualizado_em').order('atualizado_em',{ascending:false}).limit(500);
      if (result.error) throw result.error;
      return (result.data || []).map(row => { const data=Object.keys(row.dados_conferidos || {}).length ? row.dados_conferidos : (row.dados_extraidos || {}); return { source:'documentos', entityType:'documento', entityId:row.id, name:data.fornecedor, code:data.fornecedor_codigo, cnpj:data.cnpj, raw:row }; }).filter(item => item.name || item.code || item.cnpj);
    }, []),
    safe('Qualidade · Campanhas', async () => {
      const local = await loadCampaignLocalContext();
      return (local.suppliers || []).map(row => ({ source:'sql_comercial', entityType:'fornecedor_comercial', entityId:String(row.id ?? row.code ?? row.name), name:row.name || row.nome, code:row.id ?? row.code, raw:row }));
    }, []),
  ]);
  return { records:uniqueExternalSupplierRecords([...finance.value, ...documents.value, ...campaigns.value]), sources:[finance,documents,campaigns] };
}

function qualityStateLabel(issue) {
  if (issue.state === 'ignorado') return 'Ignorado';
  if (issue.state === 'resolvido') return 'Resolvido';
  return 'Pendente';
}

function issueDefaultSupplier(issue) {
  return issue.suggestedSupplier || issue.candidates?.[0] || issue.fuzzySuggestions?.[0]?.supplier || null;
}

async function resolveQualityIssue(issue, input) {
  if (!state.identity.available) throw new Error('Execute a migration Wave 1B antes de gravar identidades.');
  let supplier = issueDefaultSupplier(issue);
  const typed = String(input?.value || '').trim();
  if (typed) {
    const candidates = state.identity.suppliers.filter(item => normalizeSupplierText(item.nome) === normalizeSupplierText(typed));
    if (candidates.length !== 1) throw new Error('Escolha um fornecedor canônico pelo nome exato da lista.');
    supplier = candidates[0];
  }
  if (!supplier) throw new Error('Selecione o fornecedor canônico antes de vincular.');
  const external = issue.external || {};
  const type = external.code ? 'codigo' : external.cnpj ? 'cnpj' : 'alias';
  const value = external.code || external.cnpj || external.name;
  if (!value) throw new Error('O problema não possui uma identidade externa vinculável.');
  await registerSupplierIdentity(state.db, {
    supplierId:supplier.id, type, value, source:external.source || 'manual',
    state:isManager() ? 'confirmado' : 'sugerido',
    confidence:issue.fuzzySuggestions?.[0]?.score ?? null,
    notes:`Wave 1B · ${issue.type}`,
  });
}

async function qualityAction(event) {
  const button = event.target.closest('[data-quality-action]');
  if (!button) return;
  const index = Number(button.dataset.issueIndex);
  const issue = state.qualityIssues[index];
  if (!issue) return;
  button.disabled = true;
  try {
    const action = button.dataset.qualityAction;
    if (action === 'confirm-alias') await reviewSupplierIdentity(state.db, issue.identity.id, 'confirmado');
    else if (action === 'reject-alias') await reviewSupplierIdentity(state.db, issue.identity.id, 'rejeitado');
    else if (action === 'ignore') await saveSupplierQualityDecision(state.db, issue.key, 'ignorado', { notes:'Revisado na Qualidade dos Dados' });
    else if (action === 'resolve') {
      const input = document.querySelector(`[data-quality-input="${index}"]`);
      await resolveQualityIssue(issue, input);
    }
    await refreshQuality();
  } catch (error) {
    alert(error?.message || 'Não foi possível concluir a revisão.');
  } finally {
    button.disabled = false;
  }
}

function renderQuality(sources = []) {
  const body = document.getElementById('s360QualityBody');
  const issues = state.qualityIssues;
  const counts = issues.reduce((acc,item) => { acc[item.state] = (acc[item.state] || 0) + 1; return acc; }, {});
  const visible = state.qualityFilter === 'todos' ? issues : issues.filter(item => item.state === state.qualityFilter);
  const sourceWarnings = sources.filter(item => !item.ok);
  body.innerHTML = `
    ${state.identity.available ? '' : `<div class="s360-install"><strong>Migration pendente.</strong> A auditoria pode ser visualizada, mas aliases, decisões e vínculos não podem ser persistidos até executar <code>sql/26-FORNECEDOR-IDENTIDADE-WAVE1B.sql</code>.</div>`}
    ${sourceWarnings.length ? `<div class="s360-source-error"><strong>Qualidade parcial.</strong> ${sourceWarnings.map(item => `${htmlEscape(item.label)}: ${htmlEscape(item.error)}`).join('<br>')}</div>` : ''}
    <div class="s360-quality-toolbar">
      ${[['pendente','Pendentes',counts.pendente||0],['resolvido','Resolvidos',counts.resolvido||0],['ignorado','Ignorados',counts.ignorado||0],['todos','Todos',issues.length]].map(([id,label,count]) => `<button type="button" class="${state.qualityFilter===id?'active':''}" data-quality-filter="${id}">${label} · ${count}</button>`).join('')}
    </div>
    <datalist id="s360SupplierList">${state.identity.suppliers.map(item => `<option value="${attrEscape(item.nome)}">ID ${item.id}${item.cnpj ? ` · ${attrEscape(item.cnpj)}` : ''}</option>`).join('')}</datalist>
    <div class="s360-quality-list">${visible.slice(0,QUALITY_LIMIT).map((issue, index) => {
      const originalIndex = issues.indexOf(issue);
      const defaultSupplier = issueDefaultSupplier(issue);
      const canReview = isManager();
      const canResolve = issue.external && state.identity.available;
      return `<article class="s360-quality-item ${issue.severity}"><div class="s360-quality-top"><strong>${htmlEscape(issue.title)}</strong><span>${qualityStateLabel(issue)}</span></div><p>${htmlEscape(issue.detail)}</p>
        ${issue.fuzzySuggestions?.length ? `<p>Possíveis correspondências: ${issue.fuzzySuggestions.map(item => `${htmlEscape(item.supplier.nome)} (${Math.round(item.score*100)}%)`).join(' · ')}. <strong>Sem merge automático.</strong></p>` : ''}
        ${issue.state === 'pendente' ? `<div class="s360-quality-actions">
          ${canResolve ? `<input list="s360SupplierList" data-quality-input="${originalIndex}" value="${attrEscape(defaultSupplier?.nome || '')}" aria-label="Fornecedor canônico para ${attrEscape(issue.title)}"><button type="button" data-quality-action="resolve" data-issue-index="${originalIndex}">${canReview ? 'Confirmar vínculo' : 'Sugerir vínculo'}</button>` : ''}
          ${issue.type === 'pending_alias' && canReview ? `<button type="button" data-quality-action="confirm-alias" data-issue-index="${originalIndex}">Confirmar alias</button><button class="secondary" type="button" data-quality-action="reject-alias" data-issue-index="${originalIndex}">Rejeitar</button>` : ''}
          ${canReview && !['pending_alias'].includes(issue.type) ? `<button class="secondary" type="button" data-quality-action="ignore" data-issue-index="${originalIndex}">Ignorar intencionalmente</button>` : ''}
        </div>` : ''}
      </article>`;
    }).join('') || `<div class="s360-empty">Nenhum problema nesta visão.</div>`}</div>
    ${visible.length > QUALITY_LIMIT ? `<div class="s360-empty" style="margin-top:10px">Exibindo os primeiros ${QUALITY_LIMIT} de ${visible.length} problemas para manter a interface responsiva.</div>` : ''}`;
  state.qualitySources = sources;
}

async function refreshQuality() {
  state.qualityLoading = true;
  const body = document.getElementById('s360QualityBody');
  body.innerHTML = `<div class="s360-loading">Auditando identidades de Financeiro, Documentos e Campanhas…</div>`;
  try {
    state.identity = await loadSupplierIdentityContext(state.db);
    const external = await loadExternalQualityRecords();
    state.qualityIssues = buildSupplierQualityIssues({ suppliers:state.identity.suppliers, identities:state.identity.identities, externalRecords:external.records, decisions:state.identity.decisions });
    renderQuality(external.sources);
  } finally { state.qualityLoading = false; }
}

async function openQuality() {
  state.qualityFocusReturn=document.activeElement instanceof HTMLElement ? document.activeElement : null;
  injectUi();
  keepQualityUrl(true);
  document.getElementById('s360QualityModal').hidden = false;
  document.querySelector('[data-s360-close-quality]')?.focus();
  await refreshQuality();
}

async function bootstrap() {
  await window.PMGConnect.ready;
  state.db = window.PMGConnect.client;
  state.profile = window.PMGConnect.profile;
  injectUi();
  try { state.identity = await loadSupplierIdentityContext(state.db); }
  catch (error) { console.warn('[Fornecedor 360] contexto de identidade:', error?.message || error); }
  const params = new URLSearchParams(location.search);
  if (params.get('fornecedor')) await openSupplier360(params.get('fornecedor'), null);
  if (params.get('view') === 'qualidade') await openQuality();
}

window.PMGFornecedor360 = Object.freeze({
  open:openSupplier360,
  openQuality,
  close:closeSupplier360,
  refreshIdentity:async () => { state.identity = await loadSupplierIdentityContext(state.db); return state.identity; },
});

bootstrap().catch(error => console.error('[Fornecedor 360] inicialização:', error));
