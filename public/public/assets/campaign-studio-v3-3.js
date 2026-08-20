/* PMG Connect — Campaign Studio 3.3
   Fornecedor como contexto, regras visuais, desempates configuráveis,
   representantes e apuração direta do SQL Server Power BI. */
(() => {
  'use strict';

  const METRICAS_RANKING = [
    { valor: 'pontosFinal', label: 'Pontos', icon: 'sparkles', descricao: 'Pontuação configurada por produtos e regras' },
    { valor: 'faturamentoCampanha', label: 'Faturamento', icon: 'badge-dollar-sign', descricao: 'Maior valor vendido no período' },
    { valor: 'kgCampanha', label: 'Volume', icon: 'weight', descricao: 'Maior quantidade em quilogramas' },
    { valor: 'positivacao', label: 'Positivação', icon: 'users-round', descricao: 'Maior número de clientes únicos' },
    { valor: 'mix', label: 'Mix', icon: 'boxes', descricao: 'Maior cobertura de produtos participantes' },
    { valor: 'crescimentoFaturamento', label: 'Crescimento', icon: 'trending-up', descricao: 'Maior evolução sobre o período anterior' },
  ];

  const TEMPLATES_REGRAS = {
    POSITIVACAO_MINIMA: { nome: 'Positivação mínima', campo: 'positivacao', operador: '>=', valor: 5, escopo: 'principal', obrigatoria: true, acao: 'elegivel', acaoValor: '', icon: 'user-round-check', texto: 'Exigir um número mínimo de clientes únicos' },
    FATURAMENTO_MINIMO: { nome: 'Faturamento mínimo', campo: 'faturamentoCampanha', operador: '>=', valor: 10000, escopo: 'principal', obrigatoria: true, acao: 'elegivel', acaoValor: '', icon: 'circle-dollar-sign', texto: 'Exigir um valor mínimo vendido' },
    VOLUME_MINIMO: { nome: 'Volume mínimo', campo: 'kgCampanha', operador: '>=', valor: 100, escopo: 'principal', obrigatoria: true, acao: 'elegivel', acaoValor: '', icon: 'weight', texto: 'Exigir um volume mínimo em KG' },
    PONTOS_MINIMOS: { nome: 'Pontuação mínima', campo: 'pontosProdutos', operador: '>=', valor: 400, escopo: 'principal', obrigatoria: true, acao: 'elegivel', acaoValor: '', icon: 'sparkles', texto: 'Exigir pontuação mínima nos produtos' },
    MIX_MINIMO: { nome: 'Mix mínimo', campo: 'mix', operador: '>=', valor: 30, escopo: 'principal', obrigatoria: true, acao: 'elegivel', acaoValor: '', icon: 'boxes', texto: 'Exigir cobertura mínima do mix selecionado' },
    CRESCIMENTO_FATURAMENTO: { nome: 'Crescimento de faturamento', campo: 'crescimentoFaturamento', operador: '>=', valor: 8, escopo: 'principal', obrigatoria: true, acao: 'elegivel', acaoValor: '', icon: 'trending-up', texto: 'Comparar com as semanas anteriores equivalentes' },
    CRESCIMENTO_VOLUME: { nome: 'Crescimento de volume', campo: 'crescimentoKg', operador: '>=', valor: 8, escopo: 'principal', obrigatoria: true, acao: 'elegivel', acaoValor: '', icon: 'chart-no-axes-combined', texto: 'Comparar KG com o período anterior' },
    SALDO_CLIENTES: { nome: 'Saldo de clientes', campo: 'saldoClientes', operador: '>=', valor: 3, escopo: 'principal', obrigatoria: true, acao: 'elegivel', acaoValor: '', icon: 'user-round-plus', texto: 'Exigir crescimento líquido de clientes' },
    PEDIDOS_MINIMOS: { nome: 'Pedidos mínimos', campo: 'pedidos', operador: '>=', valor: 5, escopo: 'principal', obrigatoria: true, acao: 'elegivel', acaoValor: '', icon: 'receipt-text', texto: 'Exigir quantidade mínima de pedidos' },
    BONUS_PONTOS: { nome: 'Bônus por meta', campo: 'positivacao', operador: '>=', valor: 10, escopo: 'geral', obrigatoria: false, acao: 'pontos', acaoValor: 500, icon: 'badge-plus', texto: 'Adicionar pontos quando uma meta for atingida' },
  };

  const DESEMPATES_EXTRA = [
    { valor: 'pontosFinal', label: 'Maior pontuação', icon: 'sparkles' },
    { valor: 'positivacao', label: 'Maior positivação', icon: 'users-round' },
    { valor: 'faturamentoCampanha', label: 'Maior faturamento', icon: 'circle-dollar-sign' },
    { valor: 'kgCampanha', label: 'Maior volume em KG', icon: 'weight' },
    { valor: 'mix', label: 'Maior mix', icon: 'boxes' },
    { valor: 'crescimentoFaturamento', label: 'Maior crescimento de faturamento', icon: 'trending-up' },
    { valor: 'crescimentoKg', label: 'Maior crescimento de volume', icon: 'chart-no-axes-combined' },
    { valor: 'clientesCampanha', label: 'Mais clientes únicos', icon: 'user-round-check' },
    { valor: 'pedidos', label: 'Mais pedidos', icon: 'receipt-text' },
  ];

  const esc = (valor) => String(valor ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#039;');

  const icon = (nome) => `<i data-lucide="${nome}"></i>`;
  const atualizarIcones = () => window.lucide?.createIcons({ attrs: { 'stroke-width': 1.9 } });
  const estadoModal = () => (typeof _campanhaModalState !== 'undefined' ? _campanhaModalState : null);
  const campoLabel = (valor) => (window.CAMPOS_METRICA || CAMPOS_METRICA).find((item) => item.valor === valor)?.label || valor;
  const acaoLabel = (valor) => (window.ACOES || ACOES).find((item) => item.valor === valor)?.label || valor;
  const operadorLabel = (valor) => ({ '>=': 'pelo menos', '<=': 'no máximo', '>': 'mais de', '<': 'menos de', '==': 'igual a', '!=': 'diferente de' }[valor] || valor);

  function templateDaRegra(regra = {}) {
    return Object.entries(TEMPLATES_REGRAS).find(([, template]) => template.campo === regra.campo && template.acao === (regra.acao || 'elegivel'))?.[0] || 'PERSONALIZADA';
  }

  window.regraRowHtml = function regraCardHtml(regra = {}) {
    const templateId = regra.templateId || templateDaRegra(regra);
    const template = TEMPLATES_REGRAS[templateId] || { icon: 'sliders-horizontal', texto: 'Regra personalizada' };
    const dados = {
      nome: regra.nome || template.nome || 'Nova regra',
      campo: regra.campo || template.campo || 'faturamentoCampanha',
      operador: regra.operador || template.operador || '>=',
      valor: regra.valor ?? template.valor ?? 0,
      escopo: regra.escopo || template.escopo || 'principal',
      obrigatoria: regra.obrigatoria ?? template.obrigatoria ?? true,
      acao: regra.acao || template.acao || 'elegivel',
      acaoValor: regra.acaoValor ?? template.acaoValor ?? '',
    };

    return `<article class="cs-rule-card" data-row data-template="${esc(templateId)}">
      <header class="cs-rule-head">
        <span class="cs-rule-icon">${icon(template.icon || 'sliders-horizontal')}</span>
        <div class="cs-rule-title-wrap">
          <input class="cs-rule-title" data-f="nome" value="${esc(dados.nome)}" oninput="csAtualizarRegra(this.closest('[data-row]'))">
          <span class="cs-rule-summary">${esc(campoLabel(dados.campo))} ${esc(operadorLabel(dados.operador))} ${esc(dados.valor)}</span>
        </div>
        <label class="cs-switch" title="Regra obrigatória">
          <input type="checkbox" data-f="obrigatoria" ${dados.obrigatoria ? 'checked' : ''} onchange="csAtualizarRegra(this.closest('[data-row]'))">
          <span></span><b>Obrigatória</b>
        </label>
        <button type="button" class="cs-icon-danger" onclick="this.closest('[data-row]').remove(); csAtualizarContadorRegras()" title="Remover regra">${icon('trash-2')}</button>
      </header>
      <div class="cs-rule-flow">
        <div class="cs-rule-block">
          <span>Quando</span>
          <select data-f="campo" onchange="csAtualizarRegra(this.closest('[data-row]'))">
            ${CAMPOS_METRICA.map((campo) => `<option value="${esc(campo.valor)}" ${campo.valor === dados.campo ? 'selected' : ''}>${esc(campo.label)}</option>`).join('')}
          </select>
        </div>
        <span class="cs-flow-arrow">${icon('arrow-right')}</span>
        <div class="cs-rule-condition">
          <select data-f="operador" onchange="csAtualizarRegra(this.closest('[data-row]'))">
            ${Object.keys(OPERADORES).map((operador) => `<option value="${operador}" ${operador === dados.operador ? 'selected' : ''}>${esc(operadorLabel(operador))}</option>`).join('')}
          </select>
          <input type="number" step="0.01" data-f="valor" value="${esc(dados.valor)}" oninput="csAtualizarRegra(this.closest('[data-row]'))">
        </div>
        <span class="cs-flow-arrow">${icon('arrow-right')}</span>
        <div class="cs-rule-block">
          <span>Então</span>
          <select data-f="acao" onchange="csAtualizarRegra(this.closest('[data-row]'))">
            ${ACOES.map((acao) => `<option value="${esc(acao.valor)}" ${acao.valor === dados.acao ? 'selected' : ''}>${esc(acao.label)}</option>`).join('')}
          </select>
        </div>
        <input class="cs-action-value" type="number" step="0.01" data-f="acaoValor" value="${esc(dados.acaoValor)}" placeholder="Valor da ação" ${['elegivel', 'desclassificar'].includes(dados.acao) ? 'hidden' : ''}>
      </div>
      <footer class="cs-rule-foot">
        <label>Aplicar em
          <select data-f="escopo" onchange="csAtualizarRegra(this.closest('[data-row]'))">
            <option value="geral" ${dados.escopo === 'geral' ? 'selected' : ''}>Ranking principal e bônus</option>
            <option value="principal" ${dados.escopo === 'principal' ? 'selected' : ''}>Somente ranking principal</option>
            <option value="bonus" ${dados.escopo === 'bonus' ? 'selected' : ''}>Somente bônus</option>
          </select>
        </label>
        <span class="cs-rule-effect">${dados.obrigatoria ? 'Se não cumprir, fica inelegível.' : 'Regra complementar, sem desclassificação automática.'}</span>
      </footer>
    </article>`;
  };

  window.campTabRegrasHtml = function regrasStudioHtml(regras = []) {
    const campanha = estadoModal()?.campanha || {};
    const metricaAtual = campanha.metricaPrincipal || 'pontosFinal';
    const tipoResultado = campanha.tipoResultado || 'TOP_N_ENTRE_ELEGIVEIS';
    return `<div class="cs-rules-studio">
      <section class="cs-ranking-setup">
        <div class="section-title">Como o ranking principal será definido?</div>
        <p>Escolha a métrica que ordena os vendedores. As regras abaixo decidem quem está elegível.</p>
        <input type="hidden" id="cf_metricaPrincipal" value="${esc(metricaAtual)}">
        <div class="cs-metric-grid">
          ${METRICAS_RANKING.map((metrica) => `<button type="button" class="cs-metric-card ${metrica.valor === metricaAtual ? 'active' : ''}" data-metrica="${metrica.valor}" onclick="csSelecionarMetrica('${metrica.valor}')">
            ${icon(metrica.icon)}<strong>${metrica.label}</strong><span>${metrica.descricao}</span>
          </button>`).join('')}
        </div>
        <div class="cs-ranking-options">
          <label>Modelo de premiação
            <select id="cf_tipoResultado" onchange="csAtualizarTipoResultado()">
              <option value="TOP_N_ENTRE_ELEGIVEIS" ${tipoResultado === 'TOP_N_ENTRE_ELEGIVEIS' ? 'selected' : ''}>Premiar os melhores entre os elegíveis</option>
              <option value="TOP_N" ${tipoResultado === 'TOP_N' ? 'selected' : ''}>Premiar Top N, sem filtro de elegibilidade</option>
              <option value="TODOS_QUE_ATINGIREM" ${tipoResultado === 'TODOS_QUE_ATINGIREM' ? 'selected' : ''}>Premiar todos que cumprirem as regras</option>
            </select>
          </label>
          <label id="csQuantidadeClassificadosWrap">Quantidade de classificados
            <input type="number" min="1" id="cf_quantidadeClassificados" value="${esc(campanha.quantidadeClassificados || 5)}">
          </label>
        </div>
      </section>

      <section class="cs-rule-library">
        <div class="section-title">Adicionar regra</div>
        <p>Selecione um bloco pronto e ajuste apenas o valor. Nada de montar uma equação administrativa em sete colunas.</p>
        <div class="cs-template-grid">
          ${Object.entries(TEMPLATES_REGRAS).map(([id, template]) => `<button type="button" class="cs-template" onclick="csAdicionarRegra('${id}')">
            <span>${icon(template.icon)}</span><strong>${template.nome}</strong><small>${template.texto}</small><b>${icon('plus')}</b>
          </button>`).join('')}
          <button type="button" class="cs-template cs-template-custom" onclick="csAdicionarRegra('PERSONALIZADA')">
            <span>${icon('sliders-horizontal')}</span><strong>Regra personalizada</strong><small>Configurar campo, operador e efeito manualmente</small><b>${icon('plus')}</b>
          </button>
        </div>
      </section>

      <section class="cs-rules-list-section">
        <div class="section-title"><span>Regras configuradas</span><span class="cs-count" id="csRegrasCount">${regras.length}</span></div>
        <div id="regrasList" class="cs-rules-list">
          ${regras.length ? regras.map(window.regraRowHtml).join('') : '<div class="cs-rules-empty" id="csRegrasEmpty">Selecione acima as regras necessárias para esta campanha.</div>'}
        </div>
      </section>
    </div>`;
  };

  window.csSelecionarMetrica = function (valor) {
    const input = document.getElementById('cf_metricaPrincipal');
    if (input) input.value = valor;
    document.querySelectorAll('.cs-metric-card').forEach((card) => card.classList.toggle('active', card.dataset.metrica === valor));
  };

  window.csAtualizarTipoResultado = function () {
    const tipo = document.getElementById('cf_tipoResultado')?.value;
    const wrap = document.getElementById('csQuantidadeClassificadosWrap');
    if (wrap) wrap.style.display = tipo === 'TODOS_QUE_ATINGIREM' ? 'none' : '';
  };

  window.csAdicionarRegra = function (templateId) {
    const template = TEMPLATES_REGRAS[templateId] || {
      nome: 'Regra personalizada', campo: 'faturamentoCampanha', operador: '>=', valor: 0,
      escopo: 'principal', obrigatoria: true, acao: 'elegivel', acaoValor: '', templateId: 'PERSONALIZADA',
    };
    const lista = document.getElementById('regrasList');
    if (!lista) return;
    document.getElementById('csRegrasEmpty')?.remove();
    lista.insertAdjacentHTML('beforeend', window.regraRowHtml({ ...template, templateId }));
    window.csAtualizarContadorRegras();
    atualizarIcones();
    lista.lastElementChild?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  window.csAtualizarRegra = function (row) {
    if (!row) return;
    const valor = (campo) => row.querySelector(`[data-f="${campo}"]`)?.value || '';
    const obrigatoria = row.querySelector('[data-f="obrigatoria"]')?.checked;
    const resumo = row.querySelector('.cs-rule-summary');
    const efeito = row.querySelector('.cs-rule-effect');
    const actionValue = row.querySelector('.cs-action-value');
    if (resumo) resumo.textContent = `${campoLabel(valor('campo'))} ${operadorLabel(valor('operador'))} ${valor('valor')}`;
    if (efeito) efeito.textContent = obrigatoria ? 'Se não cumprir, fica inelegível.' : `Ao cumprir: ${acaoLabel(valor('acao')).toLowerCase()}.`;
    if (actionValue) actionValue.hidden = ['elegivel', 'desclassificar'].includes(valor('acao'));
    atualizarIcones();
  };

  window.csAtualizarContadorRegras = function () {
    const count = document.querySelectorAll('#regrasList [data-row]').length;
    const alvo = document.getElementById('csRegrasCount');
    if (alvo) alvo.textContent = String(count);
    const lista = document.getElementById('regrasList');
    if (lista && !count && !document.getElementById('csRegrasEmpty')) lista.innerHTML = '<div class="cs-rules-empty" id="csRegrasEmpty">Selecione acima as regras necessárias para esta campanha.</div>';
  };

  function normalizarDesempates(ordem) {
    const lista = Array.isArray(ordem) && ordem.length ? ordem : [
      { campo: 'positivacao', direcao: 'DESC' },
      { campo: 'faturamentoCampanha', direcao: 'DESC' },
    ];
    return lista.map((item) => typeof item === 'string' ? { campo: item, direcao: 'DESC' } : { campo: item.campo || item.valor, direcao: item.direcao || 'DESC' }).filter((item) => item.campo);
  }

  function desempateItemHtml(item) {
    const config = DESEMPATES_EXTRA.find((d) => d.valor === item.campo) || { valor: item.campo, label: item.campo, icon: 'list-ordered' };
    return `<article class="cs-tiebreak-item" data-val="${esc(config.valor)}">
      <span class="handle">${icon('grip-vertical')}</span>
      <span class="cs-tiebreak-icon">${icon(config.icon)}</span>
      <div><strong>${esc(config.label)}</strong><small>Aplicado somente quando os critérios anteriores empatarem</small></div>
      <select data-dir aria-label="Direção do critério">
        <option value="DESC" ${item.direcao !== 'ASC' ? 'selected' : ''}>Maior primeiro</option>
        <option value="ASC" ${item.direcao === 'ASC' ? 'selected' : ''}>Menor primeiro</option>
      </select>
      <button type="button" class="cs-icon-danger" onclick="this.closest('.cs-tiebreak-item').remove(); csAtualizarDesempates()">${icon('trash-2')}</button>
    </article>`;
  }

  window.campTabDesempateHtml = function desempateStudioHtml(ordem) {
    const normalizados = normalizarDesempates(ordem);
    return `<div class="cs-tiebreak-studio">
      <div class="section-title">Ordem de desempate</div>
      <p>O sistema percorre os critérios de cima para baixo. Arraste para definir a prioridade.</p>
      <div class="cs-tiebreak-library" id="csDesempateBiblioteca">
        ${DESEMPATES_EXTRA.map((item) => `<button type="button" data-campo="${item.valor}" onclick="csAdicionarDesempate('${item.valor}')">${icon(item.icon)}<span>${item.label}</span>${icon('plus')}</button>`).join('')}
      </div>
      <div id="desempateList" class="cs-tiebreak-list">${normalizados.map(desempateItemHtml).join('')}</div>
      <div class="cs-tiebreak-note">A métrica principal sempre ordena primeiro. Esta lista só resolve resultados empatados.</div>
    </div>`;
  };

  window.csAdicionarDesempate = function (campo) {
    const lista = document.getElementById('desempateList');
    if (!lista || lista.querySelector(`[data-val="${CSS.escape(campo)}"]`)) return;
    lista.insertAdjacentHTML('beforeend', desempateItemHtml({ campo, direcao: 'DESC' }));
    window.csAtualizarDesempates();
    atualizarIcones();
  };

  window.csAtualizarDesempates = function () {
    const ativos = new Set([...document.querySelectorAll('#desempateList [data-val]')].map((item) => item.dataset.val));
    document.querySelectorAll('#csDesempateBiblioteca [data-campo]').forEach((botao) => {
      botao.disabled = ativos.has(botao.dataset.campo);
      botao.classList.toggle('is-used', ativos.has(botao.dataset.campo));
    });
  };

  window.ordenarComDesempate = function (lista, ordemDesempate, metricaPrincipal = 'pontosFinal') {
    const ordem = normalizarDesempates(ordemDesempate);
    return [...(lista || [])].sort((a, b) => {
      const principal = (Number(b[metricaPrincipal]) || 0) - (Number(a[metricaPrincipal]) || 0);
      if (principal !== 0) return principal;
      for (const criterio of ordem) {
        const aValor = Number(a[criterio.campo]) || 0;
        const bValor = Number(b[criterio.campo]) || 0;
        const diferenca = criterio.direcao === 'ASC' ? aValor - bValor : bValor - aValor;
        if (diferenca !== 0) return diferenca;
      }
      return String(a.nome || '').localeCompare(String(b.nome || ''), 'pt-BR');
    });
  };

  let fornecedoresCache = [];
  async function carregarFornecedores() {
    if (fornecedoresCache.length) return fornecedoresCache;
    const resposta = await fetch('/api/campanhas-data?recurso=fornecedores&limite=500');
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Não foi possível consultar fornecedores');
    fornecedoresCache = dados;
    return dados;
  }

  function renderFornecedorCards(lista) {
    const grade = document.getElementById('csFornecedorGrade');
    if (!grade) return;
    const selecionado = document.getElementById('cf_fornecedor')?.value || '';
    grade.innerHTML = lista.map((fornecedor) => `<button type="button" class="cs-supplier-card ${normalizeKey(fornecedor.nome) === normalizeKey(selecionado) ? 'active' : ''}" data-id="${esc(String(fornecedor.id ?? ''))}" data-nome="${esc(fornecedor.nome)}" onclick="csSelecionarFornecedor(this.dataset.id, this.dataset.nome)">
      <span class="cs-supplier-avatar">${esc(fornecedor.nome.slice(0, 2).toUpperCase())}</span>
      <div><strong>${esc(fornecedor.nome)}</strong><small>${Number(fornecedor.totalProdutos || 0)} produtos · ${Number(fornecedor.totalGrupos || 0)} grupos</small></div>
      <span class="cs-supplier-check">${icon('check')}</span>
    </button>`).join('') || '<div class="cs-supplier-empty">Nenhum fornecedor encontrado.</div>';
    atualizarIcones();
  }

  async function instalarSeletorFornecedor() {
    const input = document.getElementById('cf_fornecedor');
    if (!input || document.getElementById('csFornecedorStudio')) return;
    const campo = input.closest('.field');
    campo.style.display = 'none';
    if (!document.getElementById('cf_fornecedorId')) input.insertAdjacentHTML('afterend', `<input type="hidden" id="cf_fornecedorId" value="${esc(estadoModal()?.campanha?.fornecedorId || '')}">`);
    campo.insertAdjacentHTML('afterend', `<section class="field full cs-supplier-studio" id="csFornecedorStudio">
      <div class="cs-supplier-heading"><div><label>Fornecedor da campanha *</label><p>Selecione o fornecedor primeiro. Produtos e apuração serão limitados a ele.</p></div><span class="cs-source-badge">SQL · dbo.Produtos</span></div>
      <div class="cs-supplier-search">${icon('search')}<input id="csFornecedorBusca" placeholder="Buscar fornecedor pelo nome" oninput="csFiltrarFornecedores(this.value)"></div>
      <div class="cs-supplier-grid" id="csFornecedorGrade"><div class="cs-supplier-loading">Consultando fornecedores do Power BI...</div></div>
    </section>`);
    try {
      const fornecedores = await carregarFornecedores();
      renderFornecedorCards(fornecedores);
    } catch (erro) {
      document.getElementById('csFornecedorGrade').innerHTML = `<div class="cs-supplier-error">${esc(erro.message)}<small>Confira a rota /api/campanhas-data e as variáveis SQL do ambiente.</small></div>`;
    }
  }

  window.csFiltrarFornecedores = function (termo) {
    const busca = normalizeKey(termo || '');
    renderFornecedorCards(fornecedoresCache.filter((item) => !busca || normalizeKey(item.nome).includes(busca)));
  };

  window.csSelecionarFornecedor = function (id, nome) {
    const input = document.getElementById('cf_fornecedor');
    const inputId = document.getElementById('cf_fornecedorId');
    if (input) input.value = nome;
    if (inputId) inputId.value = id;
    renderFornecedorCards(fornecedoresCache);
    window.cbDefinirFornecedor?.(nome, id);
    showToast(`Fornecedor selecionado: ${nome}`);
  };

  const abrirCampanhaOriginal = window.openCampanhaModal;
  window.openCampanhaModal = async function abrirCampanhaStudio(id) {
    await abrirCampanhaOriginal(id);
    await instalarSeletorFornecedor();
    window.csAtualizarTipoResultado();
    window.csAtualizarDesempates();
    document.querySelectorAll('#regrasList [data-row]').forEach(window.csAtualizarRegra);
    atualizarIcones();
  };

  const previewPeriodoOriginal = window.atualizarPreviewPeriodo;
  window.atualizarPreviewPeriodo = function previewPeriodoStudio() {
    previewPeriodoOriginal();
    const inicio = document.getElementById('cf_dataInicio')?.value;
    const fechamento = document.getElementById('cf_dataFim')?.value;
    const box = document.getElementById('periodoPreviewBox');
    const periodos = calcularPeriodos(inicio, fechamento);
    if (!box || !periodos) return;
    const campanhaFimReal = addDays(periodos.fim, -1);
    const anteriorFimReal = addDays(periodos.periodoAnteriorFim, -1);
    box.innerHTML = `<div class="cs-period-preview ${periodos.avisoNaoSegunda ? 'has-error' : ''}">
      <div class="cs-period-title">${icon('calendar-range')}<div><strong>${periodos.numSemanas} semanas comerciais completas</strong><span>Segunda a domingo, com a data final usada como fechamento exclusivo.</span></div></div>
      <div class="cs-period-columns">
        <article><small>Campanha</small><strong>${fmtDataBR(periodos.ini)} → ${fmtDataBR(campanhaFimReal)}</strong><span>Fechamento em ${fmtDataBR(periodos.fim)}</span></article>
        <span>${icon('arrow-left-right')}</span>
        <article><small>Período anterior equivalente</small><strong>${fmtDataBR(periodos.periodoAnteriorInicio)} → ${fmtDataBR(anteriorFimReal)}</strong><span>As ${periodos.numSemanas} semanas imediatamente anteriores</span></article>
      </div>
      ${periodos.avisoNaoSegunda ? '<div class="cs-period-error">As duas datas precisam cair em uma segunda-feira.</div>' : ''}
    </div>`;
    atualizarIcones();
  };

  window.salvarCampanha = async function salvarCampanhaStudio() {
    const nome = document.getElementById('cf_nome')?.value.trim();
    const fornecedor = document.getElementById('cf_fornecedor')?.value.trim();
    const fornecedorId = document.getElementById('cf_fornecedorId')?.value || '';
    if (!nome || !fornecedor) return showToast('Preencha o nome e selecione o fornecedor.', true);

    const periodos = calcularPeriodos(document.getElementById('cf_dataInicio')?.value, document.getElementById('cf_dataFim')?.value);
    if (!periodos) return showToast('Informe um período válido.', true);
    if (periodos.avisoNaoSegunda) return showToast('Início e fechamento precisam ser segundas-feiras.', true);

    const regrasProduto = typeof coletarRegrasProdutoBuilder === 'function' ? coletarRegrasProdutoBuilder() : [];
    const regras = collectRows('regrasList', '[data-row]').filter((regra) => regra.nome);
    const desempate = [...document.querySelectorAll('#desempateList .cs-tiebreak-item')].map((item) => ({ campo: item.dataset.val, direcao: item.querySelector('[data-dir]')?.value || 'DESC' }));
    const tipos = [...document.querySelectorAll('[data-tipo].active')].map((elemento) => elemento.dataset.tipo);

    const campanha = {
      id: estadoModal()?.campanha?.id || undefined,
      nome,
      fornecedor,
      fornecedorId: fornecedorId ? Number(fornecedorId) : null,
      dataInicio: toISODate(periodos.ini),
      dataFim: toISODate(periodos.fim),
      periodoAnteriorInicio: periodos.periodoAnteriorInicioISO,
      periodoAnteriorFim: periodos.periodoAnteriorFimISO,
      numSemanas: periodos.numSemanas,
      numSegundas: periodos.numSegundas,
      cor: document.getElementById('cf_cor')?.value || '#1a4d2e',
      bannerUrl: document.getElementById('cf_banner')?.value.trim() || '',
      descricao: document.getElementById('cf_descricao')?.value || '',
      premiacoes: document.getElementById('cf_premiacoes')?.value || '',
      ativa: Boolean(document.getElementById('cf_ativa')?.checked),
      metaColetivaPct: Number(document.getElementById('cf_metaColetivaPct')?.value) || null,
      metaColetivaCampo: document.getElementById('cf_metaColetivaCampo')?.value || 'kg',
      minClientesBonus: Number(document.getElementById('cf_minClientesBonus')?.value) || null,
      metricaPrincipal: document.getElementById('cf_metricaPrincipal')?.value || 'pontosFinal',
      tipoResultado: document.getElementById('cf_tipoResultado')?.value || 'TOP_N_ENTRE_ELEGIVEIS',
      quantidadeClassificados: Number(document.getElementById('cf_quantidadeClassificados')?.value) || 5,
      escopoProdutos: regrasProduto.length ? 'LISTA_DE_PRODUTOS' : 'FORNECEDOR_INTEIRO',
      tipos,
      desempate,
    };

    const salvo = await DB.put('campanhas', campanha);
    const regrasAntigas = (await DB.getAll('regras')).filter((regra) => regra.campanhaId === salvo.id);
    for (const regra of regrasAntigas) await DB.remove('regras', regra.id);
    for (const regra of regras) await DB.put('regras', { ...regra, campanhaId: salvo.id, ativa: true });

    const regrasProdutosAntigas = (await DB.getAll('regrasProduto')).filter((regra) => regra.campanhaId === salvo.id);
    for (const regra of regrasProdutosAntigas) await DB.remove('regrasProduto', regra.id);
    for (const regra of regrasProduto) await DB.put('regrasProduto', { ...regra, campanhaId: salvo.id });

    showToast(`Campanha salva com ${regras.length} regra(s) e ${regrasProduto.length || 'todos os'} produto(s) do fornecedor.`);
    closeModal();
    renderCampanhas();
    atualizarHdrCampanha();
  };

  async function consultarVendedoresSql(busca = '') {
    const parametros = new URLSearchParams({ recurso: 'vendedores' });
    if (busca) parametros.set('busca', busca);
    const resposta = await fetch('/api/campanhas-data?' + parametros.toString());
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Falha ao consultar vendedores');
    return dados;
  }

  async function sincronizarRepresentantes(dados) {
    const representantes = dados.map((item) => ({
      id: `sql:${item.vendedor}`,
      nome: item.vendedor,
      clientesCarteira: Number(item.clientesCarteira) || 0,
      clientesHistoricos: Number(item.clientesHistoricos) || 0,
      pedidosHistoricos: Number(item.pedidosHistoricos) || 0,
      ultimaVenda: item.ultimaVenda,
      faturamentoHistorico: Number(item.faturamentoHistorico) || 0,
      origem: 'SQL Server Power BI',
      ativo: true,
    }));
    if (representantes.length) await DB.putMany('representantes', representantes);
    return representantes;
  }

  window.renderRepresentantes = async function renderRepresentantesSql() {
    root().innerHTML = pageHeader('Representantes', 'Vendedores identificados diretamente nas tabelas Vendas e Clientes',
      `<button class="btn btn-primary" onclick="renderRepresentantes()">${icon('refresh-cw')} Atualizar do SQL</button>`) + `
      <div class="cs-data-source-panel">
        <span>${icon('database')}</span><div><strong>Fonte oficial: banco Power BI</strong><small>Lista unificada de dbo.Vendas.[Vendedor] e dbo.Clientes.[Vendedor].</small></div>
        <span class="cs-source-status">Consulta ao vivo</span>
      </div>
      <div class="box"><div class="cs-list-toolbar"><div class="global-search">${icon('search')}<input id="csRepBusca" placeholder="Buscar vendedor" oninput="csFiltrarRepresentantes(this.value)"></div><span id="csRepTotal"></span></div><div id="csRepresentantesResultado"><div class="cs-loading-state">Consultando vendedores...</div></div></div>`;
    atualizarIcones();
    try {
      const dados = await consultarVendedoresSql();
      const representantes = await sincronizarRepresentantes(dados);
      window.__CS_REPRESENTANTES = representantes;
      desenharRepresentantes(representantes);
    } catch (erro) {
      const locais = await DB.getAll('representantes');
      window.__CS_REPRESENTANTES = locais;
      desenharRepresentantes(locais, erro.message);
    }
  };

  function desenharRepresentantes(representantes, aviso = '') {
    const alvo = document.getElementById('csRepresentantesResultado');
    const total = document.getElementById('csRepTotal');
    if (!alvo) return;
    if (total) total.textContent = `${representantes.length} vendedor(es)`;
    alvo.innerHTML = `${aviso ? `<div class="cs-inline-warning">${esc(aviso)} · mostrando cache local.</div>` : ''}
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Vendedor</th><th>Clientes em carteira</th><th>Clientes com histórico</th><th>Pedidos históricos</th><th>Última venda</th><th>Origem</th></tr></thead><tbody>
      ${representantes.map((rep) => `<tr data-rep-search="${esc(normalizeKey(rep.nome))}"><td><div class="cs-rep-name"><span>${esc(rep.nome.slice(0, 2).toUpperCase())}</span><strong>${esc(rep.nome)}</strong></div></td><td>${fmtNum(rep.clientesCarteira || 0)}</td><td>${fmtNum(rep.clientesHistoricos || 0)}</td><td>${fmtNum(rep.pedidosHistoricos || 0)}</td><td>${rep.ultimaVenda ? fmtDate(rep.ultimaVenda) : '—'}</td><td><span class="cs-source-badge">SQL</span></td></tr>`).join('')}
      </tbody></table></div>`;
  }

  window.csFiltrarRepresentantes = function (termo) {
    const busca = normalizeKey(termo || '');
    document.querySelectorAll('[data-rep-search]').forEach((linha) => linha.style.display = !busca || linha.dataset.repSearch.includes(busca) ? '' : 'none');
  };

  function metricasRepresentante(vendas, regrasProduto, totalProdutosAtivos) {
    const atuais = vendas.filter((venda) => venda.periodo === 'campanha');
    const anteriores = vendas.filter((venda) => venda.periodo === 'anterior');
    const somar = (lista, campo) => lista.reduce((total, item) => total + (Number(item[campo]) || 0), 0);
    const clientesAtuais = new Set(atuais.map((venda) => venda.clienteCodigo || normalizeKey(venda.cliente))).size;
    const clientesAnteriores = new Set(anteriores.map((venda) => venda.clienteCodigo || normalizeKey(venda.cliente))).size;
    const kgCampanha = somar(atuais, 'kg');
    const kgAnterior = somar(anteriores, 'kg');
    const faturamentoCampanha = somar(atuais, 'valor');
    const faturamentoAnterior = somar(anteriores, 'valor');
    const produtosDistintos = new Set(atuais.map((venda) => venda.codigo)).size;
    const crescimento = (atual, anterior) => anterior > 0 ? ((atual - anterior) / anterior) * 100 : (atual > 0 ? 100 : 0);
    return {
      kgCampanha,
      kgAnterior,
      faturamentoCampanha,
      faturamentoAnterior,
      clientesCampanha: clientesAtuais,
      clientesAnterior: clientesAnteriores,
      pedidos: new Set(atuais.map((venda) => venda.pedido)).size,
      produtosDistintos,
      mix: Math.min(100, totalProdutosAtivos ? (produtosDistintos / totalProdutosAtivos) * 100 : 0),
      positivacao: clientesAtuais,
      saldoClientes: clientesAtuais - clientesAnteriores,
      crescimentoClientes: crescimento(clientesAtuais, clientesAnteriores),
      crescimentoKg: crescimento(kgCampanha, kgAnterior),
      crescimentoFaturamento: crescimento(faturamentoCampanha, faturamentoAnterior),
      pontosProdutos: calcularPontosProdutos(atuais, regrasProduto),
    };
  }

  window.calcularApuracao = async function calcularApuracaoSql() {
    const campanhaId = document.getElementById('ap_campanha')?.value;
    if (!campanhaId) return showToast('Selecione uma campanha.', true);
    const parcial = Boolean(document.getElementById('ap_modo_parcial')?.checked);
    const semana = parcial ? Number(document.getElementById('ap_semana')?.value) : null;
    const [campanha, todasRegras, todasRegrasProduto] = await Promise.all([DB.get('campanhas', campanhaId), DB.getAll('regras'), DB.getAll('regrasProduto')]);
    const periodos = calcularPeriodos(campanha?.dataInicio, campanha?.dataFim);
    if (!campanha || !periodos) return showToast('Campanha sem período válido.', true);

    const corte = parcial ? limitarPeriodoParcial(periodos, semana) : {
      numSemanas: periodos.numSemanas,
      campanhaInicioISO: toISODate(periodos.ini), campanhaFimISO: toISODate(periodos.fim),
      anteriorInicioISO: periodos.periodoAnteriorInicioISO, anteriorFimISO: periodos.periodoAnteriorFimISO,
    };
    const regras = todasRegras.filter((regra) => regra.campanhaId === campanhaId);
    const regrasProduto = todasRegrasProduto.filter((regra) => regra.campanhaId === campanhaId && regra.ativa !== false);
    const produtos = regrasProduto.map((regra) => Number(regra.valor)).filter(Number.isFinite);
    const resultadoAlvo = document.getElementById('apuracaoResultado');
    if (resultadoAlvo) resultadoAlvo.innerHTML = '<div class="cs-loading-state">Consultando vendas e produtos no SQL Server Power BI...</div>';

    try {
      const resposta = await fetch('/api/campanhas-data?recurso=apuracao', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campanhaInicio: corte.campanhaInicioISO,
          campanhaFim: corte.campanhaFimISO,
          anteriorInicio: corte.anteriorInicioISO,
          anteriorFim: corte.anteriorFimISO,
          fornecedor: campanha.fornecedor,
          fornecedorId: campanha.fornecedorId,
          produtos,
        }),
      });
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Falha ao consultar o SQL Server');

      const linhas = dados.linhas || [];
      const nomes = [...new Set(linhas.map((linha) => linha.vendedor).filter(Boolean))];
      const repIds = nomes.map((nome) => `sql:${nome}`);
      await sincronizarRepresentantes(nomes.map((vendedor) => ({ vendedor })));
      const totalProdutos = Number(dados.totalProdutosEscopo) || Math.max(1, produtos.length);
      const resultados = repIds.map((repId) => {
        const nome = repId.slice(4);
        const vendas = linhas.filter((linha) => linha.representanteId === repId);
        const metricas = metricasRepresentante(vendas, regrasProduto, totalProdutos);
        const regraResultado = aplicarRegras(regras, metricas, metricas.pontosProdutos);
        return { representanteId: repId, nome, regiao: '—', ...metricas, ...regraResultado };
      });

      const metaCampo = campanha.metaColetivaCampo === 'valor' ? 'valor' : 'kg';
      const meta = calcularMetaColetiva(linhas, metaCampo);
      const apuracao = {
        id: parcial ? `ap_${campanhaId}_parcial_s${corte.numSemanas}` : `ap_${campanhaId}`,
        campanhaId,
        geradoEm: new Date().toISOString(),
        resultados,
        parcial,
        ateSemana: parcial ? corte.numSemanas : null,
        intervaloCampanha: { inicio: corte.campanhaInicioISO, fim: corte.campanhaFimISO },
        intervaloAnterior: { inicio: corte.anteriorInicioISO, fim: corte.anteriorFimISO },
        metricaPrincipal: campanha.metricaPrincipal || 'pontosFinal',
        desempate: campanha.desempate || [],
        tipoResultado: campanha.tipoResultado,
        quantidadeClassificados: campanha.quantidadeClassificados,
        fonte: dados.fonte,
        dataReferencia: dados.dataReferencia,
        diagnostico: dados.resumo,
        totalProdutosEscopo: totalProdutos,
        metaColetiva: {
          campo: metaCampo, totalAtual: meta.totalAtual, totalAnterior: meta.totalAnterior,
          pctAtingido: meta.crescimentoPct, pctExigido: campanha.metaColetivaPct,
          batida: campanha.metaColetivaPct == null ? null : meta.crescimentoPct >= campanha.metaColetivaPct,
        },
      };
      await DB.put('apuracoes', apuracao);
      showToast(`Apuração SQL concluída para ${resultados.length} vendedor(es).`);
      window.desenharApuracao(apuracao);
    } catch (erro) {
      if (resultadoAlvo) resultadoAlvo.innerHTML = `<div class="cs-apuration-error"><strong>Não foi possível consultar o SQL Server.</strong><span>${esc(erro.message)}</span><small>Os números não foram substituídos por dados simulados ou cache antigo.</small></div>`;
      showToast(erro.message, true);
    }
  };

  function valorMetrica(resultado, metrica) {
    const valor = Number(resultado[metrica]) || 0;
    if (metrica.toLowerCase().includes('faturamento')) return fmtMoney(valor);
    if (metrica.toLowerCase().includes('crescimento') || metrica === 'mix') return fmtPct(valor);
    if (metrica.toLowerCase().includes('kg')) return fmtKg(valor);
    return fmtNum(valor);
  }

  window.desenharApuracao = function desenharApuracaoSql(apuracao) {
    const alvo = document.getElementById('apuracaoResultado');
    if (!alvo) return;
    const metrica = apuracao.metricaPrincipal || 'pontosFinal';
    let ordenados = window.ordenarComDesempate(apuracao.resultados, apuracao.desempate, metrica);
    if (apuracao.tipoResultado === 'TOP_N_ENTRE_ELEGIVEIS') ordenados = ordenados.filter((item) => item.elegivel);
    if (apuracao.tipoResultado !== 'TODOS_QUE_ATINGIREM' && apuracao.quantidadeClassificados) ordenados = ordenados.slice(0, apuracao.quantidadeClassificados);
    if (apuracao.tipoResultado === 'TODOS_QUE_ATINGIREM') ordenados = ordenados.filter((item) => item.elegivel);
    const fimCampanha = addDays(parseISODate(apuracao.intervaloCampanha.fim), -1);
    const fimAnterior = addDays(parseISODate(apuracao.intervaloAnterior.fim), -1);
    const metricaInfo = METRICAS_RANKING.find((item) => item.valor === metrica) || { label: metrica, icon: 'trophy' };

    alvo.innerHTML = `<div class="cs-apuration-source">
      <div>${icon('database')}<span><strong>${esc(apuracao.fonte || 'SQL Server Power BI')}</strong><small>Data utilizada: ${esc(apuracao.dataReferencia || 'dbo.Vendas.[Data]')} · consulta em ${apuracao.diagnostico?.duracaoMs || 0} ms</small></span></div>
      <span class="cs-source-status">Dados consultados agora</span>
    </div>
    <div class="cs-apuration-periods">
      <article><small>Campanha${apuracao.parcial ? ` · até semana ${apuracao.ateSemana}` : ''}</small><strong>${fmtDataBR(parseISODate(apuracao.intervaloCampanha.inicio))} → ${fmtDataBR(fimCampanha)}</strong></article>
      <span>${icon('arrow-left-right')}</span>
      <article><small>Período anterior equivalente</small><strong>${fmtDataBR(parseISODate(apuracao.intervaloAnterior.inicio))} → ${fmtDataBR(fimAnterior)}</strong></article>
      <article><small>Escopo consultado</small><strong>${apuracao.totalProdutosEscopo || 0} produtos · ${apuracao.diagnostico?.vendedores || 0} vendedores</strong></article>
    </div>
    <div class="cs-apuration-heading"><div><span>${icon(metricaInfo.icon)}</span><div><small>Ranking por</small><strong>${esc(metricaInfo.label)}</strong></div></div><span>${ordenados.length} classificado(s)</span></div>
    <div class="table-wrap"><table class="data-table cs-ranking-table"><thead><tr><th>#</th><th>Vendedor</th><th>${esc(metricaInfo.label)}</th><th>Faturamento</th><th>KG</th><th>Clientes</th><th>Mix</th><th>Período anterior</th><th>Elegível</th></tr></thead><tbody>
      ${ordenados.map((resultado, indice) => `<tr><td><span class="rank-pos">${indice + 1}</span></td><td><strong>${esc(resultado.nome)}</strong></td><td><strong>${valorMetrica(resultado, metrica)}</strong></td><td>${fmtMoney(resultado.faturamentoCampanha)}</td><td>${fmtKg(resultado.kgCampanha)}</td><td>${fmtNum(resultado.clientesCampanha)}</td><td>${fmtPct(resultado.mix)}</td><td>${fmtMoney(resultado.faturamentoAnterior)}</td><td><span class="badge-eleg ${resultado.elegivel ? 'sim' : 'nao'}">${resultado.elegivel ? 'Sim' : 'Não'}</span></td></tr>`).join('') || '<tr><td colspan="9" class="cs-table-empty">Nenhum vendedor cumpriu os critérios selecionados.</td></tr>'}
    </tbody></table></div>`;
    atualizarIcones();
  };

  const renderApuracaoOriginal = window.renderApuracao;
  window.renderApuracao = async function renderApuracaoStudio() {
    await renderApuracaoOriginal();
    const box = document.querySelector('#apuracaoInfoPeriodo')?.closest('.box');
    if (box && !box.querySelector('.cs-apuration-intro')) box.insertAdjacentHTML('afterbegin', `<div class="cs-apuration-intro">${icon('database')}<div><strong>Apuração automática pelo SQL Server</strong><span>O sistema consulta Vendas, VendasProdutos, Produtos e Clientes. Não é necessário importar planilhas para calcular a campanha.</span></div></div>`);
    atualizarIcones();
  };

  document.addEventListener('DOMContentLoaded', atualizarIcones);
})();
