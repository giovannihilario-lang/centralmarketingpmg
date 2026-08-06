(() => {
  'use strict';

  const ROUTE_META = {
    dashboard: { eyebrow: 'Central comercial', title: 'Visão geral' },
    campanhas: { eyebrow: 'Planejamento', title: 'Campanhas' },
    periodos: { eyebrow: 'Calendário', title: 'Períodos' },
    produtos: { eyebrow: 'Catálogo', title: 'Produtos' },
    representantes: { eyebrow: 'Equipe comercial', title: 'Representantes' },
    importacao: { eyebrow: 'Dados', title: 'Importação' },
    apuracao: { eyebrow: 'Resultados', title: 'Performance' },
    configuracoes: { eyebrow: 'Sistema', title: 'Configurações' },
  };

  const ICONS = {
    dashboard: 'layout-dashboard', campanhas: 'megaphone', periodos: 'calendar-range',
    produtos: 'package-search', representantes: 'users-round', importacao: 'file-up',
    apuracao: 'chart-no-axes-combined', configuracoes: 'settings-2',
  };

  const html = (value = '') => String(value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

  const parseDate = (value) => value ? new Date(`${String(value).slice(0, 10)}T12:00:00`) : null;
  const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

  function campaignPhase(campaign) {
    const now = new Date();
    now.setHours(12, 0, 0, 0);
    const start = parseDate(campaign.dataInicio);
    const end = parseDate(campaign.dataFim);
    if (!campaign.ativa) return { key: 'encerrada', label: 'Encerrada', progress: 100 };
    if (start && start > now) return { key: 'agendada', label: 'Agendada', progress: 0 };
    if (end && end < now) return { key: 'encerrada', label: 'Encerrada', progress: 100 };
    if (!start || !end) return { key: 'ativa', label: 'Ativa', progress: 0 };
    const total = end - start;
    const elapsed = now - start;
    return { key: 'ativa', label: 'Ativa', progress: total > 0 ? clamp(Math.round((elapsed / total) * 100), 0, 100) : 0 };
  }

  function daysUntil(value) {
    const date = parseDate(value);
    if (!date) return null;
    const now = new Date(); now.setHours(12, 0, 0, 0);
    return Math.ceil((date - now) / 86400000);
  }

  function icon(name, extra = '') {
    return `<i data-lucide="${name}"${extra ? ` class="${extra}"` : ''}></i>`;
  }

  function refreshIcons() {
    if (window.lucide) window.lucide.createIcons({ attrs: { 'stroke-width': 1.9 } });
  }

  window.renderSidebar = function renderSidebarV3() {
    const nav = document.getElementById('sidebarNav');
    if (!nav) return;
    const groups = [
      { label: 'Gestão', keys: ['dashboard', 'campanhas', 'periodos'] },
      { label: 'Cadastros', keys: ['produtos', 'representantes'] },
      { label: 'Operação', keys: ['importacao', 'apuracao'] },
      { label: 'Sistema', keys: ['configuracoes'] },
    ];
    const source = (window.NAV || []).filter((item) => item.key);
    nav.innerHTML = groups.map((group) => `
      <span class="nav-group">${group.label}</span>
      ${group.keys.map((key) => {
        const item = source.find((entry) => entry.key === key) || { key, label: ROUTE_META[key]?.title || key };
        const badge = key === 'campanhas' ? '<b id="sideCampaignCount" class="nav-badge">0</b>' : '';
        return `<button class="nav-item ${STATE.route === key ? 'active' : ''}" data-route="${key}" onclick="navigate('${key}')">
          ${icon(ICONS[key] || 'circle')}<span>${html(item.label)}</span>${badge}
        </button>`;
      }).join('')}
    `).join('');
    refreshIcons();
    updateSidebarCount();
  };

  async function updateSidebarCount() {
    try {
      const campaigns = await DB.getAll('campanhas');
      const active = campaigns.filter((campaign) => campaignPhase(campaign).key === 'ativa').length;
      const el = document.getElementById('sideCampaignCount');
      if (el) el.textContent = active;
    } catch (_) {}
  }

  const baseOpenModal = window.openModal;
  window.openModal = function openModalV3(title, bodyHtml, footHtml, wide = false) {
    const modal = document.getElementById('modalBox');
    modal?.classList.remove('campaign-editor');
    const titleElement = document.getElementById('modalTitle');
    const wrapper = titleElement?.closest('.modal-title-wrap');
    if (wrapper) {
      wrapper.querySelector('.modal-kicker')?.remove();
      wrapper.parentNode.insertBefore(titleElement, wrapper);
      wrapper.remove();
    }
    return baseOpenModal(title, bodyHtml, footHtml, wide);
  };

  window.initTheme = async function initThemeV3() {
    const theme = await DB.getConfig('tema', 'light');
    document.documentElement.setAttribute('data-theme', theme);
    updateThemeButton(theme);
  };

  window.toggleTheme = async function toggleThemeV3() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    updateThemeButton(next);
    await DB.setConfig('tema', next);
  };

  function updateThemeButton(theme) {
    const button = document.getElementById('themeToggle');
    if (!button) return;
    button.innerHTML = icon(theme === 'dark' ? 'sun' : 'moon');
    button.title = theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro';
    refreshIcons();
  }

  const originalNavigate = window.navigate;
  window.navigate = async function navigateV3(route) {
    const meta = ROUTE_META[route] || ROUTE_META.dashboard;
    const title = document.getElementById('topbarPageTitle');
    const eyebrow = document.getElementById('topbarPageEyebrow');
    if (title) title.textContent = meta.title;
    if (eyebrow) eyebrow.textContent = meta.eyebrow;
    await originalNavigate(route);
    refreshIcons();
    closeMobileSidebar();
  };

  window.pageHeader = function pageHeaderV3(title, sub, actionsHtml = '') {
    return `<div class="page-hdr">
      <div><span class="eyebrow">PMG Campaign Studio</span><div class="page-title">${title}</div>${sub ? `<div class="page-sub">${sub}</div>` : ''}</div>
      <div class="page-actions">${actionsHtml}</div>
    </div>`;
  };

  function metricCard(iconName, value, label, tone = 'green', trend = '') {
    return `<article class="metric-card ${tone}">
      <span class="metric-icon">${icon(iconName)}</span>
      <span class="metric-copy"><strong>${value}</strong><small>${label}</small></span>
      ${trend ? `<span class="metric-trend">${trend}</span>` : ''}
    </article>`;
  }

  function campaignCard(campaign, stats = {}) {
    const phase = campaignPhase(campaign);
    const background = campaign.bannerUrl
      ? `background-image:url('${String(campaign.bannerUrl).replace(/'/g, "\\'")}');`
      : `background:linear-gradient(135deg, ${campaign.cor || '#155333'}, #092819);`;
    const duration = campaign.numSemanas || stats.weeks || '—';
    const productCount = stats.products ?? '—';
    const rulesCount = stats.rules ?? '—';
    return `<article class="campanha-card" data-campaign-name="${html(`${campaign.nome} ${campaign.fornecedor}`.toLowerCase())}" data-status="${phase.key}">
      <div class="campanha-banner" style="${background}">
        <span class="campaign-status ${phase.key}">${phase.label}</span>
        <button class="campaign-more" type="button" title="Editar campanha" onclick="openCampanhaModal('${campaign.id}')">${icon('ellipsis')}</button>
        <div class="campanha-banner-copy"><strong>${html(campaign.nome)}</strong><span>${html(campaign.fornecedor || 'Fornecedor não informado')}</span></div>
      </div>
      <div class="campanha-body">
        <div class="campanha-meta"><span class="campaign-date">${icon('calendar-days')} ${fmtDate(campaign.dataInicio)} → ${fmtDate(campaign.dataFim)}</span><span>${phase.progress}%</span></div>
        <div class="campaign-progress-wrap"><div class="campaign-progress"><span style="width:${phase.progress}%"></span></div></div>
        <div class="campaign-stats">
          <div class="campaign-stat"><strong>${duration}</strong><span>Semanas</span></div>
          <div class="campaign-stat"><strong>${productCount}</strong><span>Produtos</span></div>
          <div class="campaign-stat"><strong>${rulesCount}</strong><span>Regras</span></div>
        </div>
        <div class="campaign-actions">
          <button class="btn btn-primary btn-sm" onclick="openCampanhaModal('${campaign.id}')">${icon('pencil-line')} Editar estrutura</button>
          <button class="btn btn-ghost btn-sm" title="Abrir períodos" onclick="navigate('periodos'); setTimeout(()=>selecionarCampanhaPeriodos('${campaign.id}'), 80)">${icon('calendar-range')}</button>
          <button class="btn btn-ghost btn-sm" title="Abrir performance" onclick="STATE.campanhaSelecionada='${campaign.id}'; navigate('apuracao')">${icon('chart-no-axes-combined')} Performance</button>
          <button class="btn btn-danger btn-sm" title="Excluir" onclick="excluirCampanha('${campaign.id}')">${icon('trash-2')}</button>
        </div>
      </div>
    </article>`;
  }

  async function loadCampaignStats(campaigns) {
    const [rules, productRules] = await Promise.all([DB.getAll('regras'), DB.getAll('regrasProduto')]);
    return Object.fromEntries(campaigns.map((campaign) => {
      const ownRules = rules.filter((rule) => rule.campanhaId === campaign.id).length;
      const ownProducts = new Set(productRules.filter((rule) => rule.campanhaId === campaign.id && rule.escopo === 'produto').map((rule) => String(rule.valor))).size;
      return [campaign.id, { rules: ownRules, products: ownProducts }];
    }));
  }

  window.renderDashboard = async function renderDashboardV3() {
    root().innerHTML = `
      <div class="campaign-hero-grid">
        <article class="campaign-hero">
          <div class="campaign-hero-copy">
            <span class="eyebrow light">Motor de campanhas PMG</span>
            <h2>Construa, acompanhe e apure campanhas sem sair do fluxo.</h2>
            <p>Organize produtos em categorias, combine regras de faturamento, volume, positivação, pontos e mix, e acompanhe o que precisa de atenção em uma visão única.</p>
            <div class="hero-actions">
              <button class="btn hero-light" onclick="openCampanhaModal(null)">${icon('plus')} Nova campanha</button>
              <button class="btn hero-glass" onclick="navigate('apuracao')">${icon('chart-no-axes-combined')} Abrir apuração</button>
            </div>
          </div>
          <div class="hero-orbit" aria-hidden="true"><div class="hero-orbit-core">${icon('megaphone')}</div></div>
        </article>
        <article class="quick-start-card">
          <div class="card-heading"><div><span class="eyebrow">Acesso rápido</span><h3>Comece por aqui</h3></div>${icon('sparkles')}</div>
          <div class="quick-start-list">
            <button class="quick-start-action" onclick="openCampanhaModal(null)"><span class="quick-start-icon">${icon('wand-sparkles')}</span><span class="quick-start-copy"><strong>Criar estrutura</strong><small>Configure período, regras e produtos.</small></span>${icon('chevron-right')}</button>
            <button class="quick-start-action" onclick="navigate('produtos')"><span class="quick-start-icon">${icon('package-search')}</span><span class="quick-start-copy"><strong>Explorar catálogo</strong><small>Consulte os produtos do SQL Server.</small></span>${icon('chevron-right')}</button>
            <button class="quick-start-action" onclick="navigate('apuracao')"><span class="quick-start-icon">${icon('trophy')}</span><span class="quick-start-copy"><strong>Ver performance</strong><small>Apuração, meta coletiva e ranking dentro da campanha.</small></span>${icon('chevron-right')}</button>
          </div>
        </article>
      </div>
      <div class="metric-grid" id="dashboardMetrics"></div>
      <div class="dashboard-layout">
        <section class="card">
          <div class="section-header"><div><span class="eyebrow">Em andamento</span><h3>Campanhas que pedem atenção</h3></div><button class="btn btn-ghost btn-sm" onclick="navigate('campanhas')">Ver todas ${icon('arrow-up-right')}</button></div>
          <div class="campanha-grid" id="dashboardCampaigns"></div>
        </section>
        <aside class="dashboard-side">
          <section class="card">
            <div class="section-header"><div><span class="eyebrow">Agenda</span><h3>Próximos encerramentos</h3></div>${icon('calendar-clock')}</div>
            <div id="upcomingCampaigns" class="insight-list"></div>
          </section>
          <section class="card">
            <div class="section-header"><div><span class="eyebrow">Prontidão</span><h3>Base configurada</h3></div>${icon('circle-gauge')}</div>
            <div id="readinessContent"></div>
          </section>
        </aside>
      </div>`;

    const [campaigns, products, representatives, sales, rules, productRules] = await Promise.all([
      DB.getAll('campanhas'), DB.getAll('produtos'), DB.getAll('representantes'), DB.getAll('vendas'), DB.getAll('regras'), DB.getAll('regrasProduto'),
    ]);
    const active = campaigns.filter((campaign) => campaignPhase(campaign).key === 'ativa');
    const scheduled = campaigns.filter((campaign) => campaignPhase(campaign).key === 'agendada');
    document.getElementById('dashboardMetrics').innerHTML = [
      metricCard('megaphone', fmtNum(active.length), 'Campanhas ativas', 'green', campaigns.length ? `${campaigns.length} total` : ''),
      metricCard('package-check', fmtNum(new Set(productRules.filter((r) => r.escopo === 'produto').map((r) => String(r.valor))).size), 'Produtos em campanhas', 'blue', `${products.length} no catálogo`),
      metricCard('users-round', fmtNum(representatives.length), 'Representantes', 'purple', sales.length ? 'com base importada' : 'aguardando dados'),
      metricCard('calendar-plus-2', fmtNum(scheduled.length), 'Campanhas agendadas', 'amber', scheduled.length ? 'próximas' : 'nenhuma'),
    ].join('');

    const statsMap = await loadCampaignStats(active);
    document.getElementById('dashboardCampaigns').innerHTML = active.length
      ? active.slice(0, 4).map((campaign) => campaignCard(campaign, statsMap[campaign.id])).join('')
      : emptyState('📢', 'Nenhuma campanha ativa. A próxima pode nascer sem uma planilha paralela.', `<button class="btn btn-primary btn-sm" onclick="openCampanhaModal(null)">Criar campanha</button>`);

    const upcoming = campaigns
      .map((campaign) => ({ campaign, days: daysUntil(campaign.dataFim) }))
      .filter((item) => item.days !== null && item.days >= 0)
      .sort((a, b) => a.days - b.days)
      .slice(0, 5);
    document.getElementById('upcomingCampaigns').innerHTML = upcoming.length ? upcoming.map(({ campaign, days }) => `
      <div class="insight-item"><span class="insight-icon">${icon(days <= 7 ? 'alarm-clock' : 'calendar-days')}</span><span class="insight-copy"><strong>${html(campaign.nome)}</strong><small>${html(campaign.fornecedor || 'Fornecedor')} · ${fmtDate(campaign.dataFim)}</small></span><span class="insight-value">${days === 0 ? 'Hoje' : `${days}d`}</span></div>
    `).join('') : '<div class="empty-state" style="padding:20px 8px;">Nenhum encerramento previsto.</div>';

    const readinessParts = [campaigns.length > 0, products.length > 0, representatives.length > 0, rules.length > 0, productRules.length > 0, sales.length > 0];
    const readiness = Math.round((readinessParts.filter(Boolean).length / readinessParts.length) * 100);
    document.getElementById('readinessContent').innerHTML = `<div class="readiness-ring" style="--progress:${readiness}"><strong>${readiness}%</strong></div><p class="readiness-copy">${readiness === 100 ? 'Estrutura pronta para operar e apurar.' : 'Complete catálogo, regras, representantes e vendas para liberar toda a operação.'}</p>`;
    refreshIcons();
  };

  window.renderCampanhas = async function renderCampanhasV3() {
    root().innerHTML = pageHeader('Campanhas', 'Crie estruturas personalizadas, organize produtos em categorias e acompanhe o ciclo completo de cada ação.',
      `<button class="btn btn-primary" onclick="openCampanhaModal(null)">${icon('plus')} Nova campanha</button>`) + `
      <div class="metric-grid" id="campaignMetrics"></div>
      <div class="campaign-toolbar">
        <div class="toolbar-search">${icon('search')}<input id="campaignSearch" placeholder="Buscar por campanha ou fornecedor" oninput="filtrarCampanhasV3()"></div>
        <select id="campaignStatusFilter" class="filter-select" onchange="filtrarCampanhasV3()"><option value="todos">Todos os status</option><option value="ativa">Ativas</option><option value="agendada">Agendadas</option><option value="encerrada">Encerradas</option></select>
        <div class="segmented"><button class="active" data-view="grid" onclick="alternarVisualCampanhas('grid', this)">${icon('layout-grid')} Cards</button><button data-view="list" onclick="alternarVisualCampanhas('list', this)">${icon('rows-3')} Lista</button></div>
      </div>
      <div class="campanha-grid" id="campanhasGrid"></div>`;

    const campaigns = await DB.getAll('campanhas');
    const statsMap = await loadCampaignStats(campaigns);
    const counts = campaigns.reduce((acc, campaign) => { acc[campaignPhase(campaign).key]++; return acc; }, { ativa: 0, agendada: 0, encerrada: 0 });
    document.getElementById('campaignMetrics').innerHTML = [
      metricCard('megaphone', fmtNum(campaigns.length), 'Total de campanhas', 'green'),
      metricCard('activity', fmtNum(counts.ativa), 'Em andamento', 'green'),
      metricCard('calendar-plus-2', fmtNum(counts.agendada), 'Agendadas', 'amber'),
      metricCard('archive', fmtNum(counts.encerrada), 'Encerradas', 'blue'),
    ].join('');
    const grid = document.getElementById('campanhasGrid');
    grid.innerHTML = campaigns.length
      ? campaigns.map((campaign) => campaignCard(campaign, statsMap[campaign.id])).join('')
      : emptyState('📢', 'Nenhuma campanha cadastrada ainda.', `<button class="btn btn-primary btn-sm" onclick="openCampanhaModal(null)">Criar primeira campanha</button>`);
    refreshIcons();
  };

  window.filtrarCampanhasV3 = function filtrarCampanhasV3() {
    const term = (document.getElementById('campaignSearch')?.value || '').trim().toLowerCase();
    const status = document.getElementById('campaignStatusFilter')?.value || 'todos';
    document.querySelectorAll('#campanhasGrid .campanha-card').forEach((card) => {
      const matchesText = !term || card.dataset.campaignName.includes(term);
      const matchesStatus = status === 'todos' || card.dataset.status === status;
      card.style.display = matchesText && matchesStatus ? '' : 'none';
    });
  };

  window.alternarVisualCampanhas = function alternarVisualCampanhas(view, button) {
    document.getElementById('campanhasGrid')?.classList.toggle('list-view', view === 'list');
    button?.parentElement?.querySelectorAll('button').forEach((item) => item.classList.toggle('active', item === button));
    refreshIcons();
  };

  const originalOpenCampaign = window.openCampanhaModal;
  window.openCampanhaModal = async function openCampaignV3(id) {
    await originalOpenCampaign(id);
    const modal = document.getElementById('modalBox');
    modal?.classList.add('campaign-editor');
    const title = document.getElementById('modalTitle');
    if (title && !title.parentElement.classList.contains('modal-title-wrap')) {
      const wrap = document.createElement('div');
      wrap.className = 'modal-title-wrap';
      title.parentNode.insertBefore(wrap, title);
      wrap.appendChild(title);
      wrap.insertAdjacentHTML('afterbegin', '<span class="modal-kicker">Campaign Studio</span>');
    }
    document.querySelectorAll('#campTabs .wizard-step').forEach((step, index) => {
      step.dataset.step = String(index + 1).padStart(2, '0');
      const labels = ['Informações gerais', 'Regras e elegibilidade', 'Produtos e categorias', 'Desempate'];
      step.textContent = labels[index] || step.textContent;
    });
    const header = modal?.querySelector('.modal-hdr');
    if (header && !header.querySelector('.editor-progress')) header.insertAdjacentHTML('beforeend', '<div class="editor-progress"><span id="campaignEditorProgress"></span></div>');
    updateEditorProgress(0);
    refreshIcons();
  };

  const originalSwitchTab = window.switchCampTab;
  window.switchCampTab = function switchCampaignTabV3(index) {
    originalSwitchTab(index);
    document.querySelectorAll('#campTabs .wizard-step').forEach((step, position) => step.classList.toggle('done', position < index));
    updateEditorProgress(index);
  };

  function updateEditorProgress(index) {
    const bar = document.getElementById('campaignEditorProgress');
    if (bar) bar.style.width = `${((Number(index) + 1) / 4) * 100}%`;
  }

  window.openCampaignCommand = async function openCampaignCommand() {
    const campaigns = await DB.getAll('campanhas');
    const body = `<div class="field"><input id="commandSearchInput" placeholder="Digite uma página, campanha ou ação..." oninput="filtrarComandosV3(this.value)" autocomplete="off"></div><div id="commandList" class="command-list">
      <button class="command-item" data-command-text="nova campanha criar" onclick="closeModal(); openCampanhaModal(null)"><span class="command-item-icon">${icon('plus')}</span><span><strong>Nova campanha</strong><small>Abrir o construtor completo.</small></span>${icon('arrow-right')}</button>
      ${Object.entries(ROUTE_META).map(([route, meta]) => `<button class="command-item" data-command-text="${html(`${meta.title} ${meta.eyebrow}`.toLowerCase())}" onclick="closeModal(); navigate('${route}')"><span class="command-item-icon">${icon(ICONS[route] || 'circle')}</span><span><strong>${html(meta.title)}</strong><small>${html(meta.eyebrow)}</small></span>${icon('arrow-right')}</button>`).join('')}
      ${campaigns.slice(0, 8).map((campaign) => `<button class="command-item" data-command-text="${html(`${campaign.nome} ${campaign.fornecedor}`.toLowerCase())}" onclick="closeModal(); openCampanhaModal('${campaign.id}')"><span class="command-item-icon">${icon('megaphone')}</span><span><strong>${html(campaign.nome)}</strong><small>${html(campaign.fornecedor || 'Campanha')}</small></span>${icon('pencil-line')}</button>`).join('')}
    </div>`;
    openModal('Busca rápida', body, '<button class="btn btn-ghost" onclick="closeModal()">Fechar</button>', false);
    document.getElementById('modalBox')?.classList.remove('campaign-editor');
    setTimeout(() => document.getElementById('commandSearchInput')?.focus(), 30);
    refreshIcons();
  };

  window.filtrarComandosV3 = function filtrarComandosV3(value) {
    const term = String(value || '').trim().toLowerCase();
    document.querySelectorAll('#commandList .command-item').forEach((item) => item.style.display = !term || item.dataset.commandText.includes(term) ? '' : 'none');
  };

  function openMobileSidebar() {
    document.getElementById('sidebar')?.classList.add('open');
    document.getElementById('sidebarBackdrop')?.classList.add('show');
  }
  function closeMobileSidebar() {
    document.getElementById('sidebar')?.classList.remove('open');
    document.getElementById('sidebarBackdrop')?.classList.remove('show');
  }
  window.openMobileSidebar = openMobileSidebar;
  window.closeMobileSidebar = closeMobileSidebar;

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      window.openCampaignCommand();
    }
  });

  document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('globalSearchBtn')?.addEventListener('click', window.openCampaignCommand);
    document.getElementById('openSidebarBtn')?.addEventListener('click', openMobileSidebar);
    document.getElementById('closeSidebarBtn')?.addEventListener('click', closeMobileSidebar);
    document.getElementById('sidebarBackdrop')?.addEventListener('click', closeMobileSidebar);
    document.getElementById('refreshPageBtn')?.addEventListener('click', () => navigate(STATE.route));
    refreshIcons();
  });
})();
