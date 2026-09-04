const $ = id => document.getElementById(id);

const state = {
  db: null,
  session: null,
  filtersCatalog: null,
  filters: {},
  view: 'geral',
  summary: null,
  sellers: [],
  evolution: [],
  attention: [],
  portfolio: { rows: [], page: 1, total: 0, limit: 80 },
  risk: [],
  recovered: null,
  newClients: null,
  mix: null,
  suppliers: [],
  heatmap: null,
  currentSeller360: null,
  charts: {},
  loadController: null,
  lazyLoaded: new Set(),
  rankMetric: 'faturamento',
};

const numberFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });
const intFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const moneyFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const moneyFullFmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFmt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function money(value, full = false) {
  return (full ? moneyFullFmt : moneyFmt).format(num(value));
}

function kg(value) {
  const n = num(value);
  return n >= 1000 ? `${numberFmt.format(n / 1000)} t` : `${numberFmt.format(n)} kg`;
}

function marginPct(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n) <= 1.5 ? n * 100 : n;
}

function pct(value, digits = 1) {
  const n = Number(value);
  return Number.isFinite(n) ? `${n.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })}%` : '—';
}

function margin(value) {
  const n = marginPct(value);
  return n === null ? '—' : pct(n);
}

function pp(value) {
  const n = marginPct(value);
  if (n === null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`;
}

function date(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '—' : dateFmt.format(d);
}

function trend(value, suffix = '%') {
  const n = num(value);
  const cls = n > 0.05 ? 'up' : n < -0.05 ? 'down' : 'flat';
  const arrow = cls === 'up' ? '↑' : cls === 'down' ? '↓' : '→';
  return `<span class="trend ${cls}">${arrow} ${n >= 0 ? '+' : ''}${numberFmt.format(n)}${suffix}</span>`;
}

function toast(message, type = 'ok') {
  const el = $('toast');
  el.textContent = message;
  el.className = `toast ${type === 'error' ? 'error' : ''}`;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { el.hidden = true; }, 4500);
}

function setLoading(text = 'Carregando indicadores...', show = true) {
  $('loadingText').textContent = text;
  $('loadingScreen').classList.toggle('hidden', !show);
}

function showError(error) {
  const box = $('errorBanner');
  box.textContent = error?.message || String(error || 'Não foi possível carregar os dados.');
  box.hidden = false;
}

function clearError() {
  $('errorBanner').hidden = true;
  $('errorBanner').textContent = '';
}

async function initSupabase() {
  if (state.db) return state.db;
  if (!window.supabase?.createClient) throw new Error('Biblioteca do Supabase não carregou.');

  const response = await fetch('/api/notificar-demandas?config=1', {
    method: 'GET',
    cache: 'no-store',
    headers: { Accept: 'application/json' },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.supabaseUrl || !payload.supabaseAnonKey) {
    throw new Error(payload.erro || 'Configuração de autenticação indisponível.');
  }

  state.db = window.supabase.createClient(payload.supabaseUrl, payload.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  });

  state.db.auth.onAuthStateChange((_event, session) => {
    state.session = session;
  });
  return state.db;
}

async function ensureSession() {
  const db = await initSupabase();
  let { data, error } = await db.auth.getSession();
  if (error) throw error;
  if (!data?.session) {
    location.replace(`/index.html?next=${encodeURIComponent(location.pathname + location.search)}`);
    throw new Error('Sessão PMG Connect obrigatória.');
  }
  state.session = data.session;
  return data.session;
}

async function refreshSession() {
  const db = await initSupabase();
  const { data, error } = await db.auth.refreshSession();
  if (error) throw error;
  state.session = data.session;
  return state.session;
}

function paramsFor(extra = {}) {
  const p = new URLSearchParams();
  Object.entries({ ...state.filters, ...extra }).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') p.set(key, value);
  });
  return p;
}

async function api(resource, extra = {}, { signal } = {}) {
  if (!state.session?.access_token) await ensureSession();
  const request = async () => {
    const response = await fetch(`/api/performance-comercial?${paramsFor({ recurso: resource, ...extra })}`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${state.session?.access_token || ''}`,
      },
      credentials: 'include',
      cache: 'no-store',
      signal,
    });
    const payload = await response.json().catch(async () => ({ erro: await response.text().catch(() => '') }));
    if (response.status === 401) return { retry: true, payload };
    if (!response.ok || payload?.ok === false) throw new Error(payload?.erro || `Erro HTTP ${response.status}`);
    return { data: payload.data, meta: payload };
  };

  let result = await request();
  if (result.retry) {
    await refreshSession();
    result = await request();
  }
  if (result.retry) throw new Error('Sua sessão expirou. Entre novamente no PMG Connect.');
  return result;
}

