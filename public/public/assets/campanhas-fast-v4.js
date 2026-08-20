(() => {
  'use strict';

  const SQL_BASE_KEY = 'pmg_campaigns_sql_base';
  const BOOTSTRAP_KEY = 'pmg_campaigns_bootstrap_v4';
  const THEME_KEY = 'pmg_theme';
  const SQL_BASE = String(localStorage.getItem(SQL_BASE_KEY) || window.PMG_SQL_API_BASE || 'http://localhost:3001/api').replace(/\/$/, '');
  const SQL_ENDPOINT = `${SQL_BASE}/campanhas-data`;
  const DB_NAME = 'pmg_campanhas_db';
  const DB_VERSION = 1;
  const STORES = ['campanhas', 'produtos', 'representantes', 'vendas', 'regras', 'regrasProduto', 'mapeamentos', 'apuracoes', 'config'];

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[char]));
  const norm = (value) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR').trim();
  const uid = (prefix = 'id') => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const money = (value) => Number(value || 0).toLocaleString('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 });
  const number = (value, digits = 0) => Number(value || 0).toLocaleString('pt-BR', { maximumFractionDigits:digits, minimumFractionDigits:digits });
  const pct = (value) => `${Number(value || 0) >= 0 ? '+' : ''}${number(value, 1)}%`;
  const dateBR = (value) => value ? new Date(`${String(value).slice(0,10)}T12:00:00`).toLocaleDateString('pt-BR') : '—';
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  const METRICS = [
    { id:'points', label:'Pontos', icon:'sparkles', description:'Pontuação definida nas categorias de produtos' },
    { id:'revenue', label:'Faturamento', icon:'badge-dollar-sign', description:'Maior venda em reais no período' },
    { id:'kg', label:'Volume em KG', icon:'weight', description:'Maior volume vendido no período' },
    { id:'positivity', label:'Positivação', icon:'user-round-plus', description:'Clientes atuais menos clientes do período anterior' },
    { id:'mix', label:'Mix', icon:'boxes', description:'Percentual de categorias obrigatórias cumpridas' },
    { id:'revenueGrowth', label:'Crescimento', icon:'trending-up', description:'Evolução do faturamento contra o período anterior' },
  ];
  const META_METRICS = [
    { id:'positivity', label:'Positivação', unit:'clientes' },
    { id:'revenue', label:'Faturamento', unit:'R$' },
    { id:'kg', label:'Volume', unit:'KG' },
    { id:'points', label:'Pontos', unit:'pontos' },
    { id:'customers', label:'Clientes únicos', unit:'clientes' },
    { id:'mix', label:'Mix', unit:'%' },
    { id:'orders', label:'Pedidos', unit:'pedidos' },
    { id:'revenueGrowth', label:'Crescimento de faturamento', unit:'%' },
    { id:'kgGrowth', label:'Crescimento de volume', unit:'%' },
  ];
  const RULE_TEMPLATES = [
    { label:'Positivação mínima', metric:'positivity', operator:'>=', value:4 },
    { label:'Faturamento mínimo', metric:'revenue', operator:'>=', value:10000 },
    { label:'Volume mínimo', metric:'kg', operator:'>=', value:100 },
    { label:'Mix mínimo', metric:'mix', operator:'>=', value:100 },
    { label:'Pontos mínimos', metric:'points', operator:'>=', value:400 },
    { label:'Pedidos mínimos', metric:'orders', operator:'>=', value:5 },
  ];
  const TIE_OPTIONS = [
    ['positivity','Maior positivação'], ['revenue','Maior faturamento'], ['kg','Maior volume'],
    ['mix','Maior mix'], ['points','Maior pontuação'], ['orders','Mais pedidos'],
    ['revenueGrowth','Maior crescimento de faturamento'], ['kgGrowth','Maior crescimento de volume'],
  ];
  const STEPS = [
    { id:'general', title:'Informações gerais', subtitle:'Fornecedor, período e participantes', icon:'file-pen-line' },
    { id:'rules', title:'Regras e metas', subtitle:'Ranking, elegibilidade e objetivos', icon:'sliders-horizontal' },
    { id:'products', title:'Produtos e categorias', subtitle:'Escopo, mix e pontuação', icon:'package-search' },
    { id:'tie', title:'Desempate e premiação', subtitle:'Prioridades e classificados', icon:'trophy' },
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
    view:'dashboard', campaigns:[], bootstrap:{ fornecedores:[], representantes:[], atualizadoEm:null, stale:false },
    bootstrapReady:false, bootstrapPromise:null, bootstrapPoll:null, campaignSearch:'', representativeSearch:'',
    wizard:null, performance:null, imageCache:new Map(), apiInFlight:new Map(), apiCache:new Map(),
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
    setTimeout(() => node.remove(), 4300);
  }

  function setProgress(active) {
    const bar = $('#progressLine');
    bar.classList.toggle('is-loading', active);
    if (!active) { bar.classList.add('is-done'); setTimeout(() => bar.classList.remove('is-done'), 300); }
  }

  function setApiStatus(status, detail) {
    const box = $('#sideStatus');
    box.classList.remove('is-online','is-error');
    if (status === 'online') box.classList.add('is-online');
    if (status === 'error') box.classList.add('is-error');
    $('#sideStatusDetail').textContent = detail || '';
  }

  function cacheKey(url, options = {}) { return `${options.method || 'GET'}:${url}:${options.body || ''}`; }
  async function api(url, options = {}) {
    const key = cacheKey(url, options);
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
      if (!response.ok) {
        const error = new Error(data.erro || data.message || `Falha HTTP ${response.status}`);
        error.code = data.codigo;
        error.hint = data.dica;
        throw error;
      }
      if (cacheable) app.apiCache.set(key, { at:Date.now(), data });
      return data;
    })().finally(() => app.apiInFlight.delete(key));
    if (cacheable) app.apiInFlight.set(key, promise);
    return promise;
  }

  function localBootstrap() {
    try {
      const parsed = JSON.parse(localStorage.getItem(BOOTSTRAP_KEY) || 'null');
      if (parsed && Array.isArray(parsed.fornecedores) && Array.isArray(parsed.representantes)) return parsed;
    } catch (_) {}
    return null;
  }

  async function loadBootstrap({ force = false, silent = true } = {}) {
    if (app.bootstrapPromise && !force) return app.bootstrapPromise;
    const cached = localBootstrap();
    if (cached && !app.bootstrapReady) {
      app.bootstrap = cached;
      app.bootstrapReady = true;
      setApiStatus('online', `Cache local: ${cached.fornecedores.length} fornecedores`);
      if (app.view === 'representatives') renderRepresentatives();
    }
    app.bootstrapPromise = api(`${SQL_ENDPOINT}?recurso=bootstrap`, { force, ttl:60000 })
      .then((data) => {
        const received = { fornecedores:data.fornecedores || [], representantes:data.representantes || [], atualizadoEm:data.atualizadoEm, stale:data.stale };
        if (received.fornecedores.length || received.representantes.length) {
          app.bootstrap = received;
          app.bootstrapReady = Boolean(data.ready !== false && received.fornecedores.length);
          localStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(app.bootstrap));
        }
        if (data.ready === false || data.warming) {
          setApiStatus('', 'Aquecendo conexão SQL em segundo plano…');
          clearTimeout(app.bootstrapPoll);
          app.bootstrapPoll = setTimeout(() => void loadBootstrap({ force:true, silent:true }).catch(() => {}), 2400);
        } else {
          app.bootstrapReady = true;
          setApiStatus('online', `${app.bootstrap.fornecedores.length} fornecedores · ${app.bootstrap.representantes.length} representantes ativos`);
        }
        if (app.view === 'representatives') renderRepresentatives();
        if (app.wizard?.open && app.wizard.step === 0) renderSupplierResults($('#supplierSearch')?.value || '');
        return app.bootstrap;
      })
      .catch((error) => {
        setApiStatus('error', error.message);
        if (!silent) toast(error.message, 'error');
        throw error;
      })
      .finally(() => { app.bootstrapPromise = null; });
    return app.bootstrapPromise;
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

  async function loadCampaigns() {
    app.campaigns = (await DB.all('campanhas')).sort((a,b) => String(b.updatedAt || b.createdAt || '').localeCompare(String(a.updatedAt || a.createdAt || '')));
    $('#navCampaignCount').textContent = app.campaigns.length;
  }

  function pageHeader(title, description, action = '') {
    return `<div class="page-head"><div><h2>${esc(title)}</h2><p>${esc(description)}</p></div>${action}</div>`;
  }

  function emptyState(title, text, button = '') {
    return `<div class="empty-state"><div class="empty-icon"><i data-lucide="megaphone"></i></div><h3>${esc(title)}</h3><p>${esc(text)}</p>${button}</div>`;
  }

  function campaignCard(campaign) {
    const status = campaignStatus(campaign);
    const productCount = (campaign.categories || []).reduce((sum, cat) => sum + (cat.products || []).length, 0);
    const rules = (campaign.rules || []).length;
    const metrics = (campaign.rankingMetrics || []).length;
    return `<article class="campaign-card" data-campaign-id="${esc(campaign.id)}">
      <div class="campaign-card-head">
        <div class="campaign-mark"><i data-lucide="megaphone"></i></div>
        <div class="campaign-title"><h3>${esc(campaign.name || 'Campanha sem nome')}</h3><p>${esc(campaign.supplier?.name || campaign.fornecedor || 'Fornecedor não definido')}</p></div>
        <span class="badge ${status.class}">${status.label}</span>
      </div>
      <div class="campaign-stats">
        <div class="mini-stat"><span>Período</span><strong>${dateBR(campaign.start)} – ${dateBR(campaign.end)}</strong></div>
        <div class="mini-stat"><span>Produtos</span><strong>${productCount || 'Fornecedor'}</strong></div>
        <div class="mini-stat"><span>Regras</span><strong>${rules + metrics}</strong></div>
      </div>
      <div class="campaign-actions">
        <button class="secondary-btn" type="button" data-action="edit-campaign" data-id="${esc(campaign.id)}"><i data-lucide="pencil"></i>Editar</button>
        <button class="primary-btn" type="button" data-action="performance" data-id="${esc(campaign.id)}"><i data-lucide="chart-no-axes-combined"></i>Performance</button>
      </div>
    </article>`;
  }

  function renderDashboard() {
    const active = app.campaigns.filter((c) => campaignStatus(c).id === 'active');
    const scheduled = app.campaigns.filter((c) => campaignStatus(c).id === 'scheduled');
    const closed = app.campaigns.filter((c) => campaignStatus(c).id === 'closed');
    $('#pageRoot').innerHTML = `
      <section class="hero">
        <div><span class="eyebrow" style="color:#a9dfba">Campanhas de incentivo PMG</span><h2>Crie regras complexas sem transformar a tela em uma planilha hostil.</h2><p>Fornecedor, produtos, mix, metas coletivas e individuais, comparação com o período anterior e ranking por vendedor em um único fluxo.</p></div>
        <div class="hero-actions"><button class="secondary-btn" data-view="campaigns"><i data-lucide="list-filter"></i>Ver campanhas</button><button class="primary-btn" data-action="new-campaign"><i data-lucide="plus"></i>Nova campanha</button></div>
      </section>
      <div class="kpi-grid">
        ${kpi('Campanhas ativas', active.length, 'Em andamento agora', 'activity')}
        ${kpi('Agendadas', scheduled.length, 'Próximos períodos', 'calendar-clock')}
        ${kpi('Encerradas', closed.length, 'Histórico disponível', 'badge-check')}
        ${kpi('Representantes ativos', app.bootstrap.representantes.length || '—', 'Base dbo.Clientes', 'users-round')}
      </div>
      <section class="section"><div class="section-head"><h3>Campanhas recentes</h3><span>${app.campaigns.length} cadastrada(s)</span></div>
        ${app.campaigns.length ? `<div class="campaign-grid">${app.campaigns.slice(0,6).map(campaignCard).join('')}</div>` : emptyState('Nenhuma campanha cadastrada', 'Comece criando a primeira campanha. O editor abre imediatamente e os dados do SQL entram somente quando forem necessários.', '<button class="primary-btn" data-action="new-campaign"><i data-lucide="plus"></i>Nova campanha</button>')}
      </section>`;
    icons();
  }

  function kpi(label, value, detail, iconName) {
    return `<div class="kpi-card"><div class="kpi-top"><span>${esc(label)}</span><div class="kpi-icon"><i data-lucide="${iconName}"></i></div></div><strong>${esc(value)}</strong><small>${esc(detail)}</small></div>`;
  }

  function renderCampaigns() {
    const search = norm(app.campaignSearch);
    const list = search ? app.campaigns.filter((c) => norm(`${c.name} ${c.supplier?.name || c.fornecedor || ''}`).includes(search)) : app.campaigns;
    $('#pageRoot').innerHTML = `${pageHeader('Campanhas', 'Cadastre, edite e apure as campanhas de incentivo.', '<button class="primary-btn" data-action="new-campaign"><i data-lucide="plus"></i>Nova campanha</button>')}
      <div class="toolbar"><div class="search-field"><i data-lucide="search"></i><input id="campaignSearch" placeholder="Buscar por campanha ou fornecedor" value="${esc(app.campaignSearch)}"></div></div>
      ${list.length ? `<div class="campaign-grid">${list.map(campaignCard).join('')}</div>` : emptyState('Nenhuma campanha encontrada', search ? 'A busca não encontrou campanhas.' : 'Crie sua primeira campanha.', !search ? '<button class="primary-btn" data-action="new-campaign">Nova campanha</button>' : '')}`;
    icons();
  }

  function renderRepresentatives() {
    const search = norm(app.representativeSearch);
    const reps = (app.bootstrap.representantes || []).filter((rep) => !search || norm(rep.nome).includes(search));
    const loading = !app.bootstrapReady && app.bootstrapPromise;
    $('#pageRoot').innerHTML = `${pageHeader('Representantes', 'Somente vendedores com ao menos um cliente ativo em dbo.Clientes.', '<button class="secondary-btn" data-action="refresh-bootstrap"><i data-lucide="refresh-cw"></i>Atualizar SQL</button>')}
      <div class="toolbar"><div class="search-field"><i data-lucide="search"></i><input id="representativeSearch" placeholder="Buscar representante ativo" value="${esc(app.representativeSearch)}"></div></div>
      ${loading ? `<div class="panel"><div class="skeleton" style="height:48px;margin-bottom:8px"></div><div class="skeleton" style="height:48px;margin-bottom:8px"></div><div class="skeleton" style="height:48px"></div></div>` : reps.length ? `<div class="table-wrap"><table><thead><tr><th>Representante</th><th>Status</th><th>Clientes ativos</th><th>Carteira total</th><th>Origem</th></tr></thead><tbody>${reps.map((rep) => `<tr><td><strong>${esc(rep.nome)}</strong></td><td><span class="badge active">Ativo</span></td><td>${number(rep.clientesAtivos)}</td><td>${number(rep.clientesCarteira)}</td><td>${esc(rep.origem || 'dbo.Clientes')}</td></tr>`).join('')}</tbody></table></div>` : emptyState('Representantes ainda não carregados', 'O servidor local está aquecendo a conexão SQL em segundo plano. A página permanece utilizável.', '<button class="secondary-btn" data-action="refresh-bootstrap">Tentar novamente</button>')}`;
    icons();
  }

  function renderView() {
    $$('.nav-item[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === app.view));
    const title = { dashboard:'Visão geral', campaigns:'Campanhas', representatives:'Representantes' }[app.view];
    $('#pageTitle').textContent = title;
    if (app.view === 'dashboard') renderDashboard();
    if (app.view === 'campaigns') renderCampaigns();
    if (app.view === 'representatives') renderRepresentatives();
  }

  function defaultCampaign() {
    const next = new Date(); next.setHours(12,0,0,0);
    const days = (8 - next.getDay()) % 7 || 7;
    next.setDate(next.getDate() + days);
    const end = new Date(next); end.setDate(end.getDate() + 28);
    return {
      id:uid('camp'), name:'', description:'', supplier:null,
      start:toInputDate(next), end:toInputDate(end), participantMode:'all', representatives:[],
      rankingMetrics:['points'], rankingMode:'TOP_N_ELIGIBLE', topN:5,
      metaMode:'both', collectiveMeta:{ metric:'positivity', value:100 }, individualMeta:{ metric:'positivity', value:4 },
      rules:[], categories:[], tieBreaks:[{ metric:'positivity', direction:'desc' }, { metric:'revenue', direction:'desc' }],
      prizes:[], createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(),
    };
  }

  function toInputDate(date) { return date.toISOString().slice(0,10); }
  function normalizeCampaign(raw = {}) {
    const base = defaultCampaign();
    const supplier = raw.supplier || (raw.fornecedor ? { id:raw.fornecedorId || null, name:raw.fornecedor } : null);
    return {
      ...base, ...raw, supplier,
      name:raw.name || raw.nome || '', description:raw.description || raw.descricao || '',
      start:raw.start || raw.dataInicio || base.start, end:raw.end || raw.dataFim || raw.dataFechamento || base.end,
      rankingMetrics:Array.isArray(raw.rankingMetrics) ? raw.rankingMetrics : Array.isArray(raw.metricasRanking) ? raw.metricasRanking : [raw.metricaRanking || 'points'],
      rules:Array.isArray(raw.rules) ? raw.rules : [], categories:Array.isArray(raw.categories) ? raw.categories : [],
      tieBreaks:Array.isArray(raw.tieBreaks) ? raw.tieBreaks : Array.isArray(raw.desempate) ? raw.desempate.map((item) => typeof item === 'string' ? { metric:legacyMetric(item), direction:'desc' } : { metric:legacyMetric(item.campo), direction:String(item.direcao || 'desc').toLowerCase() }) : base.tieBreaks,
    };
  }

  function legacyMetric(metric) {
    return ({ pontosFinal:'points', faturamentoCampanha:'revenue', kgCampanha:'kg', positivacao:'positivity', mix:'mix', crescimentoFaturamento:'revenueGrowth', crescimentoKg:'kgGrowth', pedidos:'orders' })[metric] || metric || 'points';
  }

  async function legacyData(campaign) {
    if ((campaign.rules?.length || campaign.categories?.length) || !campaign.id) return campaign;
    const [rules, productRules] = await Promise.all([DB.all('regras'), DB.all('regrasProduto')]);
    const linkedRules = rules.filter((item) => item.campanhaId === campaign.id).map((item) => ({ id:item.id, name:item.nome || 'Regra', metric:legacyMetric(item.campo), operator:item.operador || '>=', value:Number(item.valor)||0, required:item.obrigatoria !== false }));
    const groups = new Map();
    productRules.filter((item) => item.campanhaId === campaign.id && item.escopo === 'produto').forEach((item) => {
      const key = item.grupoId || item.grupoNome || 'Produtos participantes';
      if (!groups.has(key)) groups.set(key, { id:key, name:item.grupoNome || 'Produtos participantes', requiredMix:item.participaMix !== false, minDistinct:Number(item.minimoMix)||1, pointUnit:legacyPointUnit(item.unidadePontuacao), pointValue:Number(item.pontos)||0, products:[] });
      groups.get(key).products.push({ id:Number(item.valor), name:item.nomeProduto || `Produto ${item.valor}`, image:item.imagemProduto || '', group:item.grupo || '', subgroup:item.subgrupo || '' });
    });
    return { ...campaign, rules:linkedRules, categories:[...groups.values()] };
  }
  function legacyPointUnit(unit) { return ({ PECA:'pieces', KG:'kg', REAL:'revenue', ITEM:'item' })[String(unit || '').toUpperCase()] || 'pieces'; }

  async function openWizard(id = null) {
    const modal = $('#modalBackdrop');
    modal.hidden = false;
    document.body.style.overflow = 'hidden';
    app.wizard = { open:true, step:0, campaign:defaultCampaign(), catalog:[], catalogTotal:0, productFilters:{ search:'', group:'', subgroup:'', status:'' }, productOptions:{ groups:[], subgroups:[], status:[] }, productsLoaded:false, selectedProducts:new Set(), selectedCategoryId:null, loadingProducts:false, supplierQuery:'', supplierResultsOpen:false };
    renderWizardNav();
    renderWizardStep();
    requestAnimationFrame(() => $('#campaignModal').focus?.());

    if (id) {
      $('#modalTitle').textContent = 'Carregando campanha…';
      const found = await DB.get('campanhas', id);
      if (found) app.wizard.campaign = await legacyData(normalizeCampaign(found));
      $('#modalTitle').textContent = 'Editar campanha';
      renderWizardStep();
    } else $('#modalTitle').textContent = 'Nova campanha';
    icons();
  }

  function closeWizard() {
    $('#modalBackdrop').hidden = true;
    document.body.style.overflow = '';
    app.wizard = null;
  }

  function renderWizardNav() {
    $('#wizardNav').innerHTML = STEPS.map((step, index) => `<button type="button" data-action="wizard-step" data-step="${index}" class="${app.wizard.step === index ? 'is-active' : ''} ${index < app.wizard.step ? 'is-done' : ''}"><span class="step-number">${index + 1}</span><span><strong>${step.title}</strong><small>${step.subtitle}</small></span></button>`).join('');
    $('#wizardProgress').style.width = `${((app.wizard.step + 1) / STEPS.length) * 100}%`;
    $('[data-action="previous-step"]').style.visibility = app.wizard.step === 0 ? 'hidden' : 'visible';
    $('[data-action="next-step"]').style.display = app.wizard.step === STEPS.length - 1 ? 'none' : 'inline-flex';
    $('[data-action="save-campaign"]').style.display = app.wizard.step === STEPS.length - 1 ? 'inline-flex' : 'none';
  }

  function renderWizardStep() {
    if (!app.wizard) return;
    renderWizardNav();
    const renderers = [renderGeneralStep, renderRulesStep, renderProductsStep, renderTieStep];
    $('#wizardStep').innerHTML = renderers[app.wizard.step]();
    $('#modalFootStatus').textContent = app.wizard.campaign.supplier ? `Fornecedor: ${app.wizard.campaign.supplier.name}` : 'Selecione o fornecedor na primeira etapa.';
    icons($('#wizardStep'));
    if (app.wizard.step === 0) renderSupplierResults('');
    if (app.wizard.step === 2 && app.wizard.campaign.supplier && !app.wizard.productsLoaded) void loadProducts();
  }

  function renderGeneralStep() {
    const c = app.wizard.campaign;
    const periods = calculatePeriods(c.start, c.end);
    return `<div class="step-head"><div><h3>Informações gerais</h3><p>O editor aparece primeiro. O SQL é consultado em segundo plano, como no Dashboard Regional.</p></div></div>
      <div class="form-grid">
        <div class="field"><label>Nome da campanha</label><input id="campaignName" value="${esc(c.name)}" placeholder="Ex.: Campanha Camil Julho"></div>
        <div class="field"><label>Status calculado</label><input value="${campaignStatus(c).label}" disabled></div>
        <div class="field full"><label>Descrição ou regulamento</label><textarea id="campaignDescription" placeholder="Explique o objetivo, regras principais e observações.">${esc(c.description)}</textarea></div>
        <div class="field full"><label>Fornecedor</label>${supplierField(c.supplier)}</div>
        <div class="field"><label>Início da campanha</label><input id="campaignStart" type="date" value="${esc(c.start)}"></div>
        <div class="field"><label>Segunda-feira de fechamento</label><input id="campaignEnd" type="date" value="${esc(c.end)}"></div>
        <div class="period-preview" id="periodPreview">${periodPreview(periods)}</div>
        <div class="field full"><label>Participantes</label><div class="choice-grid">
          ${participantChoice('all','Todos os representantes ativos','A campanha considera automaticamente todos os vendedores ativos do SQL.',c.participantMode)}
          ${participantChoice('specific','Representantes específicos','Selecione manualmente quem participa da apuração.',c.participantMode)}
        </div></div>
        ${c.participantMode === 'specific' ? representativesSelector(c.representatives) : ''}
      </div>`;
  }

  function supplierField(supplier) {
    if (supplier) return `<div class="selected-supplier"><div class="supplier-icon"><i data-lucide="building-2"></i></div><div><strong>${esc(supplier.name)}</strong><small>${number(supplier.totalProducts || 0)} produtos na base</small></div><button class="icon-btn" type="button" data-action="clear-supplier" title="Trocar fornecedor"><i data-lucide="x"></i></button></div>`;
    return `<div class="supplier-search"><div class="search-field"><i data-lucide="search"></i><input id="supplierSearch" autocomplete="off" placeholder="Digite ao menos 2 letras. Ex.: Camil"></div><div class="supplier-results" id="supplierResults" hidden></div></div><div class="hint">A busca usa o cache aquecido pelo servidor local. O modal não espera essa consulta para abrir.</div>`;
  }

  function participantChoice(id, title, description, current) {
    return `<button type="button" class="choice-card ${current === id ? 'is-selected' : ''}" data-action="participant-mode" data-mode="${id}"><span class="choice-icon"><i data-lucide="${id === 'all' ? 'users-round' : 'user-round-check'}"></i></span><span><strong>${title}</strong><p>${description}</p></span></button>`;
  }

  function representativesSelector(selected = []) {
    const reps = app.bootstrap.representantes || [];
    const selectedSet = new Set(selected);
    return `<div class="field full"><label>Representantes selecionados (${selected.length})</label><div class="search-field"><i data-lucide="search"></i><input id="wizardRepSearch" placeholder="Buscar representante"></div><div class="panel" id="wizardRepList" style="max-height:270px;overflow:auto;margin-top:8px">${reps.slice(0,100).map((rep) => `<label style="display:flex;align-items:center;gap:10px;padding:8px;border-bottom:1px solid var(--line);font-size:12px"><input type="checkbox" data-representative="${esc(rep.nome)}" ${selectedSet.has(rep.nome) ? 'checked' : ''}> <span><strong>${esc(rep.nome)}</strong><small style="display:block;color:var(--muted)">${number(rep.clientesAtivos)} clientes ativos</small></span></label>`).join('') || '<div class="hint">Os representantes ainda estão sendo carregados em segundo plano.</div>'}</div></div>`;
  }

  function calculatePeriods(startRaw, endRaw) {
    const start = startRaw ? new Date(`${startRaw}T12:00:00`) : null;
    const end = endRaw ? new Date(`${endRaw}T12:00:00`) : null;
    if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return { valid:false, error:'Informe um período válido.' };
    const days = Math.round((end - start) / 86400000);
    if (start.getDay() !== 1 || end.getDay() !== 1) return { valid:false, error:'Início e fechamento precisam ser segundas-feiras.' };
    if (days % 7 !== 0) return { valid:false, error:'O período precisa ter semanas comerciais completas.' };
    const previousStart = new Date(start); previousStart.setDate(previousStart.getDate() - days);
    const lastSale = new Date(end); lastSale.setDate(lastSale.getDate() - 1);
    const previousLast = new Date(start); previousLast.setDate(previousLast.getDate() - 1);
    return { valid:true, days, weeks:days/7, currentStart:toInputDate(start), currentEndExclusive:toInputDate(end), currentLast:toInputDate(lastSale), previousStart:toInputDate(previousStart), previousEndExclusive:toInputDate(start), previousLast:toInputDate(previousLast) };
  }

  function periodPreview(periods) {
    if (!periods.valid) return `<div class="error-box" style="grid-column:1/-1">${esc(periods.error)}</div>`;
    return `<div class="period-block"><span>Período anterior equivalente</span><strong>${dateBR(periods.previousStart)} a ${dateBR(periods.previousLast)}</strong></div><div class="period-arrow"><i data-lucide="arrow-right"></i></div><div class="period-block"><span>Campanha · ${periods.weeks} semana(s)</span><strong>${dateBR(periods.currentStart)} a ${dateBR(periods.currentLast)}</strong></div>`;
  }

  function renderSupplierResults(query) {
    const box = $('#supplierResults');
    if (!box) return;
    const term = norm(query);
    if (term.length < 2) { box.hidden = true; return; }
    const matches = (app.bootstrap.fornecedores || []).filter((item) => norm(`${item.nome} ${item.id || ''}`).includes(term)).slice(0, 12);
    box.innerHTML = matches.length ? matches.map((item) => `<button type="button" class="supplier-option" data-action="select-supplier" data-supplier-id="${esc(item.id)}"><span><strong>${esc(item.nome)}</strong><small>${number(item.totalProdutos)} produtos · ${number(item.produtosAtivos)} ativos</small></span><i data-lucide="arrow-right"></i></button>`).join('') : `<div class="hint" style="padding:13px">${app.bootstrapReady ? 'Nenhum fornecedor encontrado.' : 'Atualizando fornecedores em segundo plano…'}</div>`;
    box.hidden = false;
    icons(box);
  }

  function renderRulesStep() {
    const c = app.wizard.campaign;
    return `<div class="step-head"><div><h3>Regras e metas</h3><p>Ranking define a ordem. Metas e regras definem quem está elegível.</p></div></div>
      <div class="subsection"><div class="subsection-head"><h4>Como o ranking principal será definido?</h4><span class="hint">Selecione uma ou mais. A ordem do clique vira a prioridade.</span></div>
        <div class="choice-grid">${METRICS.map((metric) => metricChoice(metric, c.rankingMetrics)).join('')}</div>
      </div>
      <div class="subsection"><div class="subsection-head"><h4>Classificação e metas</h4></div>
        <div class="form-grid">
          <div class="field"><label>Modelo de classificação</label><select id="rankingMode"><option value="TOP_N_ELIGIBLE" ${c.rankingMode === 'TOP_N_ELIGIBLE' ? 'selected' : ''}>Top N entre os elegíveis</option><option value="ALL_ELIGIBLE" ${c.rankingMode === 'ALL_ELIGIBLE' ? 'selected' : ''}>Todos que atingirem</option></select></div>
          <div class="field"><label>Quantidade de classificados</label><input id="topN" type="number" min="1" value="${esc(c.topN || 5)}" ${c.rankingMode === 'ALL_ELIGIBLE' ? 'disabled' : ''}></div>
          <div class="field full"><label>Tipo de meta</label><div class="choice-grid">${['none','collective','individual','both'].map((mode) => metaModeCard(mode,c.metaMode)).join('')}</div></div>
          ${['collective','both'].includes(c.metaMode) ? metaFields('collective', c.collectiveMeta) : ''}
          ${['individual','both'].includes(c.metaMode) ? metaFields('individual', c.individualMeta) : ''}
        </div>
      </div>
      <div class="subsection"><div class="subsection-head"><h4>Critérios adicionais de elegibilidade</h4><button class="secondary-btn" type="button" data-action="add-rule"><i data-lucide="plus"></i>Regra personalizada</button></div>
        <div class="rule-template-bar">${RULE_TEMPLATES.map((rule,index) => `<button type="button" data-action="add-rule-template" data-template="${index}">+ ${esc(rule.label)}</button>`).join('')}</div>
        <div class="rule-list" id="ruleList" style="margin-top:12px">${c.rules.length ? c.rules.map(ruleRow).join('') : '<div class="info-box">Nenhuma regra adicional. Metas coletivas e individuais acima continuam válidas.</div>'}</div>
      </div>`;
  }

  function metricChoice(metric, selected) {
    const index = selected.indexOf(metric.id);
    return `<button type="button" class="choice-card ${index >= 0 ? 'is-selected' : ''}" data-action="toggle-ranking-metric" data-metric="${metric.id}"><span class="choice-icon"><i data-lucide="${metric.icon}"></i></span><span><strong>${metric.label}</strong><p>${metric.description}</p></span>${index >= 0 ? `<span class="choice-order">${index + 1}</span>` : ''}</button>`;
  }

  function metaModeCard(mode, current) {
    const labels = { none:['Sem meta','Somente ranking e regras'], collective:['Meta coletiva','Ex.: equipe alcançar 100 positivações'], individual:['Meta individual','Ex.: cada vendedor alcançar 4 positivações'], both:['Coletiva + individual','As duas condições precisam ser cumpridas'] };
    return `<button type="button" class="choice-card ${current === mode ? 'is-selected' : ''}" data-action="meta-mode" data-mode="${mode}"><span class="choice-icon"><i data-lucide="${mode === 'collective' ? 'users-round' : mode === 'individual' ? 'user-round-check' : mode === 'both' ? 'combine' : 'minus'}"></i></span><span><strong>${labels[mode][0]}</strong><p>${labels[mode][1]}</p></span></button>`;
  }

  function metaFields(type, meta) {
    const title = type === 'collective' ? 'Meta coletiva' : 'Meta individual por vendedor';
    return `<div class="field"><label>${title} · métrica</label><select id="${type}MetaMetric">${META_METRICS.map((item) => `<option value="${item.id}" ${meta.metric === item.id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></div><div class="field"><label>${title} · valor mínimo</label><input id="${type}MetaValue" type="number" step="0.01" min="0" value="${esc(meta.value ?? '')}"></div>`;
  }

  function ruleRow(rule) {
    return `<div class="rule-item" data-rule-id="${esc(rule.id)}">
      <div class="field"><label>Nome</label><input data-rule-field="name" value="${esc(rule.name)}"></div>
      <div class="field"><label>Métrica</label><select data-rule-field="metric">${META_METRICS.map((item) => `<option value="${item.id}" ${rule.metric === item.id ? 'selected' : ''}>${item.label}</option>`).join('')}</select></div>
      <div class="field"><label>Condição</label><select data-rule-field="operator">${['>=','>','==','<=','<'].map((op) => `<option ${rule.operator === op ? 'selected' : ''}>${op}</option>`).join('')}</select></div>
      <div class="field"><label>Valor</label><input type="number" step="0.01" data-rule-field="value" value="${esc(rule.value)}"></div>
      <button class="icon-btn" type="button" data-action="remove-rule" data-id="${esc(rule.id)}"><i data-lucide="trash-2"></i></button>
    </div>`;
  }

  function renderProductsStep() {
    const c = app.wizard.campaign;
    if (!c.supplier) return `<div class="step-head"><div><h3>Produtos e categorias</h3><p>Escolha o fornecedor na primeira etapa antes de montar o escopo.</p></div></div><div class="warning-box">Volte para Informações gerais e selecione um fornecedor.</div>`;
    return `<div class="step-head"><div><h3>Produtos e categorias</h3><p>Crie as categorias manualmente, arraste produtos e defina o mix mínimo.</p></div><button class="secondary-btn" type="button" data-action="reload-products"><i data-lucide="refresh-cw"></i>Atualizar catálogo</button></div>
      <div class="product-layout">
        <section class="catalog-panel">
          <div class="panel-head"><h4>Catálogo · ${esc(c.supplier.name)}</h4><p>Dados comerciais do SQL Server. Imagens entram depois, sem bloquear a lista.</p></div>
          <div class="product-filters"><input id="productSearch" placeholder="Buscar produto ou ID" value="${esc(app.wizard.productFilters.search)}"><select id="productGroup"><option value="">Todos os grupos</option>${filterOptions('group')}</select><select id="productSubgroup"><option value="">Todos os subgrupos</option>${filterOptions('subgroup')}</select></div>
          <div class="catalog-actions"><span id="catalogCount">${app.wizard.catalogTotal ? `${app.wizard.catalogTotal} produto(s)` : 'Carregando produtos…'}</span><div style="display:flex;gap:7px;align-items:center"><select id="targetCategorySelect" class="select-input" style="min-height:40px;width:190px"><option value="">Adicionar em…</option>${(c.categories || []).map((cat) => `<option value="${esc(cat.id)}" ${app.wizard.selectedCategoryId === cat.id ? 'selected' : ''}>${esc(cat.name)}</option>`).join('')}</select><button class="secondary-btn" type="button" data-action="add-selected-products">Selecionados</button><button class="secondary-btn" type="button" data-action="add-all-filtered">Todos filtrados</button></div></div>
          <div class="product-grid" id="productGrid">${productGridHtml()}</div>
        </section>
        <section class="categories-panel">
          <div class="panel-head"><h4>Categorias da campanha</h4><p>Ex.: Pescados, Azeites, Cafés e Massas. Cada categoria pode exigir ao menos 1 produto distinto.</p></div>
          <div class="category-toolbar"><input id="newCategoryName" placeholder="Nome da nova categoria"><button class="primary-btn" type="button" data-action="add-category"><i data-lucide="plus"></i>Adicionar</button></div>
          <div class="category-list" id="categoryList">${categoryListHtml()}</div>
        </section>
      </div>`;
  }

  function filterOptions(type) {
    const values = type === 'group' ? (app.wizard.productOptions?.groups || []) : (app.wizard.productOptions?.subgroups || []);
    const selected = type === 'group' ? app.wizard.productFilters.group : app.wizard.productFilters.subgroup;
    return values.map((value) => `<option value="${esc(value)}" ${selected === value ? 'selected' : ''}>${esc(value)}</option>`).join('');
  }

  function productGridHtml() {
    if (app.wizard.loadingProducts) return Array.from({length:8},() => '<div class="skeleton" style="height:74px"></div>').join('');
    if (!app.wizard.catalog.length) return '<div class="hint" style="grid-column:1/-1;padding:25px;text-align:center">Nenhum produto encontrado para os filtros.</div>';
    return app.wizard.catalog.map((product) => {
      const selected = app.wizard.selectedProducts.has(product.id);
      const image = app.imageCache.get(String(product.id))?.image || product.image || '';
      return `<label class="product-card ${selected ? 'is-selected' : ''}" draggable="true" data-product-id="${product.id}"><input class="product-check" type="checkbox" data-product-select="${product.id}" ${selected ? 'checked' : ''}><span class="product-image">${image ? `<img src="${esc(proxyImage(image))}" loading="lazy" alt="">` : '<i data-lucide="package"></i>'}</span><span class="product-info"><strong>${esc(product.name)}</strong><small>#${product.id} · ${esc(product.group || 'Sem grupo')}</small><small>${esc(product.subgroup || product.unit || '')}</small></span></label>`;
    }).join('');
  }

  function categoryListHtml() {
    const categories = app.wizard.campaign.categories || [];
    if (!categories.length) return '<div class="empty-state" style="padding:30px 15px"><h3>Crie a primeira categoria</h3><p>Depois arraste produtos ou use “Adicionar todos os filtrados”.</p></div>';
    return categories.map((cat) => `<article class="category-card" data-category-id="${esc(cat.id)}">
      <div class="category-head"><i data-lucide="grip-vertical"></i><input type="text" data-category-field="name" value="${esc(cat.name)}"><button class="icon-btn" type="button" data-action="remove-category" data-id="${esc(cat.id)}"><i data-lucide="trash-2"></i></button></div>
      <div class="category-options">
        <label>Mix obrigatório<select data-category-field="requiredMix"><option value="true" ${cat.requiredMix !== false ? 'selected' : ''}>Sim</option><option value="false" ${cat.requiredMix === false ? 'selected' : ''}>Não</option></select></label>
        <label>Mín. produtos distintos<input type="number" min="1" data-category-field="minDistinct" value="${esc(cat.minDistinct || 1)}"></label>
        <label>Pontuação<select data-category-field="pointUnit"><option value="none" ${cat.pointUnit === 'none' ? 'selected' : ''}>Sem pontos</option><option value="pieces" ${cat.pointUnit === 'pieces' ? 'selected' : ''}>Por peça</option><option value="kg" ${cat.pointUnit === 'kg' ? 'selected' : ''}>Por KG</option><option value="revenue" ${cat.pointUnit === 'revenue' ? 'selected' : ''}>Por R$</option><option value="item" ${cat.pointUnit === 'item' ? 'selected' : ''}>Por produto distinto</option></select></label>
        <label>Pontos por unidade<input type="number" min="0" step="0.01" data-category-field="pointValue" value="${esc(cat.pointValue || 0)}"></label>
      </div>
      <div class="category-products" data-category-drop="${esc(cat.id)}">${(cat.products || []).length ? cat.products.map((product) => productChip(product,cat.id)).join('') : '<div class="drop-hint">Arraste produtos para cá</div>'}</div>
    </article>`).join('');
  }

  function productChip(product, categoryId) {
    const image = app.imageCache.get(String(product.id))?.image || product.image || '';
    return `<div class="product-chip"><span class="product-image" style="width:27px;height:27px">${image ? `<img src="${esc(proxyImage(image))}" loading="lazy" alt="">` : ''}</span><span title="${esc(product.name)}">${esc(product.name)}</span><button type="button" data-action="remove-product-category" data-category-id="${esc(categoryId)}" data-product-id="${product.id}">×</button></div>`;
  }

  function proxyImage(url) { const clean = String(url || '').trim(); return !clean || clean.startsWith('/img-proxy') ? clean : `/img-proxy?url=${encodeURIComponent(clean)}`; }

  async function loadProducts({ force = false } = {}) {
    if (!app.wizard?.campaign.supplier || app.wizard.loadingProducts) return;
    app.wizard.loadingProducts = true;
    if (app.wizard.step === 2) { $('#productGrid').innerHTML = productGridHtml(); }
    const supplier = app.wizard.campaign.supplier;
    const params = new URLSearchParams({ recurso:'produtos', fornecedorId:String(supplier.id || ''), fornecedor:supplier.name, limite:'80', pagina:'1' });
    if (app.wizard.productFilters.search) params.set('busca', app.wizard.productFilters.search);
    if (app.wizard.productFilters.group) params.set('grupo', app.wizard.productFilters.group);
    if (app.wizard.productFilters.subgroup) params.set('subgrupo', app.wizard.productFilters.subgroup);
    try {
      const data = await api(`${SQL_ENDPOINT}?${params}`, { force, ttl:120000 });
      app.wizard.catalog = (data.items || []).map(normalizeProduct);
      app.wizard.catalogTotal = data.total || app.wizard.catalog.length;
      app.wizard.productOptions = {
        groups: data.filtros?.grupos || app.wizard.productOptions?.groups || [],
        subgroups: data.filtros?.subgrupos || app.wizard.productOptions?.subgroups || [],
        status: data.filtros?.status || app.wizard.productOptions?.status || [],
      };
      app.wizard.productsLoaded = true;
      app.wizard.loadingProducts = false;
      if (app.wizard.step === 2) renderWizardStep();
      void enrichImages(app.wizard.catalog.map((item) => item.id));
    } catch (error) {
      app.wizard.loadingProducts = false;
      if (app.wizard.step === 2) $('#productGrid').innerHTML = `<div class="error-box" style="grid-column:1/-1">${esc(error.message)}<br><button class="secondary-btn" style="margin-top:8px" data-action="reload-products">Tentar novamente</button></div>`;
    }
  }

  function normalizeProduct(item) { return { id:Number(item.id ?? item.codigo), name:item.nome || item.name || `Produto ${item.id}`, unit:item.unidade || '', group:item.grupo || '', subgroup:item.subgrupo || '', status:item.status || '', image:item.imagem || '' }; }

  async function enrichImages(ids) {
    const missing = [...new Set(ids.map(String))].filter((id) => !app.imageCache.has(id)).slice(0,100);
    if (!missing.length) return;
    try {
      const data = await api(`/api/produtos-supabase?ids=${encodeURIComponent(missing.join(','))}&limite=${missing.length}`, { ttl:300000 });
      for (const item of data || []) app.imageCache.set(String(item.id), { image:item.imagem || '', description:item.descricao || '' });
      if (app.wizard?.step === 2) {
        $('#productGrid').innerHTML = productGridHtml();
        $('#categoryList').innerHTML = categoryListHtml();
        icons($('#wizardStep'));
      }
    } catch (_) { /* imagens são decorativas e nunca bloqueiam o fluxo */ }
  }

  function renderTieStep() {
    const c = app.wizard.campaign;
    return `<div class="step-head"><div><h3>Desempate e premiação</h3><p>Defina a sequência usada depois das métricas principais e quantas posições serão premiadas.</p></div></div>
      <div class="subsection"><div class="subsection-head"><h4>Ordem de desempate</h4><button class="secondary-btn" type="button" data-action="add-tie"><i data-lucide="plus"></i>Adicionar critério</button></div><div class="tie-list">${c.tieBreaks.map(tieRow).join('')}</div></div>
      <div class="subsection"><div class="subsection-head"><h4>Premiação</h4><button class="secondary-btn" type="button" data-action="add-prize"><i data-lucide="plus"></i>Adicionar posição</button></div><div class="prize-grid">${c.prizes.length ? c.prizes.map(prizeCard).join('') : '<div class="info-box" style="grid-column:1/-1">A premiação é opcional. O ranking funciona mesmo sem valores cadastrados.</div>'}</div></div>
      <div class="subsection"><div class="info-box"><strong>Resumo:</strong> ${c.rankingMetrics.map((id) => METRICS.find((m) => m.id === id)?.label).filter(Boolean).join(' → ') || 'nenhuma métrica'} · ${c.rankingMode === 'ALL_ELIGIBLE' ? 'todos os elegíveis' : `Top ${c.topN}`} · meta ${c.metaMode === 'none' ? 'não configurada' : c.metaMode}.</div></div>`;
  }

  function tieRow(item, index) {
    return `<div class="tie-item" data-tie-index="${index}"><span class="tie-number">${index + 1}</span><select data-tie-field="metric">${TIE_OPTIONS.map(([id,label]) => `<option value="${id}" ${item.metric === id ? 'selected' : ''}>${label}</option>`).join('')}</select><select data-tie-field="direction"><option value="desc" ${item.direction !== 'asc' ? 'selected' : ''}>Maior primeiro</option><option value="asc" ${item.direction === 'asc' ? 'selected' : ''}>Menor primeiro</option></select><button class="icon-btn" type="button" data-action="move-tie-up" data-index="${index}"><i data-lucide="arrow-up"></i></button><button class="icon-btn" type="button" data-action="remove-tie" data-index="${index}"><i data-lucide="trash-2"></i></button></div>`;
  }

  function prizeCard(prize, index) {
    return `<div class="panel" data-prize-index="${index}"><div class="field"><label>Posição</label><input type="number" min="1" data-prize-field="position" value="${prize.position || index + 1}"></div><div class="field" style="margin-top:8px"><label>Prêmio</label><input data-prize-field="description" value="${esc(prize.description || '')}" placeholder="Ex.: R$ 1.000"></div><button class="danger-btn" type="button" data-action="remove-prize" data-index="${index}" style="margin-top:10px">Remover</button></div>`;
  }

  function syncCurrentStep() {
    const w = app.wizard; if (!w) return;
    const c = w.campaign;
    if (w.step === 0) {
      c.name = $('#campaignName')?.value.trim() || c.name;
      c.description = $('#campaignDescription')?.value.trim() || '';
      c.start = $('#campaignStart')?.value || c.start;
      c.end = $('#campaignEnd')?.value || c.end;
      if (c.participantMode === 'specific') c.representatives = $$('[data-representative]:checked').map((item) => item.dataset.representative);
    }
    if (w.step === 1) {
      c.rankingMode = $('#rankingMode')?.value || c.rankingMode;
      c.topN = Number($('#topN')?.value) || 5;
      if (['collective','both'].includes(c.metaMode)) c.collectiveMeta = { metric:$('#collectiveMetaMetric')?.value || 'positivity', value:Number($('#collectiveMetaValue')?.value) || 0 };
      if (['individual','both'].includes(c.metaMode)) c.individualMeta = { metric:$('#individualMetaMetric')?.value || 'positivity', value:Number($('#individualMetaValue')?.value) || 0 };
      $$('.rule-item').forEach((node) => {
        const rule = c.rules.find((item) => item.id === node.dataset.ruleId); if (!rule) return;
        $$('[data-rule-field]',node).forEach((field) => rule[field.dataset.ruleField] = field.dataset.ruleField === 'value' ? Number(field.value) : field.value);
      });
    }
    if (w.step === 2) syncCategoriesFromDom();
    if (w.step === 3) {
      $$('.tie-item').forEach((node,index) => { const item = c.tieBreaks[index]; if (!item) return; item.metric=$('[data-tie-field="metric"]',node).value; item.direction=$('[data-tie-field="direction"]',node).value; });
      $$('[data-prize-index]').forEach((node) => { const item=c.prizes[Number(node.dataset.prizeIndex)]; if (!item) return; item.position=Number($('[data-prize-field="position"]',node).value)||1; item.description=$('[data-prize-field="description"]',node).value.trim(); });
    }
  }

  function syncCategoriesFromDom() {
    const c = app.wizard.campaign;
    $$('.category-card').forEach((node) => {
      const cat = c.categories.find((item) => item.id === node.dataset.categoryId); if (!cat) return;
      $$('[data-category-field]',node).forEach((field) => {
        const key=field.dataset.categoryField;
        if (key === 'requiredMix') cat[key] = field.value === 'true';
        else if (['minDistinct','pointValue'].includes(key)) cat[key] = Number(field.value) || (key === 'minDistinct' ? 1 : 0);
        else cat[key] = field.value;
      });
    });
  }

  function validateStep(index = app.wizard.step) {
    syncCurrentStep();
    const c = app.wizard.campaign;
    if (index === 0) {
      if (!c.name.trim()) return 'Informe o nome da campanha.';
      if (!c.supplier) return 'Selecione o fornecedor.';
      const periods = calculatePeriods(c.start,c.end); if (!periods.valid) return periods.error;
      if (c.participantMode === 'specific' && !c.representatives.length) return 'Selecione ao menos um representante.';
    }
    if (index === 1 && !c.rankingMetrics.length) return 'Selecione ao menos uma métrica de ranking.';
    return '';
  }

  async function saveCampaign() {
    for (let i=0;i<STEPS.length;i++) { const error=validateStep(i); if(error){ app.wizard.step=i; renderWizardStep(); toast(error,'error'); return; } }
    syncCurrentStep();
    const campaign = { ...app.wizard.campaign, updatedAt:new Date().toISOString() };
    await DB.put('campanhas', campaign);
    await loadCampaigns();
    closeWizard();
    app.view='campaigns'; renderView();
    toast('Campanha salva com sucesso.');
  }

  function metricValue(item, metric) { return Number(item[metric] || 0); }
  function compareOp(value, operator, target) { if(operator==='>=') return value>=target; if(operator==='>')return value>target;if(operator==='<=')return value<=target;if(operator==='<')return value<target;return value===target; }
  function growth(current, previous) { if (!previous) return current > 0 ? 100 : 0; return ((current - previous) / Math.abs(previous)) * 100; }

  async function openPerformance(id) {
    const raw = await DB.get('campanhas', id); if (!raw) return;
    const campaign = await legacyData(normalizeCampaign(raw));
    $('#drawerBackdrop').hidden = false; document.body.style.overflow='hidden'; $('#performanceTitle').textContent = campaign.name;
    const body = $('#performanceBody');
    let seconds=0; body.innerHTML = loadingPerformance(seconds);
    const timer=setInterval(()=>{seconds++; const el=$('#performanceSeconds'); if(el)el.textContent=`${seconds}s`;},1000);
    const periods=calculatePeriods(campaign.start,campaign.end);
    if(!periods.valid){clearInterval(timer);body.innerHTML=`<div class="error-box">${esc(periods.error)}</div>`;return;}
    const productIds=[...new Set((campaign.categories||[]).flatMap((cat)=>(cat.products||[]).map((product)=>Number(product.id))).filter(Number.isFinite))];
    try {
      const data=await api(`${SQL_ENDPOINT}?recurso=apuracao`,{method:'POST',body:JSON.stringify({campanhaInicio:periods.currentStart,campanhaFim:periods.currentEndExclusive,anteriorInicio:periods.previousStart,anteriorFim:periods.previousEndExclusive,fornecedorId:campaign.supplier?.id,fornecedor:campaign.supplier?.name,produtos:productIds,vendedores:campaign.participantMode==='specific'?campaign.representatives:[]})});
      clearInterval(timer);
      const result=calculatePerformance(campaign,data,periods);
      await DB.put('apuracoes',{id:`apur_${campaign.id}`,campaignId:campaign.id,generatedAt:new Date().toISOString(),...result});
      body.innerHTML=performanceHtml(campaign,result,data);
      icons(body);
    } catch(error){clearInterval(timer);body.innerHTML=`<div class="error-box"><strong>Não foi possível consultar o SQL Server.</strong><br>${esc(error.message)}${error.hint?`<br>${esc(error.hint)}`:''}<br><button class="secondary-btn" data-action="retry-performance" data-id="${esc(id)}" style="margin-top:10px">Tentar novamente</button></div>`;}
  }

  function loadingPerformance(seconds){return `<div class="loading-stage"><div><div class="spinner"></div><h3>Consultando vendas reais</h3><p>O SQL trabalha em segundo plano e a interface continua responsiva. <span id="performanceSeconds">${seconds}s</span></p><p>Primeira consulta após iniciar o servidor pode levar mais tempo; as próximas usam a conexão aquecida.</p></div></div>`;}

  function calculatePerformance(campaign,data,periods){
    const sellers=new Map();
    const orderSummary=new Map((data.pedidosPorVendedor||[]).map((item)=>[`${item.periodo}|${item.vendedor}`,Number(item.pedidos)||0]));
    for(const row of data.linhas||[]){
      if(!sellers.has(row.vendedor)) sellers.set(row.vendedor,{name:row.vendedor,current:periodBucket(),previous:periodBucket()});
      const seller=sellers.get(row.vendedor); const bucket=row.periodo==='campanha'?seller.current:seller.previous;
      bucket.revenue+=Number(row.valor)||0;bucket.kg+=Number(row.kg)||0;bucket.pieces+=Number(row.pecas)||0;bucket.customers.add(String(row.clienteId));bucket.products.add(Number(row.produtoId));bucket.rows.push(row);
    }
    const results=[...sellers.values()].map((seller)=>{
      seller.current.orders=orderSummary.get(`campanha|${seller.name}`)||seller.current.orders;
      seller.previous.orders=orderSummary.get(`anterior|${seller.name}`)||seller.previous.orders;
      const mix=calculateMix(campaign.categories,seller.current.rows);
      const points=calculatePoints(campaign.categories,seller.current.rows);
      const item={name:seller.name,revenue:seller.current.revenue,previousRevenue:seller.previous.revenue,revenueGrowth:growth(seller.current.revenue,seller.previous.revenue),kg:seller.current.kg,previousKg:seller.previous.kg,kgGrowth:growth(seller.current.kg,seller.previous.kg),pieces:seller.current.pieces,customers:seller.current.customers.size,previousCustomers:seller.previous.customers.size,positivity:seller.current.customers.size-seller.previous.customers.size,orders:seller.current.orders,previousOrders:seller.previous.orders,products:seller.current.products.size,mix:mix.percent,mixDone:mix.done,mixTotal:mix.total,mixMissing:mix.missing,points,eligible:true,reasons:[]};
      for(const rule of campaign.rules||[]){const value=metricValue(item,rule.metric);if(!compareOp(value,rule.operator,Number(rule.value)||0)){item.eligible=false;item.reasons.push(`${rule.name}: ${number(value,1)} ${rule.operator} ${number(rule.value,1)}`);}}
      if(['individual','both'].includes(campaign.metaMode)){const target=Number(campaign.individualMeta?.value)||0;const value=metricValue(item,campaign.individualMeta?.metric);item.individualMetaHit=value>=target;if(!item.individualMetaHit){item.eligible=false;item.reasons.push(`Meta individual: ${number(value,1)} de ${number(target,1)}`);}}
      return item;
    });
    const collectiveMetric=campaign.collectiveMeta?.metric||'positivity'; const collectiveValue=results.reduce((sum,item)=>sum+metricValue(item,collectiveMetric),0); const collectiveTarget=Number(campaign.collectiveMeta?.value)||0; const collectiveConfigured=['collective','both'].includes(campaign.metaMode); const collectiveHit=!collectiveConfigured||collectiveValue>=collectiveTarget;
    const ordered=[...results].sort((a,b)=>compareRank(a,b,campaign));
    const eligible=ordered.filter((item)=>item.eligible);
    let classified=campaign.rankingMode==='ALL_ELIGIBLE'?eligible:eligible.slice(0,Number(campaign.topN)||5); if(!collectiveHit)classified=[];
    const classSet=new Set(classified.map((item)=>item.name)); ordered.forEach((item,index)=>{item.position=index+1;item.classified=classSet.has(item.name);});
    return {periods,results:ordered,collective:{configured:collectiveConfigured,metric:collectiveMetric,value:collectiveValue,target:collectiveTarget,hit:collectiveHit},summary:{revenue:results.reduce((s,i)=>s+i.revenue,0),previousRevenue:results.reduce((s,i)=>s+i.previousRevenue,0),kg:results.reduce((s,i)=>s+i.kg,0),previousKg:results.reduce((s,i)=>s+i.previousKg,0),positivity:results.reduce((s,i)=>s+i.positivity,0),classified:classified.length,eligible:eligible.length}};
  }

  function periodBucket(){return{revenue:0,kg:0,pieces:0,customers:new Set(),products:new Set(),orders:0,rows:[]};}
  function calculateMix(categories,rows){const required=(categories||[]).filter((cat)=>cat.requiredMix!==false);if(!required.length)return{percent:100,done:0,total:0,missing:[]};const sold=new Set(rows.map((r)=>Number(r.produtoId)));const missing=[];let done=0;for(const cat of required){const count=(cat.products||[]).filter((p)=>sold.has(Number(p.id))).length;if(count>=(Number(cat.minDistinct)||1))done++;else missing.push(cat.name);}return{percent:(done/required.length)*100,done,total:required.length,missing};}
  function calculatePoints(categories,rows){let total=0;for(const cat of categories||[]){const ids=new Set((cat.products||[]).map((p)=>Number(p.id)));const relevant=rows.filter((r)=>ids.has(Number(r.produtoId)));const value=Number(cat.pointValue)||0;if(cat.pointUnit==='pieces')total+=relevant.reduce((s,r)=>s+(Number(r.pecas)||0),0)*value;if(cat.pointUnit==='kg')total+=relevant.reduce((s,r)=>s+(Number(r.kg)||0),0)*value;if(cat.pointUnit==='revenue')total+=relevant.reduce((s,r)=>s+(Number(r.valor)||0),0)*value;if(cat.pointUnit==='item')total+=new Set(relevant.map((r)=>r.produtoId)).size*value;}return total;}
  function compareRank(a,b,campaign){for(const metric of campaign.rankingMetrics||[]){const diff=metricValue(b,metric)-metricValue(a,metric);if(Math.abs(diff)>1e-9)return diff;}for(const tie of campaign.tieBreaks||[]){const diff=metricValue(b,tie.metric)-metricValue(a,tie.metric);if(Math.abs(diff)>1e-9)return tie.direction==='asc'?-diff:diff;}return a.name.localeCompare(b.name,'pt-BR');}

  function performanceHtml(campaign,result,data){const s=result.summary;const c=result.collective;return `<div class="performance-kpis">${metaCard('Faturamento',money(s.revenue),`${pct(growth(s.revenue,s.previousRevenue))} vs anterior`)}${metaCard('Volume',`${number(s.kg,1)} KG`,`${pct(growth(s.kg,s.previousKg))} vs anterior`)}${metaCard('Positivação',`${s.positivity>=0?'+':''}${number(s.positivity)}`,'clientes atuais − anteriores')}${metaCard('Elegíveis',number(s.eligible),`${s.classified} classificado(s)`)}${collectiveCard(c)}</div>
    <section class="section"><div class="section-head"><h3>Ranking e comparativo por vendedor</h3><span>${esc(data.fonte||'SQL Server')} · ${number(data.duracaoMs||0)} ms</span></div><div class="table-wrap"><table><thead><tr><th>#</th><th>Representante</th><th>R$ campanha</th><th>R$ anterior</th><th>Δ R$</th><th>KG campanha</th><th>KG anterior</th><th>Δ KG</th><th>Clientes</th><th>Anterior</th><th>Positivação</th><th>Mix</th><th>Pontos</th><th>Situação</th></tr></thead><tbody>${result.results.map((item)=>performanceRow(item,c.hit)).join('')||'<tr><td colspan="14">Nenhuma venda encontrada no período.</td></tr>'}</tbody></table></div></section>
    <section class="section"><div class="info-box"><strong>Períodos usados:</strong> campanha ${dateBR(result.periods.currentStart)} a ${dateBR(result.periods.currentLast)} · anterior ${dateBR(result.periods.previousStart)} a ${dateBR(result.periods.previousLast)} · data de referência: ${esc(data.dataReferencia||'dbo.Vendas.[Data]')}.</div></section>`;}
  function metaCard(label,value,detail){return `<div class="meta-card"><span>${label}</span><strong>${value}</strong><small>${detail}</small></div>`;}
  function collectiveCard(meta){if(!meta.configured)return `<div class="meta-card"><span>Meta coletiva</span><strong>Não configurada</strong><small>Ranking não depende de meta coletiva</small></div>`;return `<div class="meta-card ${meta.hit?'is-success':'is-danger'}"><span>Meta coletiva</span><strong>${meta.hit?'BATIDA':'NÃO BATIDA'}</strong><small>${number(meta.value,1)} de ${number(meta.target,1)} · ${metricLabel(meta.metric)}</small></div>`;}
  function metricLabel(id){return META_METRICS.find((item)=>item.id===id)?.label||id;}
  function performanceRow(item,collectiveHit){const status=!item.eligible?'Inelegível':!collectiveHit?'Aguardando meta coletiva':item.classified?'Classificado':'Elegível';const statusClass=item.classified&&collectiveHit?'success':!item.eligible?'danger':'';return `<tr><td><span class="rank-badge">${item.position}</span></td><td><strong>${esc(item.name)}</strong>${item.reasons.length?`<small style="display:block;color:var(--danger);margin-top:3px" title="${esc(item.reasons.join(' · '))}">${esc(item.reasons[0])}</small>`:''}</td><td>${money(item.revenue)}</td><td>${money(item.previousRevenue)}</td><td><span class="delta ${item.revenueGrowth>=0?'positive':'negative'}">${pct(item.revenueGrowth)}</span></td><td>${number(item.kg,1)}</td><td>${number(item.previousKg,1)}</td><td><span class="delta ${item.kgGrowth>=0?'positive':'negative'}">${pct(item.kgGrowth)}</span></td><td>${number(item.customers)}</td><td>${number(item.previousCustomers)}</td><td><strong class="${item.positivity>=0?'delta positive':'delta negative'}">${item.positivity>=0?'+':''}${number(item.positivity)}</strong></td><td>${number(item.mix,0)}% <small>(${item.mixDone}/${item.mixTotal||0})</small></td><td>${number(item.points,1)}</td><td><span class="status-text ${statusClass}">${status}</span></td></tr>`;}

  function closePerformance(){ $('#drawerBackdrop').hidden=true;document.body.style.overflow='';app.performance=null; }

  function updateGeneralPreview(){if(!app.wizard)return;syncCurrentStep();const preview=$('#periodPreview');if(preview){preview.innerHTML=periodPreview(calculatePeriods(app.wizard.campaign.start,app.wizard.campaign.end));icons(preview);}}

  let supplierTimer; let productTimer;
  document.addEventListener('input',(event)=>{
    if(event.target.id==='campaignSearch'){app.campaignSearch=event.target.value;renderCampaigns();$('#campaignSearch')?.focus();}
    if(event.target.id==='representativeSearch'){app.representativeSearch=event.target.value;renderRepresentatives();$('#representativeSearch')?.focus();}
    if(event.target.id==='supplierSearch'){clearTimeout(supplierTimer);supplierTimer=setTimeout(()=>renderSupplierResults(event.target.value),110);}
    if(['campaignName','campaignDescription','campaignStart','campaignEnd'].includes(event.target.id)){if(event.target.id==='campaignStart'||event.target.id==='campaignEnd')updateGeneralPreview();}
    if(event.target.id==='wizardRepSearch'){const term=norm(event.target.value);$$('#wizardRepList label').forEach((label)=>label.hidden=!norm(label.textContent).includes(term));}
    if(event.target.id==='productSearch'){clearTimeout(productTimer);app.wizard.productFilters.search=event.target.value;productTimer=setTimeout(()=>loadProducts({force:true}),300);}
  });

  document.addEventListener('change',(event)=>{
    if(event.target.matches('[data-representative]')){const selected=new Set(app.wizard.campaign.representatives);event.target.checked?selected.add(event.target.dataset.representative):selected.delete(event.target.dataset.representative);app.wizard.campaign.representatives=[...selected];}
    if(event.target.id==='rankingMode'){app.wizard.campaign.rankingMode=event.target.value;renderWizardStep();}
    if(event.target.id==='productGroup'){app.wizard.productFilters.group=event.target.value;app.wizard.productFilters.subgroup='';void loadProducts({force:true});}
    if(event.target.id==='productSubgroup'){app.wizard.productFilters.subgroup=event.target.value;void loadProducts({force:true});}
    if(event.target.id==='targetCategorySelect'){app.wizard.selectedCategoryId=event.target.value||null;}
    if(event.target.matches('[data-product-select]')){const id=Number(event.target.dataset.productSelect);event.target.checked?app.wizard.selectedProducts.add(id):app.wizard.selectedProducts.delete(id);event.target.closest('.product-card')?.classList.toggle('is-selected',event.target.checked);}
    if(event.target.matches('[data-category-field]'))syncCategoriesFromDom();
  });

  document.addEventListener('click',async(event)=>{
    const actionNode=event.target.closest('[data-action],[data-view]');if(!actionNode)return;
    const action=actionNode.dataset.action;const view=actionNode.dataset.view;
    if(view){app.view=view;renderView();return;}
    if(action==='new-campaign')return openWizard();
    if(action==='edit-campaign')return openWizard(actionNode.dataset.id);
    if(action==='close-modal')return closeWizard();
    if(action==='open-sidebar'){$('#sidebar').classList.add('is-open');$('.sidebar-backdrop').classList.add('is-open');return;}
    if(action==='close-sidebar'){$('#sidebar').classList.remove('is-open');$('.sidebar-backdrop').classList.remove('is-open');return;}
    if(action==='theme'){const next=document.documentElement.dataset.theme==='dark'?'light':'dark';document.documentElement.dataset.theme=next;localStorage.setItem(THEME_KEY,next);return;}
    if(action==='refresh'||action==='refresh-bootstrap'){setProgress(true);app.apiCache.clear();try{await api(`${SQL_ENDPOINT}?recurso=refresh`,{method:'POST',force:true});await loadBootstrap({force:true,silent:false});toast('Dados do SQL atualizados.');}catch(error){toast(error.message,'error');}finally{setProgress(false);renderView();}return;}
    if(action==='settings'){const value=prompt('Endereço da API local',SQL_BASE);if(value){localStorage.setItem(SQL_BASE_KEY,value.replace(/\/$/,''));alert('Endereço salvo. Recarregue a página.');}return;}
    if(action==='wizard-step'){syncCurrentStep();const target=Number(actionNode.dataset.step);if(target>app.wizard.step){const error=validateStep(app.wizard.step);if(error)return toast(error,'error');}app.wizard.step=target;renderWizardStep();return;}
    if(action==='previous-step'){syncCurrentStep();app.wizard.step=Math.max(0,app.wizard.step-1);renderWizardStep();return;}
    if(action==='next-step'){const error=validateStep();if(error)return toast(error,'error');syncCurrentStep();app.wizard.step=Math.min(STEPS.length-1,app.wizard.step+1);renderWizardStep();return;}
    if(action==='save-campaign')return saveCampaign();
    if(action==='clear-supplier'){app.wizard.campaign.supplier=null;app.wizard.catalog=[];app.wizard.productsLoaded=false;renderWizardStep();return;}
    if(action==='select-supplier'){const supplier=app.bootstrap.fornecedores.find((item)=>String(item.id)===String(actionNode.dataset.supplierId));if(supplier){app.wizard.campaign.supplier={id:supplier.id,name:supplier.nome,totalProducts:supplier.totalProdutos};app.wizard.catalog=[];app.wizard.productsLoaded=false;app.wizard.campaign.categories=[];renderWizardStep();}return;}
    if(action==='participant-mode'){app.wizard.campaign.participantMode=actionNode.dataset.mode;renderWizardStep();if(actionNode.dataset.mode==='specific'&&!app.bootstrapReady)void loadBootstrap({silent:false});return;}
    if(action==='toggle-ranking-metric'){const id=actionNode.dataset.metric;const list=app.wizard.campaign.rankingMetrics;const index=list.indexOf(id);if(index>=0)list.splice(index,1);else list.push(id);renderWizardStep();return;}
    if(action==='meta-mode'){app.wizard.campaign.metaMode=actionNode.dataset.mode;renderWizardStep();return;}
    if(action==='add-rule-template'){const template=RULE_TEMPLATES[Number(actionNode.dataset.template)];app.wizard.campaign.rules.push({id:uid('rule'),name:template.label,metric:template.metric,operator:template.operator,value:template.value,required:true});renderWizardStep();return;}
    if(action==='add-rule'){app.wizard.campaign.rules.push({id:uid('rule'),name:'Nova regra',metric:'revenue',operator:'>=',value:0,required:true});renderWizardStep();return;}
    if(action==='remove-rule'){app.wizard.campaign.rules=app.wizard.campaign.rules.filter((item)=>item.id!==actionNode.dataset.id);renderWizardStep();return;}
    if(action==='reload-products'){app.wizard.productsLoaded=false;return loadProducts({force:true});}
    if(action==='add-category'){const input=$('#newCategoryName');const name=input?.value.trim();if(!name)return toast('Informe o nome da categoria.','warning');const cat={id:uid('cat'),name,requiredMix:true,minDistinct:1,pointUnit:'none',pointValue:0,products:[]};app.wizard.campaign.categories.push(cat);app.wizard.selectedCategoryId=cat.id;renderWizardStep();return;}
    if(action==='remove-category'){app.wizard.campaign.categories=app.wizard.campaign.categories.filter((item)=>item.id!==actionNode.dataset.id);renderWizardStep();return;}
    if(action==='remove-product-category'){const cat=app.wizard.campaign.categories.find((item)=>item.id===actionNode.dataset.categoryId);if(cat)cat.products=cat.products.filter((item)=>Number(item.id)!==Number(actionNode.dataset.productId));renderWizardStep();return;}
    if(action==='add-selected-products'){return addSelectedProducts();}
    if(action==='add-all-filtered'){return addAllFiltered();}
    if(action==='add-tie'){app.wizard.campaign.tieBreaks.push({metric:'revenue',direction:'desc'});renderWizardStep();return;}
    if(action==='remove-tie'){app.wizard.campaign.tieBreaks.splice(Number(actionNode.dataset.index),1);renderWizardStep();return;}
    if(action==='move-tie-up'){const index=Number(actionNode.dataset.index);if(index>0){const list=app.wizard.campaign.tieBreaks;[list[index-1],list[index]]=[list[index],list[index-1]];}renderWizardStep();return;}
    if(action==='add-prize'){app.wizard.campaign.prizes.push({position:app.wizard.campaign.prizes.length+1,description:''});renderWizardStep();return;}
    if(action==='remove-prize'){app.wizard.campaign.prizes.splice(Number(actionNode.dataset.index),1);renderWizardStep();return;}
    if(action==='performance')return openPerformance(actionNode.dataset.id);
    if(action==='close-performance')return closePerformance();
    if(action==='retry-performance'){closePerformance();return openPerformance(actionNode.dataset.id);}
  });

  document.addEventListener('dragstart',(event)=>{const card=event.target.closest('[data-product-id]');if(!card)return;event.dataTransfer.setData('text/product-id',card.dataset.productId);event.dataTransfer.effectAllowed='copy';});
  document.addEventListener('dragover',(event)=>{const drop=event.target.closest('[data-category-drop]');if(!drop)return;event.preventDefault();drop.closest('.category-card')?.classList.add('is-dragover');});
  document.addEventListener('dragleave',(event)=>{event.target.closest('.category-card')?.classList.remove('is-dragover');});
  document.addEventListener('drop',(event)=>{const drop=event.target.closest('[data-category-drop]');if(!drop)return;event.preventDefault();drop.closest('.category-card')?.classList.remove('is-dragover');const id=Number(event.dataTransfer.getData('text/product-id'));const product=app.wizard.catalog.find((item)=>item.id===id);if(product)addProductsToCategory([product],drop.dataset.categoryDrop);});

  function targetCategory(){let id=$('#targetCategorySelect')?.value||app.wizard.selectedCategoryId;app.wizard.selectedCategoryId=id||null;let category=app.wizard.campaign.categories.find((item)=>item.id===id);if(!category&&app.wizard.campaign.categories.length===1)category=app.wizard.campaign.categories[0];if(!category){toast('Crie ou selecione uma categoria antes de adicionar produtos.','warning');return null;}return category;}
  function addProductsToCategory(products,categoryId){const category=app.wizard.campaign.categories.find((item)=>item.id===categoryId);if(!category)return;const map=new Map((category.products||[]).map((item)=>[Number(item.id),item]));for(const product of products)map.set(Number(product.id),{...product,image:app.imageCache.get(String(product.id))?.image||product.image||''});category.products=[...map.values()];app.wizard.selectedProducts.clear();renderWizardStep();}
  function addSelectedProducts(){const category=targetCategory();if(!category)return;const products=app.wizard.catalog.filter((item)=>app.wizard.selectedProducts.has(item.id));if(!products.length)return toast('Selecione ao menos um produto.','warning');addProductsToCategory(products,category.id);}
  async function addAllFiltered(){const category=targetCategory();if(!category)return;const supplier=app.wizard.campaign.supplier;const params=new URLSearchParams({recurso:'produtos',fornecedorId:String(supplier.id||''),fornecedor:supplier.name,todos:'true'});if(app.wizard.productFilters.search)params.set('busca',app.wizard.productFilters.search);if(app.wizard.productFilters.group)params.set('grupo',app.wizard.productFilters.group);if(app.wizard.productFilters.subgroup)params.set('subgrupo',app.wizard.productFilters.subgroup);toast('Buscando todos os produtos filtrados…');try{const data=await api(`${SQL_ENDPOINT}?${params}`,{force:true});addProductsToCategory((data.items||[]).map(normalizeProduct),category.id);toast(`${data.items?.length||0} produto(s) adicionados.`);}catch(error){toast(error.message,'error');}}

  async function init(){
    document.documentElement.dataset.theme=localStorage.getItem(THEME_KEY)||'light';
    await DB.init();await loadCampaigns();renderView();icons();
    const cached=localBootstrap();if(cached){app.bootstrap=cached;app.bootstrapReady=true;setApiStatus('online',`Cache local: ${cached.fornecedores.length} fornecedores`);renderView();}
    setTimeout(()=>void loadBootstrap({silent:true}).catch(()=>{}),120);
  }

  window.addEventListener('pmg-lucide-ready', () => icons());
  window.addEventListener('DOMContentLoaded',init);
})();
