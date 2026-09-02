import {
  buildHomeMetrics,
  buildOperationalAlerts,
  dateKey,
  normalizeText,
  searchLocalEntities,
  snapshotFreshness,
  summarizeAlerts,
} from './central-hoje-core.js';

const CAMPAIGN_DB = 'pmg_campanhas_db';
const CAMPAIGN_DB_VERSION = 2;
const CAMPAIGN_STORES = ['campanhas', 'config'];
const CAMPAIGN_CONTEXT_ID = 'commercial-context-v6';
const OPEN_PAYMENT_STATUS = ['previsto', 'solicitado', 'aprovado', 'agendado'];
const BRIDGE_STATUS_URL = 'http://localhost:3001/api/dados-diarios?acao=status';
const SEARCH_LIMIT = 8;

const state = {
  client:null,
  me:null,
  tasks:[],
  executors:[],
  payments:[],
  documents:[],
  suppliers:[],
  campaigns:[],
  representatives:[],
  products:[],
  recent:[],
  snapshot:null,
  sourceHealth:new Map(),
  alerts:[],
  metrics:null,
  alertFilter:'all',
  searchSeq:0,
  searchTimer:null,
  searchResults:[],
  searchActiveIndex:-1,
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;'
  }[char]));
}

function money(value) {
  return Number(value || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
}

function firstName() {
  return String(state.me?.nome || 'equipe PMG').trim().split(/\s+/)[0] || 'equipe PMG';
}

function currentGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

function relativeTime(value) {
  if (!value) return 'agora';
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return 'agora';
  const seconds = Math.max(0, Math.round((Date.now() - time) / 1000));
  if (seconds < 60) return 'agora';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `há ${days} dia${days === 1 ? '' : 's'}`;
  return new Date(time).toLocaleDateString('pt-BR');
}

function setSourceHealth(source, ok, detail = '') {
  state.sourceHealth.set(source, { ok:Boolean(ok), detail:String(detail || '') });
}

async function safeQuery(source, run, fallback = []) {
  try {
    const result = await run();
    if (result?.error) throw result.error;
    setSourceHealth(source, true);
    return result?.data ?? fallback;
  } catch (error) {
    console.warn(`[Central de Hoje] ${source}:`, error?.message || error);
    setSourceHealth(source, false, error?.message || 'Não foi possível consultar esta fonte.');
    return fallback;
  }
}

function futureDate(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

async function openIndexedDb() {
  if (!('indexedDB' in window)) return null;
  return new Promise(resolve => {
    const request = indexedDB.open(CAMPAIGN_DB, CAMPAIGN_DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      for (const store of CAMPAIGN_STORES) {
        if (!database.objectStoreNames.contains(store)) database.createObjectStore(store, { keyPath:'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
}

async function readStore(database, storeName) {
  if (!database || !database.objectStoreNames.contains(storeName)) return [];
  return new Promise(resolve => {
    const request = database.transaction(storeName).objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => resolve([]);
  });
}

async function loadCampaignLocalData() {
  const database = await openIndexedDb();
  if (!database) {
    setSourceHealth('Campanhas locais', false, 'IndexedDB indisponível.');
    return;
  }
  try {
    const [campaigns, configs] = await Promise.all([
      readStore(database, 'campanhas'),
      readStore(database, 'config'),
    ]);
    state.campaigns = campaigns || [];
    const contextRow = (configs || []).find(item => item?.id === CAMPAIGN_CONTEXT_ID) || null;
    const context = contextRow?.context || contextRow || null;
    state.representatives = context?.representatives || [];
    state.products = context?.products || [];
    setSourceHealth('Campanhas locais', true, `${state.campaigns.length} campanha(s)`);
  } finally {
    database.close();
  }
}

async function loadSnapshotStatus() {
  if (window.PMGDailySnapshot) {
    state.snapshot = window.PMGDailySnapshot;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(BRIDGE_STATUS_URL, { cache:'no-store', signal:controller.signal });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    if (!response.ok) throw new Error(data?.message || `HTTP ${response.status}`);
    state.snapshot = data || { unavailable:true };
    setSourceHealth('PMG Bridge', true, data?.message || 'Bridge respondeu normalmente.');
  } catch (error) {
    if (!state.snapshot) state.snapshot = { unavailable:true };
    setSourceHealth('PMG Bridge', false, error?.name === 'AbortError' ? 'Tempo limite ao consultar o Bridge.' : error?.message || 'Bridge indisponível.');
  } finally {
    clearTimeout(timer);
  }
}

async function loadPaymentWindow(db) {
  const today = dateKey();
  const select = 'id,registro_id,descricao,valor_previsto,valor_pago,vencimento,pago_em,status,favorecido,registro:acompanhamento_registros(id,codigo,fornecedor,titulo,categoria,controle,natureza)';
  const [overdue, upcoming] = await Promise.all([
    safeQuery('Financeiro vencidos', () => db.from('acompanhamento_pagamentos')
      .select(select)
      .in('status', OPEN_PAYMENT_STATUS)
      .lt('vencimento', today)
      .order('vencimento', { ascending:false })
      .limit(120)),
    safeQuery('Financeiro próximos', () => db.from('acompanhamento_pagamentos')
      .select(select)
      .in('status', OPEN_PAYMENT_STATUS)
      .gte('vencimento', today)
      .lte('vencimento', futureDate(7))
      .order('vencimento', { ascending:true })
      .limit(120)),
  ]);
  const overdueOk = state.sourceHealth.get('Financeiro vencidos')?.ok !== false;
  const upcomingOk = state.sourceHealth.get('Financeiro próximos')?.ok !== false;
  setSourceHealth('Financeiro', overdueOk && upcomingOk, overdueOk && upcomingOk ? '' : 'A agenda financeira respondeu parcialmente.');
  return [...overdue, ...upcoming].filter((payment, index, all) => all.findIndex(item => item.id === payment.id) === index);
}

async function loadPrimaryData() {
  const db = state.client;
  const profileId = state.me?.id;

  const [tasks, executors, payments, documents, suppliers, taskActivities, financeActivities] = await Promise.all([
    safeQuery('Demandas', () => db.from('tarefas').select('*').is('arquivada_em', null).order('atualizado_em', { ascending:false }).limit(800)),
    safeQuery('Responsáveis', () => db.from('tarefa_executores').select('tarefa_id,colaborador_id').limit(2500)),
    loadPaymentWindow(db),
    safeQuery('Documentos', () => db.from('acompanhamento_documentos_itens')
      .select('id,entrada_id,status,criado_em,dados_extraidos,entrada:acompanhamento_documentos_entrada(id,nome_arquivo,criado_em,status)')
      .eq('status', 'aguardando_conferencia')
      .order('criado_em', { ascending:true })
      .limit(150)),
    safeQuery('Fornecedores', () => db.from('fornecedores')
      .select('id,nome,cnpj,categoria,contato,email,status,ultimo_upload,atualizado_em')
      .order('nome', { ascending:true })
      .limit(700)),
    safeQuery('Histórico de demandas', () => db.from('atividades_tarefa')
      .select('id,tarefa_id,ator_id,tipo,detalhes,criado_em')
      .order('criado_em', { ascending:false })
      .limit(18)),
    safeQuery('Histórico financeiro', () => db.from('acompanhamento_atividades')
      .select('id,registro_id,tipo,resumo,criado_em,registro:acompanhamento_registros(id,codigo,fornecedor,titulo)')
      .order('criado_em', { ascending:false })
      .limit(18)),
  ]);

  state.tasks = tasks;
  state.executors = executors;
  state.payments = payments;
  state.documents = documents;
  state.suppliers = suppliers;

  const taskById = new Map(tasks.map(task => [task.id, task]));
  const recentTasks = taskActivities.map(activity => {
    const task = taskById.get(activity.tarefa_id);
    return {
      id:`task:${activity.id}`,
      module:'Demandas',
      title:task?.titulo || activity.detalhes?.titulo || 'Demanda atualizada',
      detail:activity.tipo ? `Ação: ${String(activity.tipo).replaceAll('_', ' ')}` : 'Atualização registrada',
      timestamp:activity.criado_em,
      href:task?.id ? `/demandas.html?tarefa=${encodeURIComponent(task.id)}` : '/demandas.html',
    };
  });
  const recentFinance = financeActivities.map(activity => ({
    id:`finance:${activity.id}`,
    module:'Financeiro',
    title:activity.registro?.fornecedor || activity.registro?.titulo || 'Acompanhamento atualizado',
    detail:activity.resumo || activity.tipo || 'Atualização registrada',
    timestamp:activity.criado_em,
    href:`/acompanhamento.html?registro=${encodeURIComponent(activity.registro_id || '')}`,
  }));
  state.recent = [...recentTasks, ...recentFinance]
    .filter(item => item.timestamp)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 14);

  if (profileId) {
    // Consulta propositalmente separada: uma tabela de notificações antiga não
    // deve derrubar toda a Central de Hoje.
    const notifications = await safeQuery('Notificações', () => db.from('notificacoes')
      .select('id,tarefa_id,tipo,lida,criado_em')
      .eq('colaborador_id', profileId)
      .eq('lida', false)
      .order('criado_em', { ascending:false })
      .limit(30));
    if (notifications.length) setSourceHealth('Notificações', true, `${notifications.length} não lida(s)`);
  }
}

function rebuildDerivedState() {
  const input = {
    me:state.me,
    tasks:state.tasks,
    executors:state.executors,
    payments:state.payments,
    documents:state.documents,
    suppliers:state.suppliers,
    campaigns:state.campaigns,
    snapshot:state.snapshot,
  };
  state.alerts = buildOperationalAlerts(input);
  state.metrics = buildHomeMetrics(input);
}

function severityLabel(level) {
  return ({ critical:'Crítico', important:'Importante', info:'Informativo' })[level] || 'Informativo';
}

function renderMetrics() {
  const metrics = state.metrics || {};
  const cards = [
    ['Demandas atrasadas', metrics.overdueTasks || 0, '/demandas.html', 'critical'],
    ['Pagamentos próximos', metrics.paymentDue || 0, '/acompanhamento.html?view=pagamentos', 'important'],
    ['Documentos para revisar', metrics.pendingDocuments || 0, '/acompanhamento.html?view=documentos', 'info'],
    ['Fornecedores pendentes', metrics.suppliersPending || 0, '/fornecedores.html?status=sem_dados', 'neutral'],
    ['Campanhas terminando', metrics.campaignsEnding || 0, '/campanhas.html', 'neutral'],
  ];
  $('#todayMetrics').innerHTML = cards.map(([label, value, href, tone]) => `
    <a class="metric-card ${tone}" href="${href}">
      <span>${escapeHtml(label)}</span>
      <strong>${Number(value || 0).toLocaleString('pt-BR')}</strong>
      <small>Ver detalhes →</small>
    </a>`).join('');
}

function filteredAlerts() {
  return state.alertFilter === 'all' ? state.alerts : state.alerts.filter(alert => alert.severity === state.alertFilter);
}

function renderAlertFilters() {
  const summary = summarizeAlerts(state.alerts);
  const options = [
    ['all', 'Todos', summary.total],
    ['critical', 'Críticos', summary.critical],
    ['important', 'Importantes', summary.important],
    ['info', 'Informativos', summary.info],
  ];
  $('#alertFilters').innerHTML = options.map(([id, label, count]) => `
    <button type="button" class="filter-chip ${state.alertFilter === id ? 'active' : ''}" data-alert-filter="${id}" aria-pressed="${state.alertFilter === id}">
      ${escapeHtml(label)} <span>${count}</span>
    </button>`).join('');
}

function renderAlerts() {
  renderAlertFilters();
  const list = filteredAlerts();
  const container = $('#attentionList');
  if (!list.length) {
    container.innerHTML = `<div class="empty-state"><strong>Nada pendente nesta visão.</strong><span>A rara ocasião em que o sistema não está apontando incêndio algum.</span></div>`;
    return;
  }
  container.innerHTML = list.slice(0, 20).map(alert => `
    <article class="alert-row ${alert.severity}">
      <span class="severity-dot" aria-hidden="true"></span>
      <div class="alert-main">
        <div class="alert-kicker">${escapeHtml(alert.category)} · ${severityLabel(alert.severity)}</div>
        <strong>${escapeHtml(alert.title)}</strong>
        <p>${escapeHtml(alert.description)}</p>
        ${Number.isFinite(alert.value) && alert.value !== 0 ? `<small>${money(alert.value)}</small>` : ''}
      </div>
      <a class="alert-action" href="${escapeHtml(alert.href || '#')}">${escapeHtml(alert.action || 'Abrir')} →</a>
    </article>`).join('');
}

function renderHealth() {
  const freshness = snapshotFreshness(state.snapshot);
  const supabaseSources = ['Demandas', 'Financeiro', 'Documentos', 'Fornecedores'];
  const supabaseOk = supabaseSources.every(source => state.sourceHealth.get(source)?.ok !== false);
  const campaignOk = state.sourceHealth.get('Campanhas locais')?.ok !== false;
  const bridge = state.sourceHealth.get('PMG Bridge');
  const items = [
    { name:'Supabase', ok:supabaseOk, detail:supabaseOk ? 'Fontes operacionais responderam.' : 'Uma ou mais fontes estão degradadas.' },
    { name:'PMG Bridge', ok:bridge?.ok, detail:bridge?.detail || 'Status ainda não consultado.' },
    { name:'Dados comerciais', ok:freshness.level === 'ok', warning:freshness.level !== 'ok', detail:freshness.detail },
    { name:'Campanhas locais', ok:campaignOk, detail:state.sourceHealth.get('Campanhas locais')?.detail || `${state.campaigns.length} campanha(s) no navegador.` },
  ];
  $('#healthList').innerHTML = items.map(item => `
    <div class="health-row ${item.ok ? 'ok' : item.warning ? 'warning' : 'error'}">
      <span class="health-status" aria-hidden="true"></span>
      <div><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.detail)}</small></div>
    </div>`).join('');
  const updated = state.snapshot?.updatedAt || state.snapshot?.lastAttemptAt;
  $('#freshnessBadge').className = `freshness-badge ${freshness.level}`;
  $('#freshnessBadge').textContent = freshness.level === 'ok'
    ? `Comercial atualizado${updated ? ` · ${new Date(updated).toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}` : ''}`
    : freshness.label;
}

function renderRecent() {
  const container = $('#recentList');
  if (!state.recent.length) {
    container.innerHTML = '<div class="empty-state compact"><strong>Sem alterações recentes disponíveis.</strong><span>As fontes continuam acessíveis pelos módulos originais.</span></div>';
    return;
  }
  container.innerHTML = state.recent.map(item => `
    <a class="recent-row" href="${escapeHtml(item.href)}">
      <span class="recent-module">${escapeHtml(item.module)}</span>
      <div><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.detail)}</small></div>
      <time datetime="${escapeHtml(item.timestamp)}">${escapeHtml(relativeTime(item.timestamp))}</time>
    </a>`).join('');
}

function renderHeader() {
  $('#todayGreeting').textContent = `${currentGreeting()}, ${firstName()}`;
  const now = new Date();
  $('#todayDate').textContent = now.toLocaleDateString('pt-BR', { weekday:'long', day:'2-digit', month:'long' });
  $('#sideUserName').textContent = state.me?.nome || 'Conta PMG';
  $('#sideUserRole').textContent = state.me?.cargo || (state.me?.role === 'gestor' ? 'Gestor' : 'Marketing');
}

function renderAll() {
  rebuildDerivedState();
  renderHeader();
  renderMetrics();
  renderAlerts();
  renderHealth();
  renderRecent();
  $('#lastRefresh').textContent = `Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })}`;
}

async function reloadAll({ quiet = false } = {}) {
  const button = $('#refreshToday');
  if (!quiet) {
    document.body.classList.add('is-refreshing');
    if (button) { button.disabled = true; button.setAttribute('aria-busy', 'true'); }
  }
  await Promise.all([loadPrimaryData(), loadCampaignLocalData(), loadSnapshotStatus()]);
  renderAll();
  if (!quiet) {
    document.body.classList.remove('is-refreshing');
    if (button) { button.disabled = false; button.removeAttribute('aria-busy'); }
  }
}

function openSearch() {
  const dialog = $('#globalSearchDialog');
  if (!dialog.open) dialog.showModal();
  const input = $('#globalSearchInput');
  input.value = '';
  state.searchResults = [];
  state.searchActiveIndex = -1;
  renderSearchResults([]);
  requestAnimationFrame(() => input.focus());
}

function closeSearch() {
  const dialog = $('#globalSearchDialog');
  if (dialog.open) dialog.close();
}

function resultKey(result) {
  return `${result.type}|${result.href}|${normalizeText(result.title)}`;
}

function dedupeResults(results) {
  const seen = new Set();
  return results.filter(result => {
    const key = resultKey(result);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 32);
}

async function searchRemote(query, seq) {
  const q = String(query || '').trim();
  if (q.length < 2 || !state.client) return [];
  const db = state.client;
  const pattern = `%${q}%`;
  const tasks = [
    safeQuery('Busca financeira fornecedor', () => db.from('acompanhamento_registros')
      .select('id,codigo,fornecedor,titulo,categoria,numero_documento')
      .ilike('fornecedor', pattern)
      .limit(SEARCH_LIMIT)),
    safeQuery('Busca financeira título', () => db.from('acompanhamento_registros')
      .select('id,codigo,fornecedor,titulo,categoria,numero_documento')
      .ilike('titulo', pattern)
      .limit(SEARCH_LIMIT)),
    safeQuery('Busca documentos', () => db.from('acompanhamento_documentos_entrada')
      .select('id,nome_arquivo,status,criado_em')
      .ilike('nome_arquivo', pattern)
      .limit(SEARCH_LIMIT)),
    fetch(`/api/produtos-supabase?busca=${encodeURIComponent(q)}&limite=${SEARCH_LIMIT}`, { cache:'no-store' })
      .then(async response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        return Array.isArray(data) ? data : (data?.produtos || data?.items || data?.data || []);
      })
      .catch(error => {
        console.warn('[Central de Hoje] busca de produtos:', error?.message || error);
        return [];
      }),
  ];
  const [recordsBySupplier, recordsByTitle, documents, products] = await Promise.all(tasks);
  if (seq !== state.searchSeq) return [];
  const records = [...recordsBySupplier, ...recordsByTitle].filter((record, index, all) => all.findIndex(item => item.id === record.id) === index);
  return [
    ...records.map(record => ({
      type:'Financeiro', icon:'$', title:record.fornecedor || record.titulo || 'Acompanhamento',
      detail:[record.codigo ? `#${record.codigo}` : '', record.titulo, record.numero_documento].filter(Boolean).join(' · '),
      href:`/acompanhamento.html?registro=${encodeURIComponent(record.id)}`,
    })),
    ...documents.map(document => ({
      type:'Documento', icon:'D', title:document.nome_arquivo || 'Documento', detail:document.status || 'Documento financeiro',
      href:`/acompanhamento.html?view=documentos&documento=${encodeURIComponent(document.id)}`,
    })),
    ...products.map(product => ({
      type:'Produto', icon:'P', title:product.nome || product.name || product.descricao || `Produto ${product.codigo || product.id || ''}`,
      detail:[product.codigo || product.id, product.categoria || product.category].filter(Boolean).join(' · '),
      href:`/campanhas.html?view=products&busca=${encodeURIComponent(product.nome || product.name || product.descricao || product.codigo || product.id || '')}`,
    })),
  ];
}

function renderSearchResults(results, query = '') {
  const container = $('#globalSearchResults');
  const hint = $('#searchHint');
  if (!query) {
    hint.textContent = 'Busque fornecedores, demandas, campanhas, pagamentos, documentos, produtos ou representantes.';
    container.innerHTML = `
      <div class="search-empty">
        <strong>Digite pelo menos 2 caracteres.</strong>
        <span>Ex.: McCain, campanha, nota fiscal ou nome de uma demanda.</span>
      </div>`;
    return;
  }
  hint.textContent = `${results.length} resultado${results.length === 1 ? '' : 's'} encontrado${results.length === 1 ? '' : 's'}`;
  if (!results.length) {
    container.innerHTML = `<div class="search-empty"><strong>Nenhum resultado.</strong><span>Tente nome, código, fornecedor ou uma parte do título.</span></div>`;
    return;
  }
  container.innerHTML = results.map((result, index) => `
    <a class="search-result ${index === state.searchActiveIndex ? 'active' : ''}" data-search-index="${index}" href="${escapeHtml(result.href)}">
      <span class="search-icon">${escapeHtml(result.icon || result.type?.[0] || '?')}</span>
      <span class="search-copy"><small>${escapeHtml(result.type)}</small><strong>${escapeHtml(result.title)}</strong><em>${escapeHtml(result.detail || '')}</em></span>
      <span class="search-open">↵</span>
    </a>`).join('');
}

async function runSearch(value) {
  const query = String(value || '').trim();
  const seq = ++state.searchSeq;
  state.searchActiveIndex = -1;
  if (query.length < 2) {
    state.searchResults = [];
    renderSearchResults([], query);
    return;
  }
  $('#searchHint').textContent = 'Buscando…';
  const local = searchLocalEntities(query, state);
  renderSearchResults(local, query);
  const remote = await searchRemote(query, seq);
  if (seq !== state.searchSeq) return;
  state.searchResults = dedupeResults([...local, ...remote]);
  renderSearchResults(state.searchResults, query);
}

function bindEvents() {
  $('#refreshToday')?.addEventListener('click', () => reloadAll());
  $('#openGlobalSearch')?.addEventListener('click', openSearch);
  $('#heroSearch')?.addEventListener('click', openSearch);
  $('#closeGlobalSearch')?.addEventListener('click', closeSearch);
  $('#globalSearchDialog')?.addEventListener('click', event => {
    if (event.target === $('#globalSearchDialog')) closeSearch();
  });

  $('#alertFilters')?.addEventListener('click', event => {
    const button = event.target.closest('[data-alert-filter]');
    if (!button) return;
    state.alertFilter = button.dataset.alertFilter || 'all';
    renderAlerts();
  });

  $('#globalSearchInput')?.addEventListener('input', event => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => runSearch(event.target.value), 220);
  });

  $('#globalSearchInput')?.addEventListener('keydown', event => {
    if (!state.searchResults.length) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const delta = event.key === 'ArrowDown' ? 1 : -1;
      state.searchActiveIndex = (state.searchActiveIndex + delta + state.searchResults.length) % state.searchResults.length;
      renderSearchResults(state.searchResults, event.currentTarget.value.trim());
      $(`[data-search-index="${state.searchActiveIndex}"]`)?.scrollIntoView({ block:'nearest' });
    }
    if (event.key === 'Enter' && state.searchActiveIndex >= 0) {
      event.preventDefault();
      location.href = state.searchResults[state.searchActiveIndex].href;
    }
  });

  document.addEventListener('keydown', event => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
    }
  });

  document.addEventListener('pmg:daily-snapshot', event => {
    state.snapshot = event.detail || state.snapshot;
    setSourceHealth('PMG Bridge', true, 'Snapshot atualizado em segundo plano.');
    renderAll();
  });

  window.addEventListener('focus', () => {
    if (document.visibilityState === 'visible') void loadSnapshotStatus().then(() => { rebuildDerivedState(); renderHealth(); renderAlerts(); });
  });
}

async function init() {
  try {
    await window.PMGConnect.ready;
    state.client = window.PMGConnect.client;
    state.me = window.PMGConnect.profile || null;
    renderHeader();
    bindEvents();
    await reloadAll();
  } catch (error) {
    console.error('[Central de Hoje] falha de inicialização:', error);
    document.body.classList.remove('is-refreshing');
    $('#attentionList').innerHTML = `
      <div class="fatal-state"><strong>Não foi possível montar a Central de Hoje.</strong><span>${escapeHtml(error?.message || 'A sessão ou as fontes operacionais não responderam.')}</span><button type="button" id="retryCentral">Tentar novamente</button></div>`;
    $('#retryCentral')?.addEventListener('click', () => location.reload());
  }
}

document.addEventListener('DOMContentLoaded', init, { once:true });