function yyyyMmDd(d) {
  const local = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(local.getDate()).padStart(2, '0')}`;
}

function setPreset(preset) {
  const today = new Date();
  let start = new Date(today);
  let end = new Date(today);
  if (/^\d+$/.test(String(preset))) {
    start.setDate(today.getDate() - Number(preset) + 1);
  } else if (preset === 'month') {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
  } else if (preset === 'prevmonth') {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    end = new Date(today.getFullYear(), today.getMonth(), 0);
  } else if (preset === 'quarter') {
    const q = Math.floor(today.getMonth() / 3) * 3;
    start = new Date(today.getFullYear(), q, 1);
  } else if (preset === 'year') {
    start = new Date(today.getFullYear(), 0, 1);
  }
  $('filterInicio').value = yyyyMmDd(start);
  $('filterFim').value = yyyyMmDd(end);
  document.querySelectorAll('[data-preset]').forEach(b => b.classList.toggle('active', b.dataset.preset === String(preset)));
}

function readFilters() {
  return {
    inicio: $('filterInicio').value,
    fim: $('filterFim').value,
    vendedor: $('filterVendedor').value,
    zona: $('filterZona').value,
    subregiao: $('filterSubregiao').value,
    cidade: $('filterCidade').value,
    uf: $('filterUf').value,
    segmento: $('filterSegmento').value,
    fornecedor: $('filterFornecedor').value,
    grupo: $('filterGrupo').value,
    subgrupo: $('filterSubgrupo').value,
    formaVenda: $('filterFormaVenda').value,
  };
}

function filterLabel() {
  const f = state.filters;
  const bits = [];
  if (f.inicio && f.fim) bits.push(`${date(`${f.inicio}T12:00:00`)} a ${date(`${f.fim}T12:00:00`)}`);
  if (f.vendedor) bits.push(f.vendedor);
  if (f.fornecedor) bits.push(f.fornecedor);
  if (f.segmento) bits.push(f.segmento);
  $('filterSummary').textContent = bits.join(' · ') || 'Sem filtros adicionais';
}

function clearFilters() {
  setPreset('month');
  for (const id of ['filterVendedor','filterZona','filterSubregiao','filterCidade','filterUf','filterSegmento','filterFornecedor','filterGrupo','filterSubgrupo','filterFormaVenda']) {
    $(id).value = '';
  }
  state.filters = readFilters();
  loadCore();
}

function fillSelect(id, values, placeholder) {
  const el = $(id);
  const current = el.value;
  el.innerHTML = `<option value="">${esc(placeholder)}</option>${(values || []).map(v => `<option value="${esc(v)}">${esc(v)}</option>`).join('')}`;
  if ([...el.options].some(o => o.value === current)) el.value = current;
}

function populateFilters(catalog) {
  state.filtersCatalog = catalog;
  fillSelect('filterVendedor', catalog.vendedores, 'Todos');
  fillSelect('filterZona', catalog.zonas, 'Todas');
  fillSelect('filterSubregiao', catalog.subregioes, 'Todas');
  fillSelect('filterCidade', catalog.cidades, 'Todas');
  fillSelect('filterUf', catalog.ufs, 'Todas');
  fillSelect('filterSegmento', catalog.segmentos, 'Todos');
  fillSelect('filterFornecedor', catalog.fornecedores, 'Todos');
  fillSelect('filterGrupo', catalog.grupos, 'Todos');
  fillSelect('filterSubgrupo', catalog.subgrupos, 'Todos');
  fillSelect('filterFormaVenda', catalog.formasVenda, 'Todas');
  fillSelect('compareA', catalog.vendedores, 'Vendedor A');
  fillSelect('compareB', catalog.vendedores, 'Vendedor B');
}

function kpiCard(label, value, change, detail = '', changeType = 'pct') {
  const n = Number(change);
  const cls = Number.isFinite(n) ? (n > 0.05 ? 'up' : n < -0.05 ? 'down' : '') : '';
  let badge = '—';
  if (Number.isFinite(n)) {
    badge = changeType === 'pp'
      ? `${n >= 0 ? '+' : ''}${numberFmt.format(marginPct(n))} p.p.`
      : `${n >= 0 ? '+' : ''}${numberFmt.format(n)}%`;
  }
  return `<article class="kpi">
    <div class="kpi-top"><span class="kpi-label">${esc(label)}</span><span class="kpi-badge ${cls}">${esc(badge)}</span></div>
    <strong class="kpi-value" title="${esc(String(value))}">${esc(value)}</strong>
    <small class="kpi-detail">${esc(detail || 'vs período anterior')}</small>
  </article>`;
}

function renderKpis() {
  const s = state.summary;
  if (!s) return;
  const a = s.atual;
  const c = s.comparacao;
  const marginNote = a.productScoped ? 'Margem dos pedidos que contêm os itens filtrados' : 'Média dos pedidos no período';
  $('kpiGrid').innerHTML = [
    kpiCard('Faturamento', money(a.faturamento), c.faturamento, a.productScoped ? 'Somente itens dos filtros de produto' : 'Valor total dos pedidos'),
    kpiCard('Margem líquida', margin(a.margemLiquida), c.margemLiquidaPp, marginNote, 'pp'),
    kpiCard('Margem bruta', margin(a.margemBruta), c.margemBrutaPp, marginNote, 'pp'),
    kpiCard('Volume', kg(a.kg), c.kg, a.productScoped ? 'Kg dos itens filtrados' : 'Peso dos pedidos'),
    kpiCard('Pedidos', intFmt.format(a.pedidos), c.pedidos, 'Pedidos únicos'),
    kpiCard('Clientes ativos', intFmt.format(a.clientesAtivos), c.clientesAtivos, `Carteira: ${intFmt.format(a.carteiraTotal)}`),
    kpiCard('Ticket médio', money(a.ticketMedio), c.ticketMedio, 'Faturamento ÷ pedidos'),
    kpiCard('Positivação', pct(a.positivacao), c.positivacao, 'Clientes que compraram ÷ carteira'),
  ].join('');
}

function destroyChart(key) {
  if (state.charts[key]) {
    state.charts[key].destroy();
    delete state.charts[key];
  }
}

function renderEvolution() {
  const rows = state.evolution || [];
  const metric = $('evolutionMetric').value;
  destroyChart('evolution');
  const canvas = $('evolutionChart');
  if (!rows.length || !window.Chart) {
    canvas.style.display = 'none';
    $('evolutionInsight').textContent = rows.length ? 'Biblioteca de gráfico indisponível.' : 'Sem dados para o período.';
    return;
  }
  canvas.style.display = '';
  const labels = rows.map(r => date(`${r.periodo}T12:00:00`));
  const values = rows.map(r => {
    const v = r[metric];
    return metric === 'margem' ? (marginPct(v) ?? 0) : num(v);
  });
  const label = {
    faturamento: 'Faturamento', kg: 'Volume (kg)', pedidos: 'Pedidos',
    clientes: 'Clientes', ticketMedio: 'Ticket médio', margem: 'Margem (%)',
  }[metric];
  state.charts.evolution = new Chart(canvas, {
    type: 'line',
    data: { labels, datasets: [{ label, data: values, tension: .28, pointRadius: values.length > 45 ? 0 : 2, borderWidth: 2, fill: false }] },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => {
        const v = ctx.raw;
        if (['faturamento','ticketMedio'].includes(metric)) return money(v, true);
        if (metric === 'kg') return kg(v);
        if (metric === 'margem') return pct(v);
        return intFmt.format(v);
      } } } },
      scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 9, font: { size: 9 } } }, y: { beginAtZero: true, ticks: { font: { size: 9 } } } },
    },
  });

  const last3 = rows.slice(-3);
  let insight = 'A série ainda não tem períodos suficientes para identificar tendência.';
  if (last3.length === 3) {
    const vals = last3.map(r => num(r[metric]));
    if (vals[0] < vals[1] && vals[1] < vals[2]) insight = `${label} cresceu nos últimos 3 pontos da série.`;
    else if (vals[0] > vals[1] && vals[1] > vals[2]) insight = `${label} caiu nos últimos 3 pontos da série.`;
    else insight = `${label} oscilou nos últimos 3 pontos da série, sem tendência contínua.`;
  }
  $('evolutionInsight').textContent = insight;
}

function renderAttention() {
  const rows = state.attention || [];
  $('attentionList').innerHTML = rows.length ? rows.map(i => `
    <article class="attention-item ${esc(i.nivel)}">
      <i class="attention-dot"></i>
      <div><strong>${esc(i.titulo)}</strong><p>${esc(i.detalhe || '')}</p></div>
    </article>`).join('') : '<div class="empty">Nenhum alerta relevante com os filtros atuais.</div>';
}

function sortedSellers() {
  const metric = state.rankMetric;
  return [...state.sellers].sort((a, b) => num(b[metric]) - num(a[metric]));
}

function sellerRow(s, index) {
  return `<tr>
    <td>${index + 1}</td>
    <td><span class="seller-name">${esc(s.vendedor)}</span></td>
    <td>${money(s.faturamento)}</td>
    <td>${trend(s.crescimento)}</td>
    <td>${margin(s.margemLiquida)}</td>
    <td>${intFmt.format(s.clientesAtivos)}</td>
    <td>${pct(s.positivacao)}</td>
    <td>${money(s.ticketMedio)}</td>
    <td>${numberFmt.format(s.mixMedio || 0)}</td>
    <td><button class="open-seller" data-seller="${esc(s.vendedor)}">Abrir 360</button></td>
  </tr>`;
}

function renderSellerTable() {
  const sellers = sortedSellers();
  $('sellerTableBody').innerHTML = sellers.length ? sellers.slice(0, 20).map(sellerRow).join('') : `<tr><td colspan="10">Sem vendedores para o período.</td></tr>`;
  bindSellerButtons();
}

function renderSellerCards() {
  const q = ($('sellerSearch').value || '').trim().toLocaleLowerCase('pt-BR');
  const sellers = sortedSellers().filter(s => !q || s.vendedor.toLocaleLowerCase('pt-BR').includes(q));
  $('sellerCards').innerHTML = sellers.length ? sellers.map(s => `
    <article class="seller-card" data-seller="${esc(s.vendedor)}">
      <div class="seller-card-top"><h3>${esc(s.vendedor)}</h3>${trend(s.crescimento)}</div>
      <strong class="big">${money(s.faturamento)}</strong>
      <small>${intFmt.format(s.clientesAtivos)} clientes ativos · ${pct(s.positivacao)} positivação</small>
      <div class="mini-grid">
        <div class="mini"><span>Margem</span><b>${margin(s.margemLiquida)}</b></div>
        <div class="mini"><span>Ticket</span><b>${money(s.ticketMedio)}</b></div>
        <div class="mini"><span>Mix</span><b>${numberFmt.format(s.mixMedio || 0)}</b></div>
      </div>
    </article>`).join('') : '<div class="empty">Nenhum vendedor encontrado.</div>';
  bindSellerButtons();
}

function bindSellerButtons() {
  document.querySelectorAll('[data-seller]').forEach(el => {
    el.onclick = event => {
      event.preventDefault();
      openSeller360(el.dataset.seller);
    };
  });
}

function renderPortfolio() {
  const riskIds = new Set((state.risk || []).map(r => String(r.id)));
  const mode = $('portfolioStatus').value;
  let rows = state.portfolio.rows || [];
  rows = rows.filter(r => {
    if (mode === 'active') return r.pedidos > 0;
    if (mode === 'inactive') return r.pedidos <= 0;
    if (mode === 'risk') return riskIds.has(String(r.id));
    return true;
  });
  const active = (state.portfolio.rows || []).filter(r => r.pedidos > 0).length;
  const inactive = (state.portfolio.rows || []).filter(r => r.pedidos <= 0).length;
  $('portfolioSummary').innerHTML = `
    <article class="sub-kpi"><span>Carteira carregada</span><strong>${intFmt.format(state.portfolio.total)}</strong></article>
    <article class="sub-kpi"><span>Compraram</span><strong>${intFmt.format(active)}</strong></article>
    <article class="sub-kpi"><span>Sem compra</span><strong>${intFmt.format(inactive)}</strong></article>
    <article class="sub-kpi"><span>Em risco</span><strong>${intFmt.format(state.risk.length)}</strong></article>`;
  $('portfolioTableBody').innerHTML = rows.length ? rows.map(r => `<tr>
    <td data-label="Cliente"><span class="seller-name">${esc(r.nomeFantasia || r.cliente)}</span><br><small>${esc(r.segmento || '')}</small></td>
    <td data-label="Vendedor">${esc(r.vendedor || '—')}</td>
    <td data-label="Cidade">${esc([r.cidade,r.uf].filter(Boolean).join('/'))}</td>
    <td data-label="Faturamento">${money(r.faturamento)}</td>
    <td data-label="Variação">${trend(r.crescimento)}</td>
    <td data-label="Última compra">${date(r.ultimaCompra)}</td>
    <td data-label="Dias sem comprar">${r.diasSemComprar == null ? '—' : intFmt.format(r.diasSemComprar)}</td>
    <td data-label="Frequência">${r.intervaloMedio ? `~${numberFmt.format(r.intervaloMedio)} dias` : '—'}</td>
  </tr>`).join('') : '<tr><td colspan="8">Nenhum cliente neste filtro.</td></tr>';
  const pages = Math.max(1, Math.ceil(state.portfolio.total / state.portfolio.limit));
  $('portfolioPage').textContent = `Página ${state.portfolio.page} de ${pages}`;
  $('prevPortfolio').disabled = state.portfolio.page <= 1;
  $('nextPortfolio').disabled = state.portfolio.page >= pages;
}

function renderOpportunities() {
  $('riskList').innerHTML = state.risk.length ? state.risk.slice(0, 35).map(r => `
    <article class="list-item">
      <div class="list-item-main">
        <strong>${esc(r.nomeFantasia || r.cliente)}</strong>
        <p>${esc(r.vendedor || '')} · ${r.diasSemComprar} dias sem comprar${r.intervaloMedio ? ` · padrão ~${numberFmt.format(r.intervaloMedio)} dias` : ''}</p>
      </div>
      <div class="list-item-meta"><span class="risk-pill ${esc(r.risco)}">${esc(r.risco)}</span><b>${trend(r.variacao)}</b></div>
    </article>`).join('') : '<div class="empty">Nenhum cliente com sinal de risco pelas regras atuais.</div>';

  const recovered = state.recovered || { total: 0, receitaRecuperada: 0, rows: [] };
  $('recoveredSummary').innerHTML = `<strong>${intFmt.format(recovered.total)} recuperados</strong><span>${money(recovered.receitaRecuperada)} em receita após reativação</span>`;
  $('recoveredList').innerHTML = recovered.rows?.length ? recovered.rows.slice(0, 12).map(r => `
    <article class="list-item"><div class="list-item-main"><strong>${esc(r.nomeFantasia || r.cliente)}</strong><p>${intFmt.format(r.diasAusente)} dias entre compras</p></div><div class="list-item-meta"><b>${money(r.receita)}</b></div></article>`).join('') : '<div class="empty">Nenhuma reativação identificada.</div>';

  const mixRows = state.mix?.oportunidades || [];
  $('mixList').innerHTML = mixRows.length ? mixRows.slice(0, 25).map(r => `
    <article class="list-item"><div class="list-item-main"><strong>${esc(r.nomeFantasia || r.cliente)}</strong><p>${esc(r.segmento || 'Sem segmento')} · ${r.grupos} grupos comprados · média ${numberFmt.format(r.mediaGruposSegmento)}</p></div><div class="list-item-meta"><b>+${r.oportunidadeGrupos} grupos</b><small>oportunidade</small></div></article>`).join('') : '<div class="empty">Sem gaps de mix relevantes no recorte.</div>';

  const newRows = state.newClients?.rows || [];
  $('newClientsList').innerHTML = newRows.length ? newRows.slice(0, 25).map(r => `
    <article class="list-item"><div class="list-item-main"><strong>${esc(r.nomeFantasia || r.cliente)}</strong><p>${esc(r.vendedor || '')} · entrou ${date(r.clienteDesde)}</p></div><div class="list-item-meta"><b>${money(r.faturamento)}</b><small>${intFmt.format(r.pedidos)} pedidos</small></div></article>`).join('') : '<div class="empty">Nenhum cliente novo no período.</div>';
}

function renderSuppliers() {
  $('supplierGrid').innerHTML = state.suppliers.length ? state.suppliers.map(s => `
    <article class="supplier-card">
      <h3>${esc(s.fornecedor)}</h3>
      <strong class="money">${money(s.faturamento)}</strong>
      <p>${intFmt.format(s.clientesPositivados)} clientes · ${intFmt.format(s.produtos)} produtos · margem ${margin(s.margem)}</p>
      <div class="penetration"><i style="width:${Math.max(0,Math.min(100,s.penetracao))}%"></i></div>
      <p><b>${pct(s.penetracao)}</b> de penetração · ${intFmt.format(s.clientesNaoPositivados)} clientes ainda não positivados</p>
    </article>`).join('') : '<div class="empty">Sem fornecedores no período.</div>';

  renderHeatmap();
}

function heatTone(value) {
  const n = Math.max(0, Math.min(100, num(value)));
  const alpha = .08 + (n / 100) * .32;
  return `rgba(45,122,79,${alpha.toFixed(3)})`;
}

function renderHeatmap() {
  const h = state.heatmap;
  if (!h?.vendedores?.length || !h?.fornecedores?.length) {
    $('heatmap').innerHTML = '<div class="empty">Sem dados suficientes para a matriz.</div>';
    return;
  }
  const map = new Map(h.cells.map(c => [`${c.vendedor}|||${c.fornecedor}`, c]));
  const cols = h.fornecedores.length + 1;
  $('heatmap').innerHTML = `<div class="heatmap" style="grid-template-columns:140px repeat(${h.fornecedores.length},92px)">
    <div class="heat-head">Vendedor</div>
    ${h.fornecedores.map(f => `<div class="heat-head" title="${esc(f)}">${esc(f.length > 13 ? f.slice(0,12)+'…' : f)}</div>`).join('')}
    ${h.vendedores.map(v => `<div class="heat-seller">${esc(v)}</div>${h.fornecedores.map(f => {
      const c = map.get(`${v}|||${f}`) || { percentual: 0, clientes: 0, carteira: 0 };
      return `<div class="heat-cell" style="background:${heatTone(c.percentual)}" title="${esc(v)} · ${esc(f)} · ${pct(c.percentual)} (${c.clientes}/${c.carteira})">${pct(c.percentual,0)}</div>`;
    }).join('')}`).join('')}
  </div>`;
}

function sellerKpisHtml(summary) {
  const a = summary.atual;
  return `<div class="dialog-kpis">
    ${dialogKpi('Faturamento', money(a.faturamento), summary.comparacao.faturamento)}
    ${dialogKpi('Margem líquida', margin(a.margemLiquida), null)}
    ${dialogKpi('Volume', kg(a.kg), summary.comparacao.kg)}
    ${dialogKpi('Pedidos', intFmt.format(a.pedidos), summary.comparacao.pedidos)}
    ${dialogKpi('Clientes ativos', intFmt.format(a.clientesAtivos), summary.comparacao.clientesAtivos)}
    ${dialogKpi('Carteira', intFmt.format(a.carteiraTotal), null)}
    ${dialogKpi('Positivação', pct(a.positivacao), summary.comparacao.positivacao)}
    ${dialogKpi('Ticket', money(a.ticketMedio), summary.comparacao.ticketMedio)}
  </div>`;
}

function dialogKpi(label, value, change) {
  return `<article class="kpi"><span class="kpi-label">${esc(label)}</span><strong class="kpi-value">${esc(value)}</strong>${change == null ? '' : `<small class="kpi-detail">${trend(change)}</small>`}</article>`;
}

function simpleList(rows, formatter) {
  return rows?.length ? `<div class="list">${rows.map(formatter).join('')}</div>` : '<div class="empty">Sem dados.</div>';
}

async function openSeller360(seller) {
  const dialog = $('sellerDialog');
  $('sellerDialogTitle').textContent = seller;
  $('sellerDialogBody').innerHTML = '<div class="skeleton"></div><div class="skeleton" style="margin-top:10px"></div>';
  if (!dialog.open) dialog.showModal();
  try {
    const { data } = await api('vendedor-360', { vendedor: seller });
    state.currentSeller360 = data;
    renderSeller360(data);
  } catch (error) {
    $('sellerDialogBody').innerHTML = `<div class="error-banner">${esc(error.message)}</div>`;
  }
}

function renderSeller360(data) {
  const p = data.portfolio;
  const risk = data.risk || [];
  const suppliers = data.suppliers || [];
  $('sellerDialogBody').innerHTML = `
    ${sellerKpisHtml(data.summary)}
    <section class="dialog-section">
      <h3>Clientes que mais cresceram</h3>
      ${simpleList(data.clientesCrescimento?.slice(0,6), r => `<article class="list-item"><div class="list-item-main"><strong>${esc(r.nomeFantasia || r.cliente)}</strong><p>${money(r.faturamento)} no período</p></div><div>${trend(r.crescimento)}</div></article>`)}
    </section>
    <section class="dialog-section">
      <h3>Clientes que mais caíram</h3>
      ${simpleList(data.clientesQueda?.slice(0,6), r => `<article class="list-item"><div class="list-item-main"><strong>${esc(r.nomeFantasia || r.cliente)}</strong><p>${money(r.faturamento)} no período</p></div><div>${trend(r.crescimento)}</div></article>`)}
    </section>
    <section class="dialog-section">
      <h3>Clientes em risco</h3>
      ${simpleList(risk.slice(0,10), r => `<article class="list-item"><div class="list-item-main"><strong>${esc(r.nomeFantasia || r.cliente)}</strong><p>${r.diasSemComprar} dias sem comprar · ${esc(r.risco)}</p></div><div>${trend(r.variacao)}</div></article>`)}
    </section>
    <section class="dialog-section">
      <h3>Fornecedores na carteira</h3>
      ${simpleList(suppliers.slice(0,10), s => `<article class="list-item"><div class="list-item-main"><strong>${esc(s.fornecedor)}</strong><p>${intFmt.format(s.clientesPositivados)} clientes · ${pct(s.penetracao)} penetração</p></div><div class="list-item-meta"><b>${money(s.faturamento)}</b></div></article>`)}
    </section>
    <section class="dialog-section">
      <h3>Carteira recente</h3>
      ${simpleList(p.rows?.slice(0,12), r => `<article class="list-item"><div class="list-item-main"><strong>${esc(r.nomeFantasia || r.cliente)}</strong><p>${r.diasSemComprar == null ? 'Sem histórico' : `${r.diasSemComprar} dias sem comprar`}</p></div><div class="list-item-meta"><b>${money(r.faturamento)}</b></div></article>`)}
    </section>`;
}

async function runComparison() {
  const a = $('compareA').value;
  const b = $('compareB').value;
  if (!a || !b || a === b) return toast('Selecione dois vendedores diferentes.', 'error');
  $('comparisonResult').innerHTML = '<div class="skeleton"></div>';
  try {
    const { data } = await api('comparacao', { vendedorA: a, vendedorB: b });
    renderComparison(data);
  } catch (error) {
    $('comparisonResult').innerHTML = `<div class="error-banner">${esc(error.message)}</div>`;
  }
}

function comparisonRows(x) {
  const a = x.summary.atual;
  return [
    ['Faturamento', money(a.faturamento)],
    ['Crescimento', pct(x.summary.comparacao.faturamento)],
    ['Margem líquida', margin(a.margemLiquida)],
    ['Volume', kg(a.kg)],
    ['Pedidos', intFmt.format(a.pedidos)],
    ['Clientes ativos', intFmt.format(a.clientesAtivos)],
    ['Positivação', pct(a.positivacao)],
    ['Ticket médio', money(a.ticketMedio)],
    ['Clientes em risco', intFmt.format(x.risk.length)],
    ['Fornecedores positivados', intFmt.format(x.suppliers.length)],
  ];
}

function renderComparison(data) {
  $('comparisonResult').innerHTML = `<div class="comparison-grid">
    ${[data.a,data.b].map(x => `<article class="comparison-card"><h3>${esc(x.vendedor)}</h3>${comparisonRows(x).map(([k,v]) => `<div class="compare-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('')}</article>`).join('')}
  </div>`;
}

async function loadPortfolio(page = 1) {
  try {
    const [{ data: portfolio }, { data: risk }] = await Promise.all([
      api('carteira', { pagina: page, limite: state.portfolio.limit }),
      api('clientes-risco', { limite: 120 }),
    ]);
    state.portfolio = { ...portfolio, page, limit: state.portfolio.limit };
    state.risk = risk;
    renderPortfolio();
  } catch (error) {
    showError(error);
  }
}

async function loadOpportunities() {
  try {
    const [risk, recovered, mix, newClients] = await Promise.all([
      api('clientes-risco', { limite: 120 }),
      api('clientes-recuperados', { limite: 80 }),
      api('mix', { limite: 100 }),
      api('clientes-novos', { limite: 80 }),
    ]);
    state.risk = risk.data;
    state.recovered = recovered.data;
    state.mix = mix.data;
    state.newClients = newClients.data;
    renderOpportunities();
  } catch (error) {
    showError(error);
  }
}

async function loadSuppliers() {
  try {
    const [suppliers, heatmap] = await Promise.all([
      api('fornecedores', { limite: 60 }),
      api('heatmap'),
    ]);
    state.suppliers = suppliers.data;
    state.heatmap = heatmap.data;
    renderSuppliers();
  } catch (error) {
    showError(error);
  }
}

async function ensureViewData(view) {
  if (view === 'carteira' && !state.lazyLoaded.has('carteira')) {
    state.lazyLoaded.add('carteira');
    await loadPortfolio(1);
  } else if (view === 'oportunidades' && !state.lazyLoaded.has('oportunidades')) {
    state.lazyLoaded.add('oportunidades');
    await loadOpportunities();
  } else if (view === 'fornecedores' && !state.lazyLoaded.has('fornecedores')) {
    state.lazyLoaded.add('fornecedores');
    await loadSuppliers();
  }
}

function switchView(view, { skipLoad = false } = {}) {
  state.view = view;
  document.querySelectorAll('.side-link').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  document.querySelectorAll('[data-view-panel]').forEach(p => p.classList.toggle('active', p.dataset.viewPanel === view));
  document.querySelector('.side')?.classList.remove('open');
  const u = new URL(location.href);
  u.searchParams.set('view', view);
  history.replaceState(null, '', u);
  if (view === 'vendedores') renderSellerCards();
  if (!skipLoad) ensureViewData(view);
}

async function loadCore() {
  clearError();
  filterLabel();
  state.lazyLoaded.clear();
  if (state.loadController) state.loadController.abort();
  state.loadController = new AbortController();
  const signal = state.loadController.signal;
  setLoading('Consultando vendas, carteira e comparação do período...', true);

  try {
    const [summary, sellers, evolution, attention] = await Promise.all([
      api('resumo', {}, { signal }),
      api('vendedores', {}, { signal }),
      api('evolucao', { granularidade: 'dia' }, { signal }),
      api('atencao', {}, { signal }),
    ]);
    state.summary = summary.data;
    state.sellers = sellers.data;
    state.evolution = evolution.data;
    state.attention = attention.data;
    renderKpis();
    renderSellerTable();
    renderSellerCards();
    renderEvolution();
    renderAttention();
    $('freshness').textContent = `Atualizado ${new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(summary.meta.atualizadoEm))}`;
    if (state.view !== 'geral' && state.view !== 'vendedores' && state.view !== 'comparacao') await ensureViewData(state.view);
  } catch (error) {
    if (error?.name !== 'AbortError') showError(error);
  } finally {
    setLoading('', false);
  }
}

async function boot() {
  try {
    setPreset('month');
    setLoading('Validando sessão do PMG Connect...', true);
    await ensureSession();
    setLoading('Carregando filtros disponíveis no SQL...', true);
    const { data: catalog } = await api('filtros');
    populateFilters(catalog);
    state.filters = readFilters();

    const initialView = new URLSearchParams(location.search).get('view');
    if (['geral','vendedores','carteira','oportunidades','fornecedores','comparacao'].includes(initialView)) switchView(initialView, { skipLoad: true });

    bindEvents();
    await loadCore();
  } catch (error) {
    showError(error);
    setLoading('', false);
  }
}

function bindEvents() {
  document.querySelectorAll('.side-link').forEach(b => b.addEventListener('click', () => switchView(b.dataset.view)));
  $('mobileNavBtn').addEventListener('click', () => document.querySelector('.side').classList.toggle('open'));
  document.querySelectorAll('[data-preset]').forEach(b => b.addEventListener('click', () => setPreset(b.dataset.preset)));
  $('applyFiltersBtn').addEventListener('click', () => { state.filters = readFilters(); loadCore(); });
  $('clearFiltersBtn').addEventListener('click', clearFilters);
  $('refreshBtn').addEventListener('click', () => { state.filters = readFilters(); loadCore(); });
  $('evolutionMetric').addEventListener('change', renderEvolution);
  $('sellerSearch').addEventListener('input', renderSellerCards);
  $('portfolioStatus').addEventListener('change', renderPortfolio);
  $('prevPortfolio').addEventListener('click', () => loadPortfolio(Math.max(1, state.portfolio.page - 1)));
  $('nextPortfolio').addEventListener('click', () => loadPortfolio(state.portfolio.page + 1));
  $('compareBtn').addEventListener('click', runComparison);
  $('closeSellerDialog').addEventListener('click', () => $('sellerDialog').close());
  $('printSellerBtn').addEventListener('click', () => window.print());
  $('sellerDialog').addEventListener('click', event => {
    const rect = $('sellerDialog').getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('sellerDialog').close();
  });
  document.querySelectorAll('[data-rank]').forEach(b => b.addEventListener('click', () => {
    state.rankMetric = b.dataset.rank;
    document.querySelectorAll('[data-rank]').forEach(x => x.classList.toggle('active', x === b));
    renderSellerTable();
    renderSellerCards();
  }));
}

boot();
