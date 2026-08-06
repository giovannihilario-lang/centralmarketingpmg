(() => {
  'use strict';

  const SQL_BASE_KEY = 'pmg_campaigns_sql_base';
  const THEME_KEY = 'pmg_theme';
  const CONTEXT_ID = 'commercial-context-v5';
  const SQL_BASE = String(localStorage.getItem(SQL_BASE_KEY) || window.PMG_SQL_API_BASE || 'http://localhost:3001/api').replace(/\/$/, '');
  const SQL_ENDPOINT = `${SQL_BASE}/campanhas-data`;
  const VISUAL_ENDPOINT = '/api/produtos-supabase';
  const DB_NAME = 'pmg_campanhas_db';
  const DB_VERSION = 2;
  const STORES = ['campanhas', 'produtos', 'representantes', 'vendas', 'regras', 'regrasProduto', 'mapeamentos', 'apuracoes', 'config'];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
  const norm = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 });
  const number = (value, digits = 0) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits:digits, minimumFractionDigits:digits });
  const pct = (value) => `${Number(value || 0) >= 0 ? '+' : ''}${number(value, 1)}%`;
  const dateBR = (value) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const RANKING_METRICS = [
    { id:'points', label:'Pontos', icon:'sparkles', description:'Pontuação total gerada pelas regras da campanha' },
    { id:'revenue', label:'Faturamento', icon:'badge-dollar-sign', description:'Valor vendido no período da campanha' },
    { id:'kg', label:'Volume em KG', icon:'weight', description:'Quantidade total vendida em quilos' },
    { id:'pieces', label:'Peças', icon:'package', description:'Quantidade total vendida em peças' },
    { id:'positivity', label:'Positivação', icon:'user-round-plus', description:'Clientes atuais menos clientes do período anterior' },
    { id:'mix', label:'Mix de categorias', icon:'boxes', description:'Percentual de categorias obrigatórias cumpridas' },
    { id:'revenueGrowth', label:'Crescimento de R$', icon:'trending-up', description:'Crescimento percentual do faturamento' },
    { id:'kgGrowth', label:'Crescimento de KG', icon:'chart-no-axes-combined', description:'Crescimento percentual do volume' },
  ];

  const BASE_METRICS = [
    ['positivity', 'Positivação líquida', 'clientes'],
    ['revenue', 'Faturamento', 'R$'],
    ['kg', 'Volume', 'KG'],
    ['pieces', 'Peças', 'unidades'],
    ['points', 'Pontos', 'pontos'],
    ['customers', 'Clientes únicos', 'clientes'],
    ['mix', 'Mix de categorias', '%'],
    ['orders', 'Pedidos', 'pedidos'],
  ];

  const GROWTH_METRICS = [
    ['revenue', 'Faturamento'], ['kg', 'Volume em KG'], ['pieces', 'Peças'], ['customers', 'Clientes únicos'], ['orders', 'Pedidos'],
  ];

  const POINT_SOURCES = [
    ['positivity', 'Positivação líquida'], ['revenue', 'Faturamento'], ['kg', 'Volume em KG'], ['pieces', 'Peças'],
    ['customers', 'Clientes únicos'], ['orders', 'Pedidos'], ['mixCategories', 'Categorias de mix cumpridas'], ['distinctProducts', 'Produtos distintos'],
  ];

  const TIE_OPTIONS = [
    ['positivity', 'Maior positivação'], ['revenue', 'Maior faturamento'], ['kg', 'Maior volume'], ['pieces', 'Mais peças'],
    ['mix', 'Maior mix'], ['points', 'Maior pontuação'], ['orders', 'Mais pedidos'],
    ['revenueGrowth', 'Maior crescimento de faturamento'], ['kgGrowth', 'Maior crescimento de volume'],
  ];

  const STEPS = [
    { title:'Informações gerais', subtitle:'Período, fornecedores e participantes' },
    { title:'Ranking e metas', subtitle:'Métricas, metas e elegibilidade' },
    { title:'Produtos e categorias', subtitle:'Escopo, mix e pontuação por produto' },
    { title:'Desempate e premiação', subtitle:'Prioridades, bônus e classificados' },
  ];

  let db;
  const DB = {
    async init() {
      if (db) return db;
      db = await new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const instance = req.result;
          for (const name of STORES) if (!instance.objectStoreNames.contains(name)) instance.createObjectStore(name, { keyPath:'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      return db;
    },
    async all(store) { await this.init(); return new Promise((resolve, reject) => { const req = db.transaction(store).objectStore(store).getAll(); req.onsuccess=()=>resolve(req.result||[]); req.onerror=()=>reject(req.error); }); },
    async get(store, id) { await this.init(); return new Promise((resolve, reject) => { const req = db.transaction(store).objectStore(store).get(id); req.onsuccess=()=>resolve(req.result||null); req.onerror=()=>reject(req.error); }); },
    async put(store, value) { await this.init(); return new Promise((resolve, reject) => { const req = db.transaction(store,'readwrite').objectStore(store).put(value); req.onsuccess=()=>resolve(value); req.onerror=()=>reject(req.error); }); },
    async remove(store, id) { await this.init(); return new Promise((resolve, reject) => { const req = db.transaction(store,'readwrite').objectStore(store).delete(id); req.onsuccess=()=>resolve(); req.onerror=()=>reject(req.error); }); },
  };

  const app = {
    view:'dashboard', campaigns:[], context:{ suppliers:[], products:[], representatives:[] }, contextReady:false, contextCached:false,
    contextStatus:null, contextPromise:null, useCachedAllowed:false, campaignSearch:'', productSearch:'', representativeSearch:'',
    wizard:null, performance:null, imageCache:new Map(), imageAttempted:new Set(), imageInFlight:new Map(), apiInFlight:new Map(), apiCache:new Map(),
  };

  function icons(root = document) {
    const run = () => { try { window.lucide?.createIcons({ attrs:{ 'stroke-width':1.9 } }); } catch (_) {} };
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout:450 }); else setTimeout(run, 30);
  }

  function toast(message, type = '') {
    const node = document.createElement('div');
    node.className = `toast ${type}`;
    node.textContent = message;
    $('#toastStack').append(node);
    setTimeout(() => node.remove(), 4500);
  }

  function setProgress(active) {
    const bar = $('#progressLine');
    bar.classList.toggle('is-loading', active);
    if (!active) { bar.classList.add('is-done'); setTimeout(() => bar.classList.remove('is-done'), 300); }
  }

  function setSideStatus(status, detail) {
    const box = $('#sideStatus');
    box.classList.remove('is-online', 'is-error');
    if (status === 'online') box.classList.add('is-online');
    if (status === 'error') box.classList.add('is-error');
    $('#sideStatusDetail').textContent = detail || '';
  }

  function apiKey(url, options = {}) { return `${options.method || 'GET'}:${url}:${options.body || ''}`; }
  async function api(url, options = {}) {
    const key = apiKey(url, options);
    const cacheable = (options.method || 'GET') === 'GET' && !options.force;
    const cached = app.apiCache.get(key);
    if (cacheable && cached && Date.now() - cached.at < (options.ttl || 60000)) return cached.data;
    if (cacheable && app.apiInFlight.has(key)) return app.apiInFlight.get(key);

    const promise = (async () => {
      let response;
      try {
        response = await fetch(url, { ...options, headers:{ 'Content-Type':'application/json', ...(options.headers || {}) } });
      } catch (error) {
        const networkError = new Error(`Não foi possível acessar a API local em ${SQL_BASE}. Execute npm start e mantenha o terminal aberto.`);
        networkError.cause = error;
        throw networkError;
      }
      const raw = await response.text();
      let data;
      try { data = raw ? JSON.parse(raw) : {}; }
      catch { throw new Error(`A API respondeu HTTP ${response.status} sem JSON: ${raw.slice(0,180) || 'resposta vazia'}`); }
      if (!response.ok && response.status !== 202) {
        const error = new Error(data.erro || data.message || `Falha HTTP ${response.status}`);
        error.code = data.codigo;
        error.hint = data.dica;
        throw error;
      }
      if (cacheable && response.ok) app.apiCache.set(key, { at:Date.now(), data });
      return data;
    })().finally(() => app.apiInFlight.delete(key));
    if (cacheable) app.apiInFlight.set(key, promise);
    return promise;
  }

  async function loadCachedContext() {
    const row = await DB.get('config', CONTEXT_ID);
    if (!row?.context) return null;
    app.context = row.context;
    app.contextCached = true;
    app.useCachedAllowed = true;
    return row;
  }

  async function saveContext(context, updatedAt) {
    await DB.put('config', { id:CONTEXT_ID, context, updatedAt:updatedAt || new Date().toISOString() });
  }

  function updateContextOverlay(status = {}) {
    app.contextStatus = status;
    const pctValue = Math.max(0, Math.min(100, Number(status.progress) || 0));
    $('#contextProgressBar').style.width = `${pctValue}%`;
    $('#contextProgressPct').textContent = `${pctValue}%`;
    $('#contextProgressText').textContent = status.message || 'Preparando contexto…';
    const order = ['connect','query','organize','cache','ready'];
    const currentIndex = order.indexOf(status.phase);
    $$('#contextSteps [data-phase]').forEach((node) => {
      const index = order.indexOf(node.dataset.phase);
      node.classList.toggle('is-active', index === currentIndex);
      node.classList.toggle('is-done', currentIndex > index || status.phase === 'ready');
      const icon = node.querySelector('i');
      if (icon) icon.setAttribute('data-lucide', node.classList.contains('is-done') ? 'circle-check' : node.classList.contains('is-active') ? 'loader-circle' : 'circle');
    });
    const isError = status.status === 'error';
    $('#contextError').hidden = !isError;
    $('#contextError').textContent = isError ? `${status.error?.message || status.message || 'Falha ao preparar o contexto.'}${status.error?.code ? ` · ${status.error.code}` : ''}` : '';
    $('#retryContext').hidden = !isError;
    $('#useCachedContext').hidden = !(isError && app.useCachedAllowed);
    icons($('#contextOverlay'));
  }

  async function pollContext({ force = false, blocking = true } = {}) {
    if (app.contextPromise) return app.contextPromise;
    app.contextPromise = (async () => {
      const overlay = $('#contextOverlay');
      if (blocking) {
        overlay.hidden = false;
        document.body.style.overflow = 'hidden';
      }
      if (force) app.apiCache.clear();

      try {
        await api(`${SQL_ENDPOINT}?recurso=contexto-preparar&force=${force ? 'true' : 'false'}`, { method:'POST', force:true });
        let attempts = 0;
        while (attempts < 300) {
          attempts += 1;
          const status = await api(`${SQL_ENDPOINT}?recurso=contexto-status&_=${Date.now()}`, { force:true });
          if (blocking) updateContextOverlay(status);
          else setSideStatus(status.status === 'error' ? 'error' : 'online', status.message || 'Atualizando contexto em segundo plano…');
          if (status.ready) {
            const payload = await api(`${SQL_ENDPOINT}?recurso=contexto&_=${Date.now()}`, { force:true });
            if (payload.context) {
              app.context = payload.context;
              app.contextReady = true;
              app.contextCached = true;
              app.useCachedAllowed = true;
              await saveContext(payload.context, payload.updatedAt);
              setSideStatus('online', `${payload.context.suppliers.length} códigos · ${payload.context.products.length} produtos · ${payload.context.representatives.length} representantes ativos`);
              if (blocking) {
                await sleep(180);
                overlay.hidden = true;
                document.body.style.overflow = '';
              }
              renderView();
              return payload.context;
            }
          }
          if (status.status === 'error') throw Object.assign(new Error(status.error?.message || status.message), { code:status.error?.code });
          await sleep(650);
        }
        throw new Error('A preparação do contexto excedeu o tempo esperado.');
      } catch (error) {
        setSideStatus('error', error.message);
        if (blocking) updateContextOverlay({ status:'error', phase:'error', progress:0, message:error.message, error:{ message:error.message, code:error.code } });
        else toast('Não foi possível atualizar o contexto. O último contexto salvo continua em uso.', 'warning');
        throw error;
      } finally {
        app.contextPromise = null;
      }
    })();
    return app.contextPromise;
  }

  async function initializeContext() {
    const cached = await loadCachedContext();
    if (cached) {
      app.contextReady = true;
      setSideStatus('online', `Contexto local: ${app.context.suppliers.length} códigos · atualização em segundo plano`);
      renderView();
      // Depois do primeiro carregamento, o sistema abre instantaneamente e atualiza sem bloquear a tela.
      void pollContext({ force:false, blocking:false }).catch(() => {});
      return;
    }
    try {
      await pollContext({ force:false, blocking:true });
    } catch (_) {
      // A própria tela de preparação exibe o erro e permite tentar novamente.
    }
  }

  function campaignStatus(campaign) {
    const today = new Date(); today.setHours(0,0,0,0);
    const start = campaign.start ? new Date(`${campaign.start}T12:00:00`) : null;
    const end = campaign.end ? new Date(`${campaign.end}T12:00:00`) : null;
    if (!start || !end) return { id:'draft', label:'Rascunho', class:'closed' };
    if (today < start) return { id:'scheduled', label:'Agendada', class:'scheduled' };
    if (today >= end) return { id:'closed', label:'Encerrada', class:'closed' };
    return { id:'active', label:'Ativa', class:'active' };
  }

  function daysUntil(value) {
    if (!value) return null;
    const target = new Date(`${value}T12:00:00`);
    const today = new Date(); today.setHours(12,0,0,0);
    return Math.ceil((target - today) / 86400000);
  }

  async function loadCampaigns() {
    app.campaigns = (await DB.all('campanhas')).map(normalizeCampaign).sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    $('#navCampaignCount').textContent = app.campaigns.length;
  }

  function selectedSupplierLabel(campaign) {
    const suppliers = campaign.suppliers || [];
    if (!suppliers.length) return 'Fornecedores não definidos';
    if (suppliers.length === 1) return `${suppliers[0].name} · cód. ${suppliers[0].id}`;
    return `${suppliers[0].name} + ${suppliers.length - 1} código(s)`;
  }

  function campaignCard(campaign) {
    const status = campaignStatus(campaign);
    const productCount = (campaign.categories || []).reduce((sum, category) => sum + (category.products || []).length, 0);
    const rulesCount = (campaign.rules || []).length + (campaign.collectiveGoals || []).length + (campaign.individualGoals || []).length + (campaign.pointRules || []).length;
    return `<article class="campaign-card">
      <div class="campaign-card-top">
        <span class="badge ${status.class}">${status.label}</span>
        <h3>${esc(campaign.name || 'Campanha sem nome')}</h3>
        <p>${esc(selectedSupplierLabel(campaign))}</p>
      </div>
      <div class="campaign-card-body">
        <div class="campaign-meta">
          <div><span>Período</span><strong>${dateBR(campaign.start)} – ${dateBR(campaign.end)}</strong></div>
          <div><span>Produtos</span><strong>${number(productCount)}</strong></div>
          <div><span>Regras</span><strong>${number(rulesCount)}</strong></div>
        </div>
        <div class="campaign-actions">
          <button class="secondary-btn" type="button" data-action="edit-campaign" data-id="${esc(campaign.id)}"><i data-lucide="pencil"></i>Editar</button>
          <button class="primary-btn" type="button" data-action="performance" data-id="${esc(campaign.id)}"><i data-lucide="chart-no-axes-combined"></i>Performance</button>
        </div>
      </div>
    </article>`;
  }

  function emptyState(title, text, action = '') {
    return `<div class="empty-state"><div class="empty-icon"><i data-lucide="megaphone"></i></div><h3>${esc(title)}</h3><p>${esc(text)}</p>${action}</div>`;
  }

  function renderDashboard() {
    const active = app.campaigns.filter((campaign) => campaignStatus(campaign).id === 'active');
    const scheduled = app.campaigns.filter((campaign) => campaignStatus(campaign).id === 'scheduled');
    const closed = app.campaigns.filter((campaign) => campaignStatus(campaign).id === 'closed');
    const next = [...active, ...scheduled].sort((a,b) => String(a.end).localeCompare(String(b.end))).slice(0,5);
    $('#pageRoot').innerHTML = `
      <div class="hero-grid">
        <section class="hero"><div class="hero-content"><span class="eyebrow">Motor de campanhas PMG</span><h2>Construa, acompanhe e apure campanhas sem sair do fluxo.</h2><p>Fornecedores, produtos, mix, metas coletivas e individuais, crescimento percentual e ranking por vendedor em um único espaço.</p><div class="hero-actions"><button class="primary-btn" data-action="new-campaign"><i data-lucide="plus"></i>Nova campanha</button><button class="secondary-btn" data-view="campaigns"><i data-lucide="list-filter"></i>Ver campanhas</button></div></div></section>
        <aside class="quick-panel"><span class="eyebrow">Acesso rápido</span><h3>Comece por aqui</h3><div class="quick-list">
          <button class="quick-item" data-action="new-campaign"><span class="quick-icon"><i data-lucide="wand-sparkles"></i></span><span><strong>Criar estrutura</strong><small>Configure período, fornecedores e regras.</small></span></button>
          <button class="quick-item" data-view="products"><span class="quick-icon"><i data-lucide="package-search"></i></span><span><strong>Explorar catálogo</strong><small>Consulte produtos do contexto preparado.</small></span></button>
          <button class="quick-item" data-view="representatives"><span class="quick-icon"><i data-lucide="users"></i></span><span><strong>Ver representantes</strong><small>Somente vendedores ativos.</small></span></button>
        </div></aside>
      </div>
      <div class="kpi-grid">
        ${kpi('Campanhas ativas', active.length, `${app.campaigns.length} total`, 'activity')}
        ${kpi('Produtos carregados', app.context.products.length, 'Contexto local', 'package-check')}
        ${kpi('Representantes ativos', app.context.representatives.length, 'dbo.Clientes', 'users-round')}
        ${kpi('Campanhas agendadas', scheduled.length, 'Próximas', 'calendar-clock')}
      </div>
      <div class="dashboard-grid">
        <section class="section-card"><div class="section-head"><div><span class="eyebrow">Em andamento</span><h3>Campanhas que pedem atenção</h3></div><button class="secondary-btn" data-view="campaigns">Ver todas</button></div>
          ${active.length ? `<div class="campaign-grid">${active.slice(0,4).map(campaignCard).join('')}</div>` : emptyState('Nenhuma campanha ativa', 'Crie uma campanha ou aguarde o início das campanhas agendadas.', '<button class="primary-btn" data-action="new-campaign">Nova campanha</button>')}
        </section>
        <aside><section class="section-card"><span class="eyebrow">Agenda</span><h3>Próximos fechamentos</h3><div class="agenda-list">${next.length ? next.map((campaign) => `<div class="agenda-item"><span class="agenda-dot"><i data-lucide="calendar-days"></i></span><span><strong>${esc(campaign.name)}</strong><small>${esc(selectedSupplierLabel(campaign))} · ${dateBR(campaign.end)}</small></span><b>${Math.max(0, daysUntil(campaign.end) || 0)}d</b></div>`).join('') : '<p class="hint">Nenhum fechamento próximo.</p>'}</div></section></aside>
      </div>`;
    icons($('#pageRoot'));
  }

  function kpi(label, value, detail, icon) {
    return `<div class="kpi-card"><span class="kpi-icon"><i data-lucide="${icon}"></i></span><div><strong>${esc(value)}</strong><span>${esc(label)}</span><small>${esc(detail)}</small></div></div>`;
  }

  function renderCampaigns() {
    const search = norm(app.campaignSearch);
    const list = search ? app.campaigns.filter((campaign) => norm(`${campaign.name} ${selectedSupplierLabel(campaign)}`).includes(search)) : app.campaigns;
    $('#pageRoot').innerHTML = `<div class="page-head"><div><span class="eyebrow">Gestão</span><h2>Campanhas</h2><p>Crie, edite e acompanhe as campanhas de incentivo.</p></div><button class="primary-btn" data-action="new-campaign"><i data-lucide="plus"></i>Nova campanha</button></div>
      <div class="toolbar"><div class="search-field"><i data-lucide="search"></i><input id="campaignSearch" placeholder="Buscar campanha ou fornecedor" value="${esc(app.campaignSearch)}"></div></div>
      ${list.length ? `<div class="campaign-grid">${list.map(campaignCard).join('')}</div>` : emptyState('Nenhuma campanha encontrada', search ? 'A busca não encontrou resultados.' : 'Crie a primeira campanha para começar.', !search ? '<button class="primary-btn" data-action="new-campaign">Nova campanha</button>' : '')}`;
    icons($('#pageRoot'));
  }

  function renderRepresentatives() {
    const search = norm(app.representativeSearch);
    const list = app.context.representatives.filter((representative) => !search || norm(representative.name).includes(search));
    $('#pageRoot').innerHTML = `<div class="page-head"><div><span class="eyebrow">Base ativa</span><h2>Representantes</h2><p>Somente vendedores com pelo menos um cliente ativo.</p></div><button class="secondary-btn" data-action="refresh-context"><i data-lucide="refresh-cw"></i>Atualizar contexto</button></div>
      <div class="toolbar"><div class="search-field"><i data-lucide="search"></i><input id="representativeSearch" placeholder="Buscar representante" value="${esc(app.representativeSearch)}"></div><span class="hint">${number(list.length)} representante(s)</span></div>
      <div class="table-wrap"><table><thead><tr><th>Representante</th><th>Status</th><th>Clientes ativos</th><th>Carteira total</th><th>Último pedido</th></tr></thead><tbody>${list.map((representative) => `<tr><td><strong>${esc(representative.name)}</strong></td><td><span class="badge active">Ativo</span></td><td>${number(representative.activeClients)}</td><td>${number(representative.portfolioClients)}</td><td>${representative.lastOrderDate ? new Date(representative.lastOrderDate).toLocaleDateString('pt-BR') : '—'}</td></tr>`).join('')}</tbody></table></div>`;
    icons($('#pageRoot'));
  }

  function renderProducts() {
    const search = norm(app.productSearch);
    const list = app.context.products.filter((product) => !search || norm(`${product.id} ${product.name} ${product.supplierName} ${product.group} ${product.subgroup}`).includes(search));
    const visible = list.slice(0, 200);
    $('#pageRoot').innerHTML = `<div class="page-head"><div><span class="eyebrow">Contexto comercial</span><h2>Produtos</h2><p>Consulta instantânea sobre o contexto preparado no início da sessão.</p></div><button class="secondary-btn" data-action="refresh-context"><i data-lucide="refresh-cw"></i>Atualizar contexto</button></div>
      <div class="toolbar"><div class="search-field"><i data-lucide="search"></i><input id="productPageSearch" placeholder="Buscar ID, produto, fornecedor, grupo ou subgrupo" value="${esc(app.productSearch)}"></div><span class="hint">Mostrando ${number(visible.length)} de ${number(list.length)}</span></div>
      <div class="table-wrap"><table><thead><tr><th>ID</th><th>Produto</th><th>Fornecedor</th><th>Grupo</th><th>Subgrupo</th><th>Status</th></tr></thead><tbody>${visible.map((product) => `<tr><td>${number(product.id)}</td><td><strong>${esc(product.name)}</strong></td><td>${esc(product.supplierName)} · ${number(product.supplierId)}</td><td>${esc(product.group || '—')}</td><td>${esc(product.subgroup || '—')}</td><td>${esc(product.status || '—')}</td></tr>`).join('')}</tbody></table></div>`;
    icons($('#pageRoot'));
  }

  function renderView() {
    $$('.nav-item[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === app.view));
    const titles = { dashboard:'Visão geral', campaigns:'Campanhas', products:'Produtos', representatives:'Representantes' };
    $('#pageTitle').textContent = titles[app.view] || 'Campanhas';
    if (app.view === 'dashboard') renderDashboard();
    if (app.view === 'campaigns') renderCampaigns();
    if (app.view === 'products') renderProducts();
    if (app.view === 'representatives') renderRepresentatives();
  }

  function nextMonday() {
    const date = new Date(); date.setHours(12,0,0,0);
    const days = (8 - date.getDay()) % 7 || 7;
    date.setDate(date.getDate() + days);
    return date;
  }
  function inputDate(date) { return date.toISOString().slice(0,10); }

  function defaultGoal(scope = 'individual') {
    return { id:uid('goal'), scope, mode:'absolute', metric:'positivity', operator:'>=', value:scope === 'collective' ? 100 : 4 };
  }

  function defaultCampaign() {
    const start = nextMonday();
    const end = new Date(start); end.setDate(end.getDate() + 28);
    return {
      id:uid('campaign'), name:'', description:'', start:inputDate(start), end:inputDate(end),
      suppliers:[], participantMode:'all', representatives:[], rankingMetrics:['points','positivity'], rankingMode:'TOP_N_ELIGIBLE', topN:5,
      goalMode:'both', collectiveGoals:[defaultGoal('collective')], individualGoals:[defaultGoal('individual')],
      rules:[], pointRules:[], categories:[], tieBreaks:[{ metric:'positivity', direction:'desc' }, { metric:'revenue', direction:'desc' }], prizes:[],
      createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
    };
  }

  function normalizeCampaign(raw = {}) {
    const base = defaultCampaign();
    const legacySuppliers = raw.suppliers || (raw.supplier ? [raw.supplier] : raw.fornecedor ? [{ id:raw.fornecedorId || null, name:raw.fornecedor }] : []);
    const legacyCollective = raw.collectiveGoals || (raw.collectiveMeta ? [{ id:uid('goal'), scope:'collective', mode:['revenueGrowth','kgGrowth'].includes(raw.collectiveMeta.metric) ? 'growth_percent' : 'absolute', metric:String(raw.collectiveMeta.metric || 'positivity').replace('Growth',''), operator:'>=', value:Number(raw.collectiveMeta.value)||0 }] : []);
    const legacyIndividual = raw.individualGoals || (raw.individualMeta ? [{ id:uid('goal'), scope:'individual', mode:['revenueGrowth','kgGrowth'].includes(raw.individualMeta.metric) ? 'growth_percent' : 'absolute', metric:String(raw.individualMeta.metric || 'positivity').replace('Growth',''), operator:'>=', value:Number(raw.individualMeta.value)||0 }] : []);
    return {
      ...base, ...raw,
      name:raw.name || raw.nome || '', description:raw.description || raw.descricao || '',
      start:raw.start || raw.dataInicio || base.start, end:raw.end || raw.dataFim || raw.dataFechamento || base.end,
      suppliers:Array.isArray(legacySuppliers) ? legacySuppliers.map((supplier) => ({ id:Number(supplier.id ?? supplier.code ?? supplier.fornecedorId) || null, name:supplier.name || supplier.nome || supplier.fornecedor || 'Fornecedor', totalProducts:Number(supplier.totalProducts || supplier.totalProdutos)||0 })) : [],
      rankingMetrics:Array.isArray(raw.rankingMetrics) ? raw.rankingMetrics : Array.isArray(raw.metricasRanking) ? raw.metricasRanking : [raw.metricaRanking || 'points'],
      collectiveGoals:Array.isArray(legacyCollective) ? legacyCollective : [], individualGoals:Array.isArray(legacyIndividual) ? legacyIndividual : [],
      rules:Array.isArray(raw.rules) ? raw.rules : [], pointRules:Array.isArray(raw.pointRules) ? raw.pointRules : [], categories:Array.isArray(raw.categories) ? raw.categories : [],
      tieBreaks:Array.isArray(raw.tieBreaks) ? raw.tieBreaks : base.tieBreaks, prizes:Array.isArray(raw.prizes) ? raw.prizes : [],
    };
  }

  function calculatePeriods(startRaw, endRaw) {
    const start = startRaw ? new Date(`${startRaw}T12:00:00`) : null;
    const end = endRaw ? new Date(`${endRaw}T12:00:00`) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return { valid:false, error:'Informe um período válido.' };
    const days = Math.round((end - start) / 86400000);
    if (start.getDay() !== 1 || end.getDay() !== 1) return { valid:false, error:'Início e fechamento precisam ser segundas-feiras.' };
    if (days % 7 !== 0) return { valid:false, error:'O período precisa ter semanas completas.' };
    const previousStart = new Date(start); previousStart.setDate(previousStart.getDate() - days);
    const lastCurrent = new Date(end); lastCurrent.setDate(lastCurrent.getDate() - 1);
    const lastPrevious = new Date(start); lastPrevious.setDate(lastPrevious.getDate() - 1);
    return {
      valid:true, weeks:days/7, days,
      currentStart:inputDate(start), currentEnd:inputDate(end), currentLast:inputDate(lastCurrent),
      previousStart:inputDate(previousStart), previousEnd:inputDate(start), previousLast:inputDate(lastPrevious),
    };
  }

  async function openWizard(id = null) {
    const modal = $('#modalBackdrop');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    app.wizard = {
      open:true, step:0, campaign:defaultCampaign(), supplierQuery:'', selectedCategoryId:null, selectedProducts:new Set(),
      productFilters:{ search:'', group:'', subgroup:'', status:'ATIVO' }, productVisibleLimit:100,
    };
    if (id) {
      const found = await DB.get('campanhas', id);
      if (found) app.wizard.campaign = normalizeCampaign(found);
      $('#modalTitle').textContent = 'Editar campanha';
    } else $('#modalTitle').textContent = 'Nova campanha';
    renderWizard();
    requestAnimationFrame(() => $('#campaignModal').focus?.());
  }

  function closeWizard() {
    $('#modalBackdrop').hidden = true;
    document.body.style.overflow = '';
    app.wizard = null;
  }

  function renderWizard() {
    if (!app.wizard) return;
    $('#wizardNav').innerHTML = STEPS.map((step, index) => `<button type="button" data-action="wizard-step" data-step="${index}" class="${app.wizard.step === index ? 'is-active' : ''} ${index < app.wizard.step ? 'is-done' : ''}"><span class="step-number">${index + 1}</span><span><strong>${step.title}</strong><small>${step.subtitle}</small></span></button>`).join('');
    $('#wizardProgress').style.width = `${((app.wizard.step + 1) / STEPS.length) * 100}%`;
    $('[data-action="previous-step"]').style.visibility = app.wizard.step === 0 ? 'hidden' : 'visible';
    $('[data-action="next-step"]').style.display = app.wizard.step === STEPS.length - 1 ? 'none' : 'inline-flex';
    $('[data-action="save-campaign"]').style.display = app.wizard.step === STEPS.length - 1 ? 'inline-flex' : 'none';
    const renderers = [renderGeneralStep, renderRulesStep, renderProductsStep, renderFinalStep];
    $('#wizardStep').innerHTML = renderers[app.wizard.step]();
    const suppliers = app.wizard.campaign.suppliers || [];
    $('#modalFootStatus').textContent = suppliers.length ? `${suppliers.length} código(s) de fornecedor selecionado(s)` : 'Selecione ao menos um código de fornecedor.';
    icons($('#campaignModal'));
    if (app.wizard.step === 2) void loadVisibleImages();
  }

  function periodPreview(periods) {
    if (!periods.valid) return `<div class="hint" style="grid-column:1/-1;color:var(--danger)">${esc(periods.error)}</div>`;
    return `<div class="period-box"><span>Campanha · ${periods.weeks} semana(s)</span><strong>${dateBR(periods.currentStart)} a ${dateBR(periods.currentLast)}</strong></div><div class="period-arrow"><i data-lucide="arrow-left-right"></i></div><div class="period-box"><span>Período anterior equivalente</span><strong>${dateBR(periods.previousStart)} a ${dateBR(periods.previousLast)}</strong></div>`;
  }

  function renderGeneralStep() {
    const campaign = app.wizard.campaign;
    const periods = calculatePeriods(campaign.start, campaign.end);
    return `<div class="step-head"><div><h3>Informações gerais</h3><p>Defina o período, selecione um ou mais códigos de fornecedor e determine os participantes.</p></div></div>
      <div class="form-grid">
        <div class="field"><label>Nome da campanha *</label><input id="campaignName" value="${esc(campaign.name)}" placeholder="Ex.: Campanha Camil Q3"></div>
        <div class="field"><label>Status calculado</label><input value="${campaignStatus(campaign).label}" disabled></div>
        <div class="field full"><label>Descrição ou regulamento</label><textarea id="campaignDescription" placeholder="Objetivo, observações e regras gerais…">${esc(campaign.description)}</textarea></div>
        <div class="field full"><label>Códigos de fornecedor participantes *</label>${supplierSelector()}</div>
        <div class="field"><label>Início da campanha · segunda-feira *</label><input id="campaignStart" type="date" value="${esc(campaign.start)}"></div>
        <div class="field"><label>Fechamento · segunda-feira exclusiva *</label><input id="campaignEnd" type="date" value="${esc(campaign.end)}"></div>
        <div class="period-preview" id="periodPreview">${periodPreview(periods)}</div>
        <div class="field full"><label>Participantes</label><div class="choice-grid">
          ${choiceCard('participant-mode','all','users-round','Todos os representantes ativos','Usa automaticamente todos os vendedores ativos do contexto.',campaign.participantMode === 'all')}
          ${choiceCard('participant-mode','specific','user-round-check','Representantes específicos','Escolha manualmente quem participa.',campaign.participantMode === 'specific')}
        </div></div>
        ${campaign.participantMode === 'specific' ? representativeSelector() : ''}
      </div>`;
  }

  function supplierSelector() {
    const selected = app.wizard.campaign.suppliers || [];
    const selectedIds = new Set(selected.map((supplier) => String(supplier.id)));
    const query = norm(app.wizard.supplierQuery);
    const matches = app.context.suppliers.filter((supplier) => !query || norm(`${supplier.name} ${supplier.id}`).includes(query)).slice(0, 40);
    return `<div class="supplier-selection">
      <div class="supplier-selected">${selected.length ? selected.map((supplier) => `<span class="supplier-chip">${esc(supplier.name)} · cód. ${esc(supplier.id)}<button type="button" data-action="remove-supplier" data-id="${esc(supplier.id)}"><i data-lucide="x"></i></button></span>`).join('') : '<span class="hint">Nenhum código selecionado.</span>'}</div>
      <div class="supplier-search-row"><div class="search-field"><i data-lucide="search"></i><input id="supplierSearch" autocomplete="off" placeholder="Buscar nome ou código" value="${esc(app.wizard.supplierQuery)}"></div><span class="hint">${number(app.context.suppliers.length)} códigos no contexto</span></div>
      <div class="supplier-results">${matches.map((supplier) => `<button class="supplier-option ${selectedIds.has(String(supplier.id)) ? 'is-selected' : ''}" type="button" data-action="toggle-supplier" data-id="${esc(supplier.id)}"><span class="supplier-code">${esc(supplier.id)}</span><span><strong>${esc(supplier.name)}</strong><small>${number(supplier.activeProducts)} ativos · ${number(supplier.totalProducts)} produtos · ${number(supplier.groups.length)} grupos</small></span><span class="check"><i data-lucide="${selectedIds.has(String(supplier.id)) ? 'circle-check' : 'circle-plus'}"></i></span></button>`).join('') || '<div class="hint" style="padding:12px">Nenhum código encontrado.</div>'}</div>
    </div>`;
  }

  function choiceCard(action, value, icon, title, description, selected, order = null) {
    return `<button type="button" class="choice-card ${selected ? 'is-selected' : ''}" data-action="${action}" data-value="${value}"><span class="choice-icon"><i data-lucide="${icon}"></i></span><span><strong>${title}</strong><p>${description}</p></span>${order ? `<span class="choice-order">${order}</span>` : ''}</button>`;
  }

  function representativeSelector() {
    const selected = new Set(app.wizard.campaign.representatives || []);
    return `<div class="field full"><label>Representantes selecionados (${selected.size})</label><div class="search-field"><i data-lucide="search"></i><input id="wizardRepSearch" placeholder="Buscar representante"></div><div class="table-wrap" id="wizardRepList" style="max-height:280px;margin-top:8px"><table><tbody>${app.context.representatives.map((representative) => `<tr data-rep-row="${esc(norm(representative.name))}"><td><input type="checkbox" data-representative="${esc(representative.name)}" ${selected.has(representative.name) ? 'checked' : ''}></td><td><strong>${esc(representative.name)}</strong></td><td>${number(representative.activeClients)} clientes ativos</td></tr>`).join('')}</tbody></table></div></div>`;
  }

  function renderRulesStep() {
    const campaign = app.wizard.campaign;
    return `<div class="step-head"><div><h3>Ranking, metas e elegibilidade</h3><p>Selecione várias métricas de ranking por prioridade. Metas coletivas e individuais aceitam valores absolutos ou crescimento percentual.</p></div></div>
      <div class="subsection"><div class="subsection-head"><div><h4>Como o ranking principal será definido?</h4><p>Clique nas métricas na ordem de prioridade. A segunda e as próximas também funcionam como desempate inicial.</p></div></div>
        <div class="choice-grid">${RANKING_METRICS.map((metric) => { const index = campaign.rankingMetrics.indexOf(metric.id); return choiceCard('toggle-ranking',metric.id,metric.icon,metric.label,metric.description,index >= 0,index >= 0 ? index + 1 : null); }).join('')}</div>
        <div class="form-grid" style="margin-top:12px"><div class="field"><label>Modelo de classificação</label><select id="rankingMode"><option value="TOP_N_ELIGIBLE" ${campaign.rankingMode === 'TOP_N_ELIGIBLE' ? 'selected' : ''}>Top N entre os elegíveis</option><option value="TOP_N" ${campaign.rankingMode === 'TOP_N' ? 'selected' : ''}>Top N geral</option><option value="ALL_ELIGIBLE" ${campaign.rankingMode === 'ALL_ELIGIBLE' ? 'selected' : ''}>Todos que atingirem</option></select></div><div class="field"><label>Quantidade de classificados</label><input id="topN" type="number" min="1" value="${number(campaign.topN)}"></div></div>
      </div>

      <div class="subsection"><div class="subsection-head"><div><h4>Quais metas a campanha utiliza?</h4><p>É possível usar meta coletiva, individual, ambas ou nenhuma.</p></div></div><div class="choice-grid">
        ${choiceCard('goal-mode','none','circle-slash-2','Sem meta','O ranking é definido apenas pelas métricas e regras.',campaign.goalMode === 'none')}
        ${choiceCard('goal-mode','collective','users-round','Meta coletiva','Avalia o resultado agregado de todos os representantes.',campaign.goalMode === 'collective')}
        ${choiceCard('goal-mode','individual','user-round-check','Meta individual','Avalia cada representante separadamente.',campaign.goalMode === 'individual')}
        ${choiceCard('goal-mode','both','git-merge','Coletiva + individual','As duas condições são avaliadas.',campaign.goalMode === 'both')}
      </div></div>

      ${['collective','both'].includes(campaign.goalMode) ? goalBlock('collective', 'Metas coletivas', 'O total do grupo precisa atingir todas as condições configuradas.', campaign.collectiveGoals) : ''}
      ${['individual','both'].includes(campaign.goalMode) ? goalBlock('individual', 'Metas individuais', 'Cada vendedor precisa atingir todas as condições para ficar elegível.', campaign.individualGoals) : ''}

      <div class="subsection"><div class="subsection-head"><div><h4>Pontos por desempenho</h4><p>Crie pontos por positivação, faturamento, volume, peças, pedidos, mix ou produtos distintos.</p></div><button class="secondary-btn" type="button" data-action="add-point-rule"><i data-lucide="plus"></i>Adicionar regra</button></div>
        ${campaign.pointRules.length ? `<div class="point-rule-list">${campaign.pointRules.map(pointRuleRow).join('')}</div>` : '<div class="hint">Nenhuma regra adicional de pontos. As categorias de produtos ainda podem gerar pontos separadamente.</div>'}
      </div>

      <div class="subsection"><div class="subsection-head"><div><h4>Critérios de elegibilidade adicionais</h4><p>Essas regras eliminam ou habilitam representantes independentemente da ordem do ranking.</p></div><div class="template-bar">${[['positivity','Positivação mínima',4],['revenue','Faturamento mínimo',10000],['kg','Volume mínimo',100],['mix','Mix mínimo',100],['points','Pontos mínimos',400],['orders','Pedidos mínimos',5]].map(([metric,label,value]) => `<button type="button" data-action="add-rule-template" data-metric="${metric}" data-label="${label}" data-value="${value}">+ ${label}</button>`).join('')}</div></div>
        ${campaign.rules.length ? `<div class="rule-list">${campaign.rules.map(ruleRow).join('')}</div>` : '<div class="hint">Nenhum critério adicional configurado.</div>'}
      </div>`;
  }

  function goalBlock(scope, title, description, goals) {
    return `<div class="meta-block"><div class="meta-block-head"><div><h5>${title}</h5><span class="hint">${description}</span></div><button class="secondary-btn" type="button" data-action="add-goal" data-scope="${scope}"><i data-lucide="plus"></i>Adicionar condição</button></div>
      <div class="goal-list">${goals.map(goalRow).join('')}</div></div>`;
  }

  function goalRow(goal) {
    const metrics = goal.mode === 'growth_percent' ? GROWTH_METRICS : BASE_METRICS;
    return `<div class="goal-row" data-goal-id="${esc(goal.id)}" data-scope="${esc(goal.scope)}">
      <label>Forma de avaliação<select data-goal-field="mode"><option value="absolute" ${goal.mode === 'absolute' ? 'selected' : ''}>Valor absoluto</option><option value="growth_percent" ${goal.mode === 'growth_percent' ? 'selected' : ''}>Crescimento percentual</option></select></label>
      <label>Métrica<select data-goal-field="metric">${metrics.map(([id,label]) => `<option value="${id}" ${goal.metric === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>Condição<select data-goal-field="operator"><option value=">=" ${goal.operator === '>=' ? 'selected' : ''}>Maior ou igual</option><option value=">" ${goal.operator === '>' ? 'selected' : ''}>Maior que</option><option value="<=" ${goal.operator === '<=' ? 'selected' : ''}>Menor ou igual</option></select></label>
      <label>Valor<input data-goal-field="value" type="number" step="0.01" value="${Number(goal.value) || 0}"></label>
      <button class="row-remove" type="button" data-action="remove-goal" data-scope="${esc(goal.scope)}" data-id="${esc(goal.id)}"><i data-lucide="trash-2"></i></button>
    </div>`;
  }

  function pointRuleRow(rule) {
    return `<div class="point-rule-row" data-point-rule-id="${esc(rule.id)}">
      <label>Origem<select data-point-field="source">${POINT_SOURCES.map(([id,label]) => `<option value="${id}" ${rule.source === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>Forma<select data-point-field="mode"><option value="per_unit" ${rule.mode === 'per_unit' ? 'selected' : ''}>Pontos a cada quantidade</option><option value="fixed_if_target" ${rule.mode === 'fixed_if_target' ? 'selected' : ''}>Pontos fixos ao atingir</option></select></label>
      <label>${rule.mode === 'fixed_if_target' ? 'Meta' : 'A cada'}<input data-point-field="basis" type="number" step="0.01" min="0.01" value="${Number(rule.basis) || 1}"></label>
      <label>Pontos<input data-point-field="points" type="number" step="0.01" value="${Number(rule.points) || 100}"></label>
      <button class="row-remove" type="button" data-action="remove-point-rule" data-id="${esc(rule.id)}"><i data-lucide="trash-2"></i></button>
    </div>`;
  }

  function ruleRow(rule) {
    return `<div class="rule-row" data-rule-id="${esc(rule.id)}">
      <label>Nome<input data-rule-field="name" value="${esc(rule.name)}"></label>
      <label>Métrica<select data-rule-field="metric">${BASE_METRICS.map(([id,label]) => `<option value="${id}" ${rule.metric === id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
      <label>Condição<select data-rule-field="operator"><option value=">=" ${rule.operator === '>=' ? 'selected' : ''}>&gt;=</option><option value=">" ${rule.operator === '>' ? 'selected' : ''}>&gt;</option><option value="<=" ${rule.operator === '<=' ? 'selected' : ''}>&lt;=</option></select></label>
      <label>Valor<input data-rule-field="value" type="number" step="0.01" value="${Number(rule.value) || 0}"></label>
      <button class="row-remove" type="button" data-action="remove-rule" data-id="${esc(rule.id)}"><i data-lucide="trash-2"></i></button>
    </div>`;
  }

  function selectedSupplierIds() {
    return new Set((app.wizard?.campaign.suppliers || []).map((supplier) => Number(supplier.id)).filter(Number.isFinite));
  }

  function productsForCampaign() {
    const supplierIds = selectedSupplierIds();
    if (!supplierIds.size) return [];
    return app.context.products.filter((product) => supplierIds.has(Number(product.supplierId)));
  }

  function filteredCampaignProducts() {
    const filters = app.wizard.productFilters;
    const search = norm(filters.search);
    const group = norm(filters.group);
    const subgroup = norm(filters.subgroup);
    const status = norm(filters.status);
    return productsForCampaign().filter((product) => {
      if (group && norm(product.group) !== group) return false;
      if (subgroup && norm(product.subgroup) !== subgroup) return false;
      if (status && !norm(product.status).includes(status)) return false;
      if (search && !norm(`${product.id} ${product.name} ${product.supplierName} ${product.manufacturer} ${product.group} ${product.subgroup}`).includes(search)) return false;
      return true;
    });
  }

  function productFilterOptions(products) {
    const groups = [...new Set(products.map((product) => product.group).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR'));
    const subgroups = [...new Set(products.filter((product) => !app.wizard.productFilters.group || norm(product.group) === norm(app.wizard.productFilters.group)).map((product) => product.subgroup).filter(Boolean))].sort((a,b) => a.localeCompare(b,'pt-BR'));
    return { groups, subgroups };
  }

  function renderProductsStep() {
    const campaign = app.wizard.campaign;
    if (!campaign.suppliers.length) return `<div class="step-head"><div><h3>Produtos e categorias</h3><p>Selecione pelo menos um código de fornecedor na primeira etapa.</p></div></div><div class="empty-state"><h3>Fornecedor não definido</h3><p>Volte para Informações gerais e escolha os códigos participantes.</p></div>`;
    const baseProducts = productsForCampaign();
    const filtered = filteredCampaignProducts();
    const visible = filtered.slice(0, app.wizard.productVisibleLimit);
    const options = productFilterOptions(baseProducts);
    const selectedCount = app.wizard.selectedProducts.size;
    return `<div class="step-head"><div><h3>Produtos, categorias e mix</h3><p>O catálogo já está no navegador. Filtrar, pesquisar e adicionar produtos não dispara novas consultas ao SQL.</p></div><span class="badge active">${number(baseProducts.length)} produtos disponíveis</span></div>
      <div class="product-layout">
        <section class="catalog-panel">
          <div class="panel-head"><h4>Catálogo dos códigos selecionados</h4><p>${esc(campaign.suppliers.map((supplier) => `${supplier.name} (${supplier.id})`).join(' · '))}</p></div>
          <div class="product-filters">
            <input id="productSearch" placeholder="Buscar ID, produto, fabricante ou grupo" value="${esc(app.wizard.productFilters.search)}">
            <select id="productGroup"><option value="">Todos os grupos</option>${options.groups.map((value) => `<option value="${esc(value)}" ${app.wizard.productFilters.group === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select>
            <select id="productSubgroup"><option value="">Todos os subgrupos</option>${options.subgroups.map((value) => `<option value="${esc(value)}" ${app.wizard.productFilters.subgroup === value ? 'selected' : ''}>${esc(value)}</option>`).join('')}</select>
          </div>
          <div class="catalog-actions"><span>Mostrando ${number(visible.length)} de ${number(filtered.length)} · ${selectedCount} selecionado(s)</span><span style="display:flex;gap:6px;align-items:center"><select id="targetCategorySelect" style="min-height:38px;border:1px solid var(--line);border-radius:9px;background:var(--surface);padding:6px;font-size:9.5px"><option value="">Categoria de destino</option>${campaign.categories.map((category) => `<option value="${esc(category.id)}" ${app.wizard.selectedCategoryId === category.id ? 'selected' : ''}>${esc(category.name)}</option>`).join('')}</select><button class="secondary-btn" type="button" data-action="add-selected-products">Adicionar selecionados</button><button class="secondary-btn" type="button" data-action="add-all-filtered">Adicionar todos filtrados</button></span></div>
          <div class="product-grid">${visible.map(productCard).join('') || '<div class="hint">Nenhum produto encontrado.</div>'}</div>
        </section>
        <section class="categories-panel">
          <div class="panel-head"><h4>Categorias da campanha</h4><p>Crie grupos como Pescados, Azeites, Cafés e Massas. O mix verifica o mínimo definido em cada categoria.</p></div>
          <div class="category-toolbar"><input id="newCategoryName" placeholder="Nome da nova categoria"><button class="primary-btn" type="button" data-action="add-category"><i data-lucide="plus"></i>Nova categoria</button></div>
          ${campaign.categories.length ? `<div class="category-list">${campaign.categories.map(categoryCard).join('')}</div>` : '<div class="empty-state" style="margin:10px"><h3>Nenhuma categoria</h3><p>Crie uma categoria e arraste produtos para ela.</p></div>'}
        </section>
      </div>`;
  }

  function productCard(product) {
    const selected = app.wizard.selectedProducts.has(Number(product.id));
    const visual = app.imageCache.get(String(product.id));
    return `<label class="product-card ${selected ? 'is-selected' : ''}" draggable="true" data-product-id="${product.id}"><input class="product-check" type="checkbox" data-product-select="${product.id}" ${selected ? 'checked' : ''}><span class="product-image">${visual?.image ? `<img loading="lazy" src="${esc(imageUrl(visual.image))}" alt="">` : '<i data-lucide="package"></i>'}</span><span class="product-info"><strong>${esc(product.name)}</strong><small>${product.id} · ${esc(product.supplierName)} · ${esc(product.group || 'Sem grupo')}</small></span></label>`;
  }

  function categoryCard(category) {
    return `<article class="category-card" data-category-id="${esc(category.id)}"><div class="category-head"><i data-lucide="grip-vertical"></i><input type="text" data-category-field="name" value="${esc(category.name)}"><span class="badge active">${number((category.products || []).length)} produto(s)</span><button class="icon-btn" type="button" data-action="remove-category" data-id="${esc(category.id)}"><i data-lucide="trash-2"></i></button></div>
      <div class="category-options">
        <label>Participa do mix<select data-category-field="requiredMix"><option value="true" ${category.requiredMix !== false ? 'selected' : ''}>Obrigatória</option><option value="false" ${category.requiredMix === false ? 'selected' : ''}>Não obrigatória</option></select></label>
        <label>Mín. produtos distintos<input data-category-field="minDistinct" type="number" min="1" value="${Number(category.minDistinct) || 1}"></label>
        <label>Pontuação por<select data-category-field="pointUnit"><option value="none" ${category.pointUnit === 'none' ? 'selected' : ''}>Sem pontos</option><option value="pieces" ${category.pointUnit === 'pieces' ? 'selected' : ''}>Peça</option><option value="kg" ${category.pointUnit === 'kg' ? 'selected' : ''}>KG</option><option value="revenue" ${category.pointUnit === 'revenue' ? 'selected' : ''}>R$ vendido</option><option value="item" ${category.pointUnit === 'item' ? 'selected' : ''}>Produto distinto</option></select></label>
        <label>Pontos<input data-category-field="pointValue" type="number" step="0.01" value="${Number(category.pointValue) || 0}"></label>
      </div>
      <div class="category-products" data-category-drop="${esc(category.id)}">${(category.products || []).length ? category.products.map((product) => productChip(product, category.id)).join('') : '<span class="drop-hint">Arraste produtos para esta categoria</span>'}</div></article>`;
  }

  function productChip(product, categoryId) {
    const visual = app.imageCache.get(String(product.id));
    return `<span class="product-chip">${visual?.image || product.image ? `<img loading="lazy" src="${esc(imageUrl(visual?.image || product.image))}" alt="">` : ''}<span>${esc(product.name)}</span><button type="button" data-action="remove-product-category" data-category-id="${esc(categoryId)}" data-product-id="${product.id}"><i data-lucide="x"></i></button></span>`;
  }

  function imageUrl(url) {
    if (!url) return '';
    if (/^https?:\/\//i.test(url)) return `/img-proxy?url=${encodeURIComponent(url)}`;
    return url.startsWith('/') ? url : `/${url}`;
  }

  async function loadVisibleImages() {
    if (!app.wizard || app.wizard.step !== 2) return;
    const ids = new Set(filteredCampaignProducts().slice(0, app.wizard.productVisibleLimit).map((product) => String(product.id)));
    for (const category of app.wizard.campaign.categories) for (const product of category.products || []) ids.add(String(product.id));
    const missing = [...ids].filter((id) => !app.imageCache.has(id) && !app.imageAttempted.has(id));
    if (!missing.length) return;
    let changed = false;
    for (let index = 0; index < missing.length; index += 60) {
      const batch = missing.slice(index, index + 60);
      batch.forEach((id) => app.imageAttempted.add(id));
      const key = batch.join(',');
      if (app.imageInFlight.has(key)) continue;
      const promise = fetch(`${VISUAL_ENDPOINT}?ids=${encodeURIComponent(key)}&limite=60`).then((response) => response.ok ? response.json() : []).then((items) => {
        for (const item of Array.isArray(items) ? items : []) { app.imageCache.set(String(item.id), item); changed = true; }
      }).catch(() => {}).finally(() => app.imageInFlight.delete(key));
      app.imageInFlight.set(key, promise);
      await promise;
    }
    if (changed && app.wizard?.step === 2) renderWizard();
  }

  function renderFinalStep() {
    const campaign = app.wizard.campaign;
    return `<div class="step-head"><div><h3>Desempate e premiação</h3><p>Defina a ordem final dos critérios e registre a premiação de cada posição.</p></div></div>
      <div class="subsection"><div class="subsection-head"><div><h4>Ordem de desempate</h4><p>Os critérios são aplicados de cima para baixo depois das métricas principais.</p></div><button class="secondary-btn" type="button" data-action="add-tie"><i data-lucide="plus"></i>Adicionar critério</button></div>
        <div class="tie-list">${campaign.tieBreaks.map((item, index) => `<div class="tie-row"><span class="tie-order">${index + 1}</span><select data-tie-field="metric" data-index="${index}">${TIE_OPTIONS.map(([id,label]) => `<option value="${id}" ${item.metric === id ? 'selected' : ''}>${label}</option>`).join('')}</select><select data-tie-field="direction" data-index="${index}"><option value="desc" ${item.direction === 'desc' ? 'selected' : ''}>Maior primeiro</option><option value="asc" ${item.direction === 'asc' ? 'selected' : ''}>Menor primeiro</option></select><button class="icon-btn" type="button" data-action="move-tie-up" data-index="${index}" ${index === 0 ? 'disabled' : ''}><i data-lucide="arrow-up"></i></button><button class="icon-btn" type="button" data-action="remove-tie" data-index="${index}"><i data-lucide="trash-2"></i></button></div>`).join('') || '<div class="hint">Nenhum critério adicional.</div>'}</div>
      </div>
      <div class="subsection"><div class="subsection-head"><div><h4>Premiação</h4><p>Registre valores, produtos, vouchers ou descrições livres.</p></div><button class="secondary-btn" type="button" data-action="add-prize"><i data-lucide="plus"></i>Adicionar prêmio</button></div>
        <div class="prize-list">${campaign.prizes.map((prize, index) => `<div class="prize-row"><input data-prize-field="position" data-index="${index}" type="number" min="1" value="${Number(prize.position) || index + 1}"><select data-prize-field="type" data-index="${index}"><option value="money" ${prize.type === 'money' ? 'selected' : ''}>Dinheiro</option><option value="voucher" ${prize.type === 'voucher' ? 'selected' : ''}>Vale/Voucher</option><option value="product" ${prize.type === 'product' ? 'selected' : ''}>Produto</option><option value="other" ${prize.type === 'other' ? 'selected' : ''}>Descrição livre</option></select><input data-prize-field="description" data-index="${index}" value="${esc(prize.description || '')}" placeholder="Ex.: R$ 1.000 ou Smart TV"><button class="icon-btn" type="button" data-action="remove-prize" data-index="${index}"><i data-lucide="trash-2"></i></button></div>`).join('') || '<div class="hint">Nenhuma premiação registrada.</div>'}</div>
      </div>
      <div class="meta-block"><div class="meta-block-head"><div><h5>Resumo da campanha</h5><span class="hint">Revise antes de salvar.</span></div></div><div class="campaign-meta" style="margin-top:10px"><div><span>Fornecedores</span><strong>${number(campaign.suppliers.length)}</strong></div><div><span>Categorias</span><strong>${number(campaign.categories.length)}</strong></div><div><span>Métricas de ranking</span><strong>${number(campaign.rankingMetrics.length)}</strong></div></div></div>`;
  }

  function syncCurrentStep() {
    if (!app.wizard) return;
    const campaign = app.wizard.campaign;
    if (app.wizard.step === 0) {
      campaign.name = $('#campaignName')?.value.trim() || campaign.name;
      campaign.description = $('#campaignDescription')?.value.trim() || '';
      campaign.start = $('#campaignStart')?.value || campaign.start;
      campaign.end = $('#campaignEnd')?.value || campaign.end;
      campaign.representatives = $$('[data-representative]:checked').map((input) => input.dataset.representative);
    }
    if (app.wizard.step === 1) {
      campaign.rankingMode = $('#rankingMode')?.value || campaign.rankingMode;
      campaign.topN = Math.max(1, Number($('#topN')?.value) || 1);
      syncGoals(); syncPointRules(); syncEligibilityRules();
    }
    if (app.wizard.step === 2) syncCategories();
    if (app.wizard.step === 3) syncFinalStep();
  }

  function syncGoals() {
    for (const row of $$('.goal-row')) {
      const list = row.dataset.scope === 'collective' ? app.wizard.campaign.collectiveGoals : app.wizard.campaign.individualGoals;
      const goal = list.find((item) => item.id === row.dataset.goalId);
      if (!goal) continue;
      for (const field of $$('[data-goal-field]', row)) goal[field.dataset.goalField] = field.dataset.goalField === 'value' ? Number(field.value) || 0 : field.value;
    }
  }
  function syncPointRules() {
    for (const row of $$('.point-rule-row')) {
      const rule = app.wizard.campaign.pointRules.find((item) => item.id === row.dataset.pointRuleId);
      if (!rule) continue;
      for (const field of $$('[data-point-field]', row)) rule[field.dataset.pointField] = ['basis','points'].includes(field.dataset.pointField) ? Number(field.value) || 0 : field.value;
    }
  }
  function syncEligibilityRules() {
    for (const row of $$('.rule-row')) {
      const rule = app.wizard.campaign.rules.find((item) => item.id === row.dataset.ruleId);
      if (!rule) continue;
      for (const field of $$('[data-rule-field]', row)) rule[field.dataset.ruleField] = field.dataset.ruleField === 'value' ? Number(field.value) || 0 : field.value;
    }
  }
  function syncCategories() {
    for (const card of $$('.category-card')) {
      const category = app.wizard.campaign.categories.find((item) => item.id === card.dataset.categoryId);
      if (!category) continue;
      for (const field of $$('[data-category-field]', card)) {
        const name = field.dataset.categoryField;
        if (name === 'requiredMix') category[name] = field.value === 'true';
        else if (['minDistinct','pointValue'].includes(name)) category[name] = Number(field.value) || 0;
        else category[name] = field.value;
      }
    }
  }
  function syncFinalStep() {
    for (const field of $$('[data-tie-field]')) {
      const item = app.wizard.campaign.tieBreaks[Number(field.dataset.index)];
      if (item) item[field.dataset.tieField] = field.value;
    }
    for (const field of $$('[data-prize-field]')) {
      const item = app.wizard.campaign.prizes[Number(field.dataset.index)];
      if (item) item[field.dataset.prizeField] = field.dataset.prizeField === 'position' ? Number(field.value) || 1 : field.value;
    }
  }

  function validateStep(step = app.wizard.step) {
    syncCurrentStep();
    const campaign = app.wizard.campaign;
    if (step === 0) {
      if (!campaign.name) return 'Informe o nome da campanha.';
      if (!campaign.suppliers.length) return 'Selecione pelo menos um código de fornecedor.';
      const periods = calculatePeriods(campaign.start, campaign.end);
      if (!periods.valid) return periods.error;
      if (campaign.participantMode === 'specific' && !campaign.representatives.length) return 'Selecione os representantes participantes.';
    }
    if (step === 1 && !campaign.rankingMetrics.length) return 'Selecione pelo menos uma métrica de ranking.';
    return '';
  }

  async function saveCampaign() {
    for (let step = 0; step < STEPS.length; step += 1) {
      const error = validateStep(step);
      if (error) { app.wizard.step = step; renderWizard(); return toast(error, 'error'); }
    }
    syncCurrentStep();
    const campaign = app.wizard.campaign;
    campaign.updatedAt = new Date().toISOString();
    await DB.put('campanhas', campaign);
    await loadCampaigns();
    closeWizard();
    renderView();
    toast('Campanha salva com sucesso.');
  }

  function compareOp(value, operator, target) {
    if (operator === '>=') return value >= target;
    if (operator === '>') return value > target;
    if (operator === '<=') return value <= target;
    if (operator === '<') return value < target;
    return value === target;
  }

  function growth(current, previous) {
    if (!previous) return current > 0 ? 100 : 0;
    return ((current - previous) / Math.abs(previous)) * 100;
  }

  function periodBucket() {
    return { revenue:0, kg:0, pieces:0, orders:0, customers:new Set(), products:new Set(), rows:[] };
  }

  function categoryStats(categories, rows) {
    const soldIds = new Set(rows.map((row) => Number(row.productId)));
    let fulfilled = 0;
    const required = (categories || []).filter((category) => category.requiredMix !== false);
    const missing = [];
    for (const category of required) {
      const count = (category.products || []).filter((product) => soldIds.has(Number(product.id))).length;
      if (count >= (Number(category.minDistinct) || 1)) fulfilled += 1;
      else missing.push(category.name);
    }
    return {
      fulfilled,
      total: required.length,
      percent: required.length ? (fulfilled / required.length) * 100 : 100,
      missing,
    };
  }

  function categoryPoints(categories, rows) {
    let total = 0;
    for (const category of categories || []) {
      const ids = new Set((category.products || []).map((product) => Number(product.id)));
      const relevant = rows.filter((row) => ids.has(Number(row.productId)));
      const value = Number(category.pointValue) || 0;
      if (!value || category.pointUnit === 'none') continue;
      if (category.pointUnit === 'pieces') total += relevant.reduce((sum, row) => sum + Number(row.pieces || 0), 0) * value;
      if (category.pointUnit === 'kg') total += relevant.reduce((sum, row) => sum + Number(row.kg || 0), 0) * value;
      if (category.pointUnit === 'revenue') total += relevant.reduce((sum, row) => sum + Number(row.revenue || 0), 0) * value;
      if (category.pointUnit === 'item') total += new Set(relevant.map((row) => Number(row.productId))).size * value;
    }
    return total;
  }

  function metricFromBucket(bucket, metric, mixStats = null, positivity = 0, points = 0) {
    const values = {
      revenue:bucket.revenue,
      kg:bucket.kg,
      pieces:bucket.pieces,
      customers:bucket.customers.size,
      orders:bucket.orders,
      distinctProducts:bucket.products.size,
      positivity,
      mix:mixStats?.percent || 0,
      mixCategories:mixStats?.fulfilled || 0,
      points,
    };
    return Number(values[metric] || 0);
  }

  function performanceRulePoints(pointRules, metrics) {
    let total = 0;
    for (const rule of pointRules || []) {
      const value = Number(metrics[rule.source] || 0);
      const basis = Math.max(0.000001, Number(rule.basis) || 1);
      const points = Number(rule.points) || 0;
      if (rule.mode === 'fixed_if_target') {
        if (value >= basis) total += points;
      } else {
        total += Math.floor(Math.max(0, value) / basis) * points;
      }
    }
    return total;
  }

  function goalValue(goal, currentMetrics, previousMetrics) {
    if (goal.mode === 'growth_percent') return growth(Number(currentMetrics[goal.metric] || 0), Number(previousMetrics[goal.metric] || 0));
    return Number(currentMetrics[goal.metric] || 0);
  }

  function goalDescription(goal, value) {
    const label = goal.mode === 'growth_percent'
      ? `Crescimento de ${GROWTH_METRICS.find(([id]) => id === goal.metric)?.[1] || goal.metric}`
      : BASE_METRICS.find(([id]) => id === goal.metric)?.[1] || goal.metric;
    const suffix = goal.mode === 'growth_percent' || goal.metric === 'mix' ? '%' : '';
    return `${label}: ${number(value, 1)}${suffix} ${goal.operator} ${number(goal.value, 1)}${suffix}`;
  }

  function sellerMetrics(campaign, seller) {
    const currentMix = categoryStats(campaign.categories, seller.current.rows);
    const previousMix = categoryStats(campaign.categories, seller.previous.rows);
    const positivity = seller.current.customers.size - seller.previous.customers.size;
    const previousPositivity = 0;

    const currentBasePoints = categoryPoints(campaign.categories, seller.current.rows);
    const previousBasePoints = categoryPoints(campaign.categories, seller.previous.rows);
    const currentRaw = {
      revenue:seller.current.revenue, kg:seller.current.kg, pieces:seller.current.pieces, customers:seller.current.customers.size,
      orders:seller.current.orders, distinctProducts:seller.current.products.size, positivity, mix:currentMix.percent, mixCategories:currentMix.fulfilled,
    };
    const previousRaw = {
      revenue:seller.previous.revenue, kg:seller.previous.kg, pieces:seller.previous.pieces, customers:seller.previous.customers.size,
      orders:seller.previous.orders, distinctProducts:seller.previous.products.size, positivity:previousPositivity, mix:previousMix.percent, mixCategories:previousMix.fulfilled,
    };
    const currentPoints = currentBasePoints + performanceRulePoints(campaign.pointRules, currentRaw);
    const previousPoints = previousBasePoints + performanceRulePoints(campaign.pointRules, previousRaw);

    const current = { ...currentRaw, points:currentPoints };
    const previous = { ...previousRaw, points:previousPoints };
    return {
      name:seller.name,
      current, previous,
      revenue:current.revenue, previousRevenue:previous.revenue, revenueGrowth:growth(current.revenue, previous.revenue),
      kg:current.kg, previousKg:previous.kg, kgGrowth:growth(current.kg, previous.kg),
      pieces:current.pieces, previousPieces:previous.pieces, piecesGrowth:growth(current.pieces, previous.pieces),
      customers:current.customers, previousCustomers:previous.customers, customersGrowth:growth(current.customers, previous.customers),
      orders:current.orders, previousOrders:previous.orders, ordersGrowth:growth(current.orders, previous.orders),
      positivity, mix:current.mix, mixDone:currentMix.fulfilled, mixTotal:currentMix.total, mixMissing:currentMix.missing,
      points:current.points, previousPoints:previous.points, pointsGrowth:growth(current.points, previous.points),
      distinctProducts:current.distinctProducts,
      eligible:true, reasons:[], individualGoals:[],
    };
  }

  function teamMetrics(campaign, sellers, results, period = 'current') {
    const rows = [...sellers.values()].flatMap((seller) => seller[period].rows);
    const clients = new Set(rows.map((row) => String(row.clientId)));
    const products = new Set(rows.map((row) => Number(row.productId)));
    const mix = categoryStats(campaign.categories, rows);
    return {
      revenue:[...sellers.values()].reduce((sum, seller) => sum + Number(seller[period].revenue || 0), 0),
      kg:[...sellers.values()].reduce((sum, seller) => sum + Number(seller[period].kg || 0), 0),
      pieces:[...sellers.values()].reduce((sum, seller) => sum + Number(seller[period].pieces || 0), 0),
      customers:clients.size,
      orders:[...sellers.values()].reduce((sum, seller) => sum + Number(seller[period].orders || 0), 0),
      distinctProducts:products.size,
      mix:mix.percent,
      mixCategories:mix.fulfilled,
      points:results.reduce((sum, item) => sum + Number(item[period].points || 0), 0),
      positivity:0,
    };
  }

  function rankMetric(item, metric) {
    return Number(item[metric] ?? item.current?.[metric] ?? 0);
  }

  function compareRank(a, b, campaign) {
    for (const metric of campaign.rankingMetrics || []) {
      const diff = rankMetric(b, metric) - rankMetric(a, metric);
      if (Math.abs(diff) > 1e-9) return diff;
    }
    for (const tie of campaign.tieBreaks || []) {
      const diff = rankMetric(b, tie.metric) - rankMetric(a, tie.metric);
      if (Math.abs(diff) > 1e-9) return tie.direction === 'asc' ? -diff : diff;
    }
    return a.name.localeCompare(b.name, 'pt-BR');
  }

  function calculatePerformance(campaign, data, periods) {
    const sellers = new Map();
    const orderMap = new Map((data.ordersBySeller || []).map((row) => [`${row.period}|${row.seller}`, Number(row.orders) || 0]));
    for (const row of data.lines || []) {
      if (!sellers.has(row.seller)) sellers.set(row.seller, { name:row.seller, current:periodBucket(), previous:periodBucket() });
      const seller = sellers.get(row.seller);
      const bucket = row.period === 'current' ? seller.current : seller.previous;
      bucket.revenue += Number(row.revenue) || 0;
      bucket.kg += Number(row.kg) || 0;
      bucket.pieces += Number(row.pieces) || 0;
      bucket.customers.add(String(row.clientId));
      bucket.products.add(Number(row.productId));
      bucket.rows.push(row);
    }
    for (const seller of sellers.values()) {
      seller.current.orders = orderMap.get(`current|${seller.name}`) || 0;
      seller.previous.orders = orderMap.get(`previous|${seller.name}`) || 0;
    }

    const results = [...sellers.values()].map((seller) => sellerMetrics(campaign, seller));
    for (const item of results) {
      for (const rule of campaign.rules || []) {
        const value = rankMetric(item, rule.metric);
        if (!compareOp(value, rule.operator, Number(rule.value) || 0)) {
          item.eligible = false;
          item.reasons.push(`${rule.name}: ${number(value, 1)} ${rule.operator} ${number(rule.value, 1)}`);
        }
      }
      if (['individual','both'].includes(campaign.goalMode)) {
        for (const goal of campaign.individualGoals || []) {
          const value = goalValue(goal, item.current, item.previous);
          const hit = compareOp(value, goal.operator, Number(goal.value) || 0);
          item.individualGoals.push({ ...goal, value, hit });
          if (!hit) {
            item.eligible = false;
            item.reasons.push(goalDescription(goal, value));
          }
        }
      }
    }

    const collectiveCurrent = teamMetrics(campaign, sellers, results, 'current');
    const collectivePrevious = teamMetrics(campaign, sellers, results, 'previous');
    collectiveCurrent.positivity = collectiveCurrent.customers - collectivePrevious.customers;
    // Positivação anterior exigiria um terceiro período-base; não é usada como crescimento percentual.
    collectivePrevious.positivity = 0;
    const collectiveGoals = ['collective','both'].includes(campaign.goalMode)
      ? (campaign.collectiveGoals || []).map((goal) => {
          const value = goalValue(goal, collectiveCurrent, collectivePrevious);
          return { ...goal, value, hit:compareOp(value, goal.operator, Number(goal.value) || 0) };
        })
      : [];
    const collectiveHit = collectiveGoals.every((goal) => goal.hit);

    const ordered = [...results].sort((a,b) => compareRank(a,b,campaign));
    const eligible = ordered.filter((item) => item.eligible);
    let classified;
    if (campaign.rankingMode === 'ALL_ELIGIBLE') classified = eligible;
    else if (campaign.rankingMode === 'TOP_N') classified = ordered.slice(0, Number(campaign.topN) || 5);
    else classified = eligible.slice(0, Number(campaign.topN) || 5);
    if (!collectiveHit) classified = [];
    const classifiedSet = new Set(classified.map((item) => item.name));
    ordered.forEach((item, index) => { item.position = index + 1; item.classified = classifiedSet.has(item.name); });

    return {
      periods,
      results:ordered,
      collectiveGoals,
      collectiveHit,
      summary:{
        revenue:collectiveCurrent.revenue, previousRevenue:collectivePrevious.revenue,
        kg:collectiveCurrent.kg, previousKg:collectivePrevious.kg,
        pieces:collectiveCurrent.pieces, previousPieces:collectivePrevious.pieces,
        positivity:collectiveCurrent.positivity,
        points:collectiveCurrent.points,
        eligible:eligible.length, classified:classified.length,
      },
    };
  }

  async function openPerformance(id) {
    const campaign = normalizeCampaign(await DB.get('campanhas', id));
    if (!campaign?.id) return;
    $('#drawerBackdrop').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#performanceTitle').textContent = campaign.name;
    $('#performanceBody').innerHTML = `<div class="loading-stage"><div><div class="spinner"></div><h3>Consultando vendas reais</h3><p>A apuração compara a campanha com o período anterior equivalente.</p></div></div>`;
    const periods = calculatePeriods(campaign.start, campaign.end);
    if (!periods.valid) { $('#performanceBody').innerHTML = `<div class="context-error">${esc(periods.error)}</div>`; return; }
    const productIds = [...new Set((campaign.categories || []).flatMap((category) => (category.products || []).map((product) => Number(product.id))).filter(Number.isFinite))];
    const supplierIds = (campaign.suppliers || []).map((supplier) => Number(supplier.id)).filter(Number.isFinite);
    try {
      const data = await api(`${SQL_ENDPOINT}?recurso=apuracao`, {
        method:'POST',
        body:JSON.stringify({
          currentStart:periods.currentStart, currentEnd:periods.currentEnd,
          previousStart:periods.previousStart, previousEnd:periods.previousEnd,
          supplierIds, productIds,
          sellers:campaign.participantMode === 'specific' ? campaign.representatives : [],
        }),
      });
      const result = calculatePerformance(campaign, data, periods);
      await DB.put('apuracoes', { id:`performance:${campaign.id}`, campaignId:campaign.id, generatedAt:new Date().toISOString(), result });
      $('#performanceBody').innerHTML = performanceHtml(campaign, result, data);
      icons($('#performanceBody'));
    } catch (error) {
      $('#performanceBody').innerHTML = `<div class="context-error"><strong>Não foi possível consultar o SQL Server.</strong><br>${esc(error.message)}${error.hint ? `<br>${esc(error.hint)}` : ''}<br><button class="secondary-btn" data-action="retry-performance" data-id="${esc(id)}" style="margin-top:10px">Tentar novamente</button></div>`;
    }
  }

  function performanceHtml(campaign, result, data) {
    const summary = result.summary;
    return `<div class="performance-kpis">
      ${performanceMeta('Faturamento', money(summary.revenue), `${pct(growth(summary.revenue, summary.previousRevenue))} vs anterior`)}
      ${performanceMeta('Volume', `${number(summary.kg,1)} KG`, `${pct(growth(summary.kg, summary.previousKg))} vs anterior`)}
      ${performanceMeta('Positivação', `${summary.positivity >= 0 ? '+' : ''}${number(summary.positivity)}`, 'clientes atuais − anteriores')}
      ${performanceMeta('Pontos', number(summary.points,1), 'total da campanha')}
      ${performanceMeta('Elegíveis', number(summary.eligible), `${summary.classified} classificado(s)`)}
    </div>
    ${result.collectiveGoals.length ? `<div class="goal-status-grid">${result.collectiveGoals.map((goal) => `<div class="goal-status ${goal.hit ? 'success' : 'danger'}"><strong>${goal.hit ? 'Meta coletiva atingida' : 'Meta coletiva não atingida'}</strong><small>${esc(goalDescription(goal, goal.value))}</small></div>`).join('')}</div>` : '<div class="goal-status-grid"><div class="goal-status"><strong>Meta coletiva não configurada</strong><small>O ranking depende apenas das metas individuais, elegibilidade e métricas selecionadas.</small></div></div>'}
    <section class="section-card" style="margin-top:12px"><div class="section-head"><div><span class="eyebrow">Performance</span><h3>Ranking e comparativo por vendedor</h3></div><span class="hint">${esc(data.source || 'SQL Server')} · ${number(data.durationMs || 0)} ms</span></div>
      <div class="table-wrap" style="margin-top:12px"><table><thead><tr><th>#</th><th>Representante</th><th>R$ campanha</th><th>R$ anterior</th><th>Δ R$</th><th>KG campanha</th><th>KG anterior</th><th>Δ KG</th><th>Clientes</th><th>Anterior</th><th>Positivação</th><th>Mix</th><th>Pontos</th><th>Situação</th></tr></thead><tbody>${result.results.map((item) => performanceRow(item, result.collectiveHit)).join('') || '<tr><td colspan="14">Nenhuma venda encontrada no período.</td></tr>'}</tbody></table></div>
    </section>
    <div class="meta-block"><strong>Períodos utilizados:</strong> campanha ${dateBR(result.periods.currentStart)} a ${dateBR(result.periods.currentLast)} · anterior ${dateBR(result.periods.previousStart)} a ${dateBR(result.periods.previousLast)} · referência ${esc(data.dateReference || 'dbo.Vendas.[Data]')}.</div>`;
  }

  function performanceMeta(label, value, detail) { return `<div class="meta-card"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`; }
  function performanceRow(item, collectiveHit) {
    const status = !item.eligible ? 'Inelegível' : !collectiveHit ? 'Meta coletiva pendente' : item.classified ? 'Classificado' : 'Elegível';
    return `<tr><td><span class="rank-badge">${item.position}</span></td><td><strong>${esc(item.name)}</strong>${item.reasons.length ? `<small style="display:block;color:var(--danger);margin-top:3px" title="${esc(item.reasons.join(' · '))}">${esc(item.reasons[0])}</small>` : ''}</td><td>${money(item.revenue)}</td><td>${money(item.previousRevenue)}</td><td><span class="delta ${item.revenueGrowth >= 0 ? 'positive' : 'negative'}">${pct(item.revenueGrowth)}</span></td><td>${number(item.kg,1)}</td><td>${number(item.previousKg,1)}</td><td><span class="delta ${item.kgGrowth >= 0 ? 'positive' : 'negative'}">${pct(item.kgGrowth)}</span></td><td>${number(item.customers)}</td><td>${number(item.previousCustomers)}</td><td><strong class="delta ${item.positivity >= 0 ? 'positive' : 'negative'}">${item.positivity >= 0 ? '+' : ''}${number(item.positivity)}</strong></td><td>${number(item.mix)}% <small>(${item.mixDone}/${item.mixTotal})</small></td><td>${number(item.points,1)}</td><td><span class="badge ${item.classified && collectiveHit ? 'active' : !item.eligible ? 'danger' : 'scheduled'}">${status}</span></td></tr>`;
  }

  function closePerformance() {
    $('#drawerBackdrop').hidden = true;
    document.body.style.overflow = '';
  }

  function renderSupplierResults(value) {
    if (!app.wizard) return;
    app.wizard.supplierQuery = value;
    const input = $('#supplierSearch');
    renderWizard();
    requestAnimationFrame(() => {
      const next = $('#supplierSearch');
      if (next) { next.focus(); next.setSelectionRange(next.value.length, next.value.length); }
    });
  }

  function addProductsToCategory(products, categoryId) {
    const category = app.wizard.campaign.categories.find((item) => item.id === categoryId);
    if (!category) return;
    const map = new Map((category.products || []).map((product) => [Number(product.id), product]));
    for (const product of products) {
      const visual = app.imageCache.get(String(product.id));
      map.set(Number(product.id), { ...product, image:visual?.image || product.image || '' });
    }
    category.products = [...map.values()];
    app.wizard.selectedProducts.clear();
    renderWizard();
  }

  function targetCategory() {
    let category = app.wizard.campaign.categories.find((item) => item.id === app.wizard.selectedCategoryId);
    if (!category && app.wizard.campaign.categories.length === 1) category = app.wizard.campaign.categories[0];
    if (!category) {
      toast('Crie ou selecione uma categoria antes de adicionar produtos.', 'warning');
      return null;
    }
    return category;
  }

  function updateCategorySelection(categoryId) {
    app.wizard.selectedCategoryId = categoryId;
  }

  function applyProductFiltersAndRender() {
    app.wizard.productVisibleLimit = 100;
    renderWizard();
  }

  let supplierTimer;
  let productTimer;
  document.addEventListener('input', (event) => {
    if (event.target.id === 'campaignSearch') { app.campaignSearch = event.target.value; renderCampaigns(); $('#campaignSearch')?.focus(); }
    if (event.target.id === 'representativeSearch') { app.representativeSearch = event.target.value; renderRepresentatives(); $('#representativeSearch')?.focus(); }
    if (event.target.id === 'productPageSearch') { app.productSearch = event.target.value; renderProducts(); $('#productPageSearch')?.focus(); }
    if (event.target.id === 'supplierSearch') { clearTimeout(supplierTimer); supplierTimer = setTimeout(() => renderSupplierResults(event.target.value), 80); }
    if (event.target.id === 'campaignStart' || event.target.id === 'campaignEnd') {
      app.wizard.campaign.start = $('#campaignStart')?.value || app.wizard.campaign.start;
      app.wizard.campaign.end = $('#campaignEnd')?.value || app.wizard.campaign.end;
      const preview = $('#periodPreview');
      if (preview) { preview.innerHTML = periodPreview(calculatePeriods(app.wizard.campaign.start, app.wizard.campaign.end)); icons(preview); }
    }
    if (event.target.id === 'wizardRepSearch') {
      const query = norm(event.target.value);
      $$('#wizardRepList [data-rep-row]').forEach((row) => { row.hidden = query && !row.dataset.repRow.includes(query); });
    }
    if (event.target.id === 'productSearch') {
      clearTimeout(productTimer);
      app.wizard.productFilters.search = event.target.value;
      productTimer = setTimeout(applyProductFiltersAndRender, 90);
    }
    if (event.target.matches('[data-category-field]')) syncCategories();
    if (event.target.matches('[data-goal-field]')) syncGoals();
    if (event.target.matches('[data-point-field]')) syncPointRules();
    if (event.target.matches('[data-rule-field]')) syncEligibilityRules();
  });

  document.addEventListener('change', (event) => {
    if (event.target.matches('[data-representative]')) {
      const selected = new Set(app.wizard.campaign.representatives || []);
      event.target.checked ? selected.add(event.target.dataset.representative) : selected.delete(event.target.dataset.representative);
      app.wizard.campaign.representatives = [...selected];
    }
    if (event.target.id === 'rankingMode') app.wizard.campaign.rankingMode = event.target.value;
    if (event.target.id === 'topN') app.wizard.campaign.topN = Math.max(1, Number(event.target.value) || 1);
    if (event.target.id === 'productGroup') { app.wizard.productFilters.group = event.target.value; app.wizard.productFilters.subgroup = ''; applyProductFiltersAndRender(); }
    if (event.target.id === 'productSubgroup') { app.wizard.productFilters.subgroup = event.target.value; applyProductFiltersAndRender(); }
    if (event.target.id === 'targetCategorySelect') app.wizard.selectedCategoryId = event.target.value || null;
    if (event.target.matches('[data-product-select]')) {
      const id = Number(event.target.dataset.productSelect);
      event.target.checked ? app.wizard.selectedProducts.add(id) : app.wizard.selectedProducts.delete(id);
      event.target.closest('.product-card')?.classList.toggle('is-selected', event.target.checked);
    }
    if (event.target.matches('[data-goal-field="mode"]')) renderWizard();
    if (event.target.matches('[data-point-field="mode"]')) renderWizard();
  });

  document.addEventListener('click', async (event) => {
    const node = event.target.closest('[data-action],[data-view]');
    if (!node) return;
    const action = node.dataset.action;
    const view = node.dataset.view;

    if (view) { app.view = view; renderView(); return; }
    if (action === 'new-campaign') return openWizard();
    if (action === 'edit-campaign') return openWizard(node.dataset.id);
    if (action === 'close-modal') return closeWizard();
    if (action === 'close-performance') return closePerformance();
    if (action === 'open-sidebar') { $('#sidebar').classList.add('is-open'); $('.sidebar-backdrop').classList.add('is-open'); return; }
    if (action === 'close-sidebar') { $('#sidebar').classList.remove('is-open'); $('.sidebar-backdrop').classList.remove('is-open'); return; }
    if (action === 'theme') { const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'; document.documentElement.dataset.theme = next; localStorage.setItem(THEME_KEY, next); return; }
    if (action === 'settings') { const value = prompt('Endereço da API local', SQL_BASE); if (value) { localStorage.setItem(SQL_BASE_KEY, value.replace(/\/$/, '')); alert('Endereço salvo. Recarregue a página.'); } return; }
    if (action === 'refresh-context') { $('#contextOverlay').hidden = false; document.body.style.overflow = 'hidden'; return pollContext({ force:true, blocking:true }).catch(() => {}); }
    if (action === 'retry-context') return pollContext({ force:true, blocking:true }).catch(() => {});
    if (action === 'use-cached-context') { if (app.contextCached) { app.contextReady = true; $('#contextOverlay').hidden = true; document.body.style.overflow = ''; renderView(); toast('Usando o último contexto salvo.', 'warning'); } return; }

    if (action === 'wizard-step') {
      syncCurrentStep();
      const target = Number(node.dataset.step);
      if (target > app.wizard.step) { const error = validateStep(app.wizard.step); if (error) return toast(error, 'error'); }
      app.wizard.step = target; renderWizard(); return;
    }
    if (action === 'previous-step') { syncCurrentStep(); app.wizard.step = Math.max(0, app.wizard.step - 1); renderWizard(); return; }
    if (action === 'next-step') { const error = validateStep(); if (error) return toast(error, 'error'); syncCurrentStep(); app.wizard.step = Math.min(STEPS.length - 1, app.wizard.step + 1); renderWizard(); return; }
    if (action === 'save-campaign') return saveCampaign();

    if (action === 'toggle-supplier') {
      const supplier = app.context.suppliers.find((item) => String(item.id) === String(node.dataset.id));
      if (!supplier) return;
      const list = app.wizard.campaign.suppliers;
      const index = list.findIndex((item) => String(item.id) === String(supplier.id));
      if (index >= 0) list.splice(index, 1);
      else list.push({ id:supplier.id, name:supplier.name, totalProducts:supplier.totalProducts });
      app.wizard.campaign.categories = app.wizard.campaign.categories.map((category) => ({ ...category, products:(category.products || []).filter((product) => list.some((item) => Number(item.id) === Number(product.supplierId))) }));
      renderWizard(); return;
    }
    if (action === 'remove-supplier') {
      app.wizard.campaign.suppliers = app.wizard.campaign.suppliers.filter((item) => String(item.id) !== String(node.dataset.id));
      renderWizard(); return;
    }
    if (action === 'participant-mode') { app.wizard.campaign.participantMode = node.dataset.value; renderWizard(); return; }
    if (action === 'toggle-ranking') {
      const metric = node.dataset.value;
      const list = app.wizard.campaign.rankingMetrics;
      const index = list.indexOf(metric);
      if (index >= 0) list.splice(index, 1); else list.push(metric);
      renderWizard(); return;
    }
    if (action === 'goal-mode') { app.wizard.campaign.goalMode = node.dataset.value; renderWizard(); return; }
    if (action === 'add-goal') {
      const scope = node.dataset.scope;
      (scope === 'collective' ? app.wizard.campaign.collectiveGoals : app.wizard.campaign.individualGoals).push(defaultGoal(scope));
      renderWizard(); return;
    }
    if (action === 'remove-goal') {
      const list = node.dataset.scope === 'collective' ? app.wizard.campaign.collectiveGoals : app.wizard.campaign.individualGoals;
      const index = list.findIndex((item) => item.id === node.dataset.id);
      if (index >= 0) list.splice(index, 1);
      renderWizard(); return;
    }
    if (action === 'add-point-rule') { app.wizard.campaign.pointRules.push({ id:uid('point'), source:'positivity', mode:'per_unit', basis:1, points:100 }); renderWizard(); return; }
    if (action === 'remove-point-rule') { app.wizard.campaign.pointRules = app.wizard.campaign.pointRules.filter((item) => item.id !== node.dataset.id); renderWizard(); return; }
    if (action === 'add-rule-template') { app.wizard.campaign.rules.push({ id:uid('rule'), name:node.dataset.label, metric:node.dataset.metric, operator:'>=', value:Number(node.dataset.value) || 0 }); renderWizard(); return; }
    if (action === 'remove-rule') { app.wizard.campaign.rules = app.wizard.campaign.rules.filter((item) => item.id !== node.dataset.id); renderWizard(); return; }

    if (action === 'add-category') {
      const name = $('#newCategoryName')?.value.trim();
      if (!name) return toast('Informe o nome da categoria.', 'warning');
      const category = { id:uid('category'), name, requiredMix:true, minDistinct:1, pointUnit:'none', pointValue:0, products:[] };
      app.wizard.campaign.categories.push(category); updateCategorySelection(category.id); renderWizard(); return;
    }
    if (action === 'remove-category') { app.wizard.campaign.categories = app.wizard.campaign.categories.filter((item) => item.id !== node.dataset.id); renderWizard(); return; }
    if (action === 'remove-product-category') {
      const category = app.wizard.campaign.categories.find((item) => item.id === node.dataset.categoryId);
      if (category) category.products = category.products.filter((product) => Number(product.id) !== Number(node.dataset.productId));
      renderWizard(); return;
    }
    if (action === 'add-selected-products') {
      const category = targetCategory(); if (!category) return;
      const selected = filteredCampaignProducts().filter((product) => app.wizard.selectedProducts.has(Number(product.id)));
      if (!selected.length) return toast('Selecione pelo menos um produto.', 'warning');
      addProductsToCategory(selected, category.id); return;
    }
    if (action === 'add-all-filtered') {
      const category = targetCategory(); if (!category) return;
      const filtered = filteredCampaignProducts();
      addProductsToCategory(filtered, category.id);
      toast(`${filtered.length} produto(s) filtrado(s) adicionados.`); return;
    }

    if (action === 'add-tie') { app.wizard.campaign.tieBreaks.push({ metric:'revenue', direction:'desc' }); renderWizard(); return; }
    if (action === 'remove-tie') { app.wizard.campaign.tieBreaks.splice(Number(node.dataset.index), 1); renderWizard(); return; }
    if (action === 'move-tie-up') { const index = Number(node.dataset.index); if (index > 0) { const list = app.wizard.campaign.tieBreaks; [list[index - 1], list[index]] = [list[index], list[index - 1]]; } renderWizard(); return; }
    if (action === 'add-prize') { app.wizard.campaign.prizes.push({ position:app.wizard.campaign.prizes.length + 1, type:'money', description:'' }); renderWizard(); return; }
    if (action === 'remove-prize') { app.wizard.campaign.prizes.splice(Number(node.dataset.index), 1); renderWizard(); return; }
    if (action === 'performance') return openPerformance(node.dataset.id);
    if (action === 'retry-performance') { closePerformance(); return openPerformance(node.dataset.id); }
  });

  document.addEventListener('click', (event) => {
    const categoryCardNode = event.target.closest('.category-card');
    if (categoryCardNode && !event.target.closest('button,input,select')) updateCategorySelection(categoryCardNode.dataset.categoryId);
  });

  document.addEventListener('dragstart', (event) => {
    const card = event.target.closest('[data-product-id]');
    if (!card) return;
    event.dataTransfer.setData('text/product-id', card.dataset.productId);
    event.dataTransfer.effectAllowed = 'copy';
  });
  document.addEventListener('dragover', (event) => {
    const drop = event.target.closest('[data-category-drop]');
    if (!drop) return;
    event.preventDefault(); drop.closest('.category-card')?.classList.add('is-dragover');
  });
  document.addEventListener('dragleave', (event) => event.target.closest('.category-card')?.classList.remove('is-dragover'));
  document.addEventListener('drop', (event) => {
    const drop = event.target.closest('[data-category-drop]');
    if (!drop) return;
    event.preventDefault(); drop.closest('.category-card')?.classList.remove('is-dragover');
    const id = Number(event.dataTransfer.getData('text/product-id'));
    const product = productsForCampaign().find((item) => Number(item.id) === id);
    if (product) addProductsToCategory([product], drop.dataset.categoryDrop);
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); $('#globalSearch')?.focus(); }
    if (event.key === 'Escape') { if (!$('#modalBackdrop').hidden) closeWizard(); else if (!$('#drawerBackdrop').hidden) closePerformance(); }
  });

  $('#globalSearch')?.addEventListener('input', (event) => {
    app.campaignSearch = event.target.value;
    app.view = 'campaigns';
    renderView();
  });

  async function init() {
    document.documentElement.dataset.theme = localStorage.getItem(THEME_KEY) || 'light';
    await DB.init();
    await loadCampaigns();
    renderView();
    icons();
    $('#contextOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
    void initializeContext();
  }

  window.addEventListener('pmg-lucide-ready', () => icons());
  window.addEventListener('DOMContentLoaded', init);
})();
