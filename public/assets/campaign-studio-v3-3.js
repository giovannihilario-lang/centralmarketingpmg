/* PMG Connect — Campaign Studio 3.5
   Múltiplas métricas de ranking, metas coletivas/individuais, regras visuais,
   fornecedor como contexto e apuração direta do SQL Server Power BI. */
(() => {
  'use strict';

  // Mesmo padrão do Dashboard Regional: a interface pode estar na Vercel,
  // mas as consultas ao SQL Server saem do Node local da PMG.
  const CAMPANHAS_SQL_API_BASE = String(window.CAMPANHAS_SQL_API_BASE || 'http://localhost:3001/api').replace(/\/$/, '');
  const CAMPANHAS_SQL_ENDPOINT = `${CAMPANHAS_SQL_API_BASE}/campanhas-data`;

  const METRICAS_RANKING = [
    { valor: 'pontosFinal', label: 'Pontos', icon: 'sparkles', descricao: 'Pontuação configurada por produtos e regras' },
    { valor: 'faturamentoCampanha', label: 'Faturamento', icon: 'badge-dollar-sign', descricao: 'Maior valor vendido no período' },
    { valor: 'kgCampanha', label: 'Volume', icon: 'weight', descricao: 'Maior quantidade em quilogramas' },
    { valor: 'positivacao', label: 'Positivação líquida', icon: 'users-round', descricao: 'Saldo de clientes: campanha menos período anterior' },
    { valor: 'mix', label: 'Mix de categorias', icon: 'boxes', descricao: 'Categorias obrigatórias cumpridas pelo vendedor' },
    { valor: 'crescimentoFaturamento', label: 'Crescimento', icon: 'trending-up', descricao: 'Maior evolução sobre o período anterior' },
  ];

  const METRICAS_META_COLETIVA = [
    { valor: 'positivacao', label: 'Positivação líquida', unidade: 'clientes' },
    { valor: 'faturamentoCampanha', label: 'Faturamento', unidade: 'R$' },
    { valor: 'kgCampanha', label: 'Volume', unidade: 'KG' },
    { valor: 'pontosFinal', label: 'Pontos totais', unidade: 'pontos' },
    { valor: 'clientesCampanha', label: 'Clientes únicos', unidade: 'clientes' },
  ];

  const METRICAS_META_INDIVIDUAL = [
    ...METRICAS_META_COLETIVA,
    { valor: 'mix', label: 'Mix de categorias', unidade: '%' },
    { valor: 'crescimentoFaturamento', label: 'Crescimento de faturamento', unidade: '%' },
    { valor: 'crescimentoKg', label: 'Crescimento de volume', unidade: '%' },
    { valor: 'pedidos', label: 'Pedidos', unidade: 'pedidos' },
  ];

  const TEMPLATES_REGRAS = {
    POSITIVACAO_MINIMA: { nome: 'Positivação líquida mínima', campo: 'positivacao', operador: '>=', valor: 3, escopo: 'principal', obrigatoria: true, acao: 'elegivel', acaoValor: '', icon: 'user-round-check', texto: 'Exigir saldo positivo de clientes contra o período anterior' },
    FATURAMENTO_MINIMO: { nome: 'Faturamento mínimo', campo: 'faturamentoCampanha', operador: '>=', valor: 10000, escopo: 'principal', obrigatoria: true, acao: 'elegivel', acaoValor: '', icon: 'circle-dollar-sign', texto: 'Exigir um valor mínimo vendido' },
    VOLUME_MINIMO: { nome: 'Volume mínimo', campo: 'kgCampanha', operador: '>=', valor: 100, escopo: 'principal', obrigatoria: true, acao: 'elegivel', acaoValor: '', icon: 'weight', texto: 'Exigir um volume mínimo em KG' },
    PONTOS_MINIMOS: { nome: 'Pontuação mínima', campo: 'pontosProdutos', operador: '>=', valor: 400, escopo: 'principal', obrigatoria: true, acao: 'elegivel', acaoValor: '', icon: 'sparkles', texto: 'Exigir pontuação mínima nos produtos' },
    MIX_MINIMO: { nome: 'Mix de categorias completo', campo: 'mix', operador: '>=', valor: 100, escopo: 'principal', obrigatoria: true, acao: 'elegivel', acaoValor: '', icon: 'boxes', texto: 'Exigir cobertura mínima do mix selecionado' },
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
  async function fetchJsonSeguro(url, options = {}) {
    let resposta;
    try {
      resposta = await fetch(url, options);
    } catch (erroRede) {
      const erro = new Error(`Não foi possível acessar a API local da PMG em ${CAMPANHAS_SQL_API_BASE}. Abra o terminal na pasta do projeto e execute npm start.`);
      erro.codigo = 'API_LOCAL_INDISPONIVEL';
      erro.dica = erroRede?.message || 'Servidor local não respondeu.';
      throw erro;
    }
    const textoResposta = await resposta.text();
    let dados;
    try {
      dados = textoResposta ? JSON.parse(textoResposta) : {};
    } catch (_) {
      const trecho = textoResposta.trim().slice(0, 220) || 'resposta vazia';
      throw new Error(`A API respondeu HTTP ${resposta.status} sem JSON: ${trecho}`);
    }
    if (!resposta.ok) {
      const erro = new Error(dados.erro || dados.message || `Falha HTTP ${resposta.status}`);
      erro.codigo = dados.codigo;
      erro.dica = dados.dica;
      throw erro;
    }
    return dados;
  }
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
    const metricasAtuais = Array.isArray(campanha.metricasPrincipais) && campanha.metricasPrincipais.length
      ? campanha.metricasPrincipais
      : [campanha.metricaPrincipal || 'pontosFinal'];
    const tipoResultado = campanha.tipoResultado || 'TOP_N_ENTRE_ELEGIVEIS';
    const metaModo = campanha.metaModo || (campanha.metaColetivaValor != null || campanha.metaColetivaPct != null ? 'COLETIVA' : campanha.metaIndividualValor != null ? 'INDIVIDUAL' : 'NENHUMA');
    const metaColetivaMetrica = campanha.metaColetivaMetrica || (campanha.metaColetivaCampo === 'valor' ? 'faturamentoCampanha' : campanha.metaColetivaCampo === 'kg' ? 'kgCampanha' : 'positivacao');
    const metaColetivaValor = campanha.metaColetivaValor ?? campanha.metaColetivaPct ?? '';
    const metaIndividualMetrica = campanha.metaIndividualMetrica || 'positivacao';
    const metaIndividualValor = campanha.metaIndividualValor ?? '';
    return `<div class="cs-rules-studio">
      <section class="cs-ranking-setup">
        <div class="section-title">Como o ranking principal será definido?</div>
        <p>Você pode selecionar mais de uma métrica. A ordem de seleção define a prioridade: a primeira ordena, a segunda resolve empate, e assim por diante.</p>
        <input type="hidden" id="cf_metricasPrincipais" value="${esc(JSON.stringify(metricasAtuais))}">
        <input type="hidden" id="cf_metricaPrincipal" value="${esc(metricasAtuais[0] || 'pontosFinal')}">
        <div class="cs-metric-grid">
          ${METRICAS_RANKING.map((metrica) => {
            const ordem = metricasAtuais.indexOf(metrica.valor);
            return `<button type="button" class="cs-metric-card ${ordem >= 0 ? 'active' : ''}" data-metrica="${metrica.valor}" onclick="csSelecionarMetrica('${metrica.valor}')">
              <b class="cs-metric-order" ${ordem < 0 ? 'hidden' : ''}>${ordem + 1}</b>${icon(metrica.icon)}<strong>${metrica.label}</strong><span>${metrica.descricao}</span>
            </button>`;
          }).join('')}
        </div>
        <div class="cs-ranking-sequence" id="csRankingSequence"></div>
        <div class="cs-ranking-options">
          <label>Modelo de premiação
            <select id="cf_tipoResultado" onchange="csAtualizarTipoResultado()">
              <option value="TOP_N_ENTRE_ELEGIVEIS" ${tipoResultado === 'TOP_N_ENTRE_ELEGIVEIS' ? 'selected' : ''}>Premiar os melhores entre os elegíveis</option>
              <option value="TOP_N" ${tipoResultado === 'TOP_N' ? 'selected' : ''}>Premiar Top N, sem filtro de elegibilidade</option>
              <option value="TODOS_QUE_ATINGIREM" ${tipoResultado === 'TODOS_QUE_ATINGIREM' ? 'selected' : ''}>Premiar todos que cumprirem as metas e regras</option>
            </select>
          </label>
          <label id="csQuantidadeClassificadosWrap">Quantidade de classificados
            <input type="number" min="1" id="cf_quantidadeClassificados" value="${esc(campanha.quantidadeClassificados || 5)}">
          </label>
        </div>
      </section>

      <section class="cs-goals-setup">
        <div class="section-title">Como a meta da campanha funciona?</div>
        <p>Meta coletiva mede o resultado total da equipe. Meta individual define o mínimo que cada vendedor precisa alcançar.</p>
        <div class="cs-goal-mode-grid">
          ${[
            ['NENHUMA', 'Sem meta', 'Somente ranking e regras'],
            ['COLETIVA', 'Meta coletiva', 'Ex.: equipe alcançar 100 positivações'],
            ['INDIVIDUAL', 'Meta individual', 'Ex.: cada vendedor alcançar 4 positivações'],
            ['AMBAS', 'Coletiva + individual', 'As duas condições precisam ser cumpridas'],
          ].map(([valor, titulo, texto]) => `<button type="button" class="cs-goal-mode ${metaModo === valor ? 'active' : ''}" data-goal-mode="${valor}" onclick="csSelecionarModoMeta('${valor}')"><strong>${titulo}</strong><span>${texto}</span></button>`).join('')}
        </div>
        <input type="hidden" id="cf_metaModo" value="${esc(metaModo)}">
        <div class="cs-goal-configs">
          <article class="cs-goal-config" id="csMetaColetivaBox">
            <header><span>${icon('users-round')}</span><div><strong>Meta coletiva</strong><small>Somatório do desempenho dos vendedores ativos</small></div></header>
            <div class="cs-goal-fields">
              <label>Métrica<select id="cf_metaColetivaMetrica">${METRICAS_META_COLETIVA.map((m) => `<option value="${m.valor}" ${m.valor === metaColetivaMetrica ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
              <label>Meta mínima<input type="number" step="0.01" min="0" id="cf_metaColetivaValor" value="${esc(metaColetivaValor)}" placeholder="Ex.: 100"></label>
            </div>
            <p class="cs-goal-example">Exemplo: a equipe precisa alcançar pelo menos <b>100 positivações líquidas</b>.</p>
          </article>
          <article class="cs-goal-config" id="csMetaIndividualBox">
            <header><span>${icon('user-round-check')}</span><div><strong>Meta individual</strong><small>Aplicada separadamente a cada vendedor</small></div></header>
            <div class="cs-goal-fields">
              <label>Métrica<select id="cf_metaIndividualMetrica">${METRICAS_META_INDIVIDUAL.map((m) => `<option value="${m.valor}" ${m.valor === metaIndividualMetrica ? 'selected' : ''}>${m.label}</option>`).join('')}</select></label>
              <label>Meta mínima<input type="number" step="0.01" min="0" id="cf_metaIndividualValor" value="${esc(metaIndividualValor)}" placeholder="Ex.: 4"></label>
            </div>
            <p class="cs-goal-example">Exemplo: cada vendedor precisa alcançar pelo menos <b>4 positivações líquidas</b> para ficar elegível.</p>
          </article>
        </div>
      </section>

      <section class="cs-rule-library">
        <div class="section-title">Adicionar regra complementar</div>
        <p>Use regras adicionais somente quando a campanha exigir algo além da meta principal.</p>
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
          ${regras.length ? regras.map(window.regraRowHtml).join('') : '<div class="cs-rules-empty" id="csRegrasEmpty">Nenhuma regra complementar configurada. A campanha pode funcionar apenas com as metas acima.</div>'}
        </div>
      </section>
    </div>`;
  };

  function lerMetricasPrincipais() {
    const input = document.getElementById('cf_metricasPrincipais');
    try {
      const lista = JSON.parse(input?.value || '[]');
      return Array.isArray(lista) ? lista.filter((m) => METRICAS_RANKING.some((x) => x.valor === m)) : [];
    } catch (_) { return []; }
  }

  function renderSequenciaRanking() {
    const metricas = lerMetricasPrincipais();
    const inputPrincipal = document.getElementById('cf_metricaPrincipal');
    if (inputPrincipal) inputPrincipal.value = metricas[0] || 'pontosFinal';
    document.querySelectorAll('.cs-metric-card').forEach((card) => {
      const ordem = metricas.indexOf(card.dataset.metrica);
      card.classList.toggle('active', ordem >= 0);
      const badge = card.querySelector('.cs-metric-order');
      if (badge) { badge.hidden = ordem < 0; badge.textContent = String(ordem + 1); }
    });
    const alvo = document.getElementById('csRankingSequence');
    if (alvo) alvo.innerHTML = metricas.length
      ? `<small>Prioridade do ranking</small><div>${metricas.map((valor, i) => { const m = METRICAS_RANKING.find((x) => x.valor === valor); return `<span><b>${i + 1}</b>${esc(m?.label || valor)}</span>`; }).join(icon('chevron-right'))}</div>`
      : '<small>Selecione pelo menos uma métrica para ordenar o ranking.</small>';
    atualizarIcones();
  }

  window.csSelecionarMetrica = function (valor) {
    const input = document.getElementById('cf_metricasPrincipais');
    if (!input) return;
    const metricas = lerMetricasPrincipais();
    const indice = metricas.indexOf(valor);
    if (indice >= 0) {
      if (metricas.length === 1) return showToast('O ranking precisa ter pelo menos uma métrica.', true);
      metricas.splice(indice, 1);
    } else metricas.push(valor);
    input.value = JSON.stringify(metricas);
    renderSequenciaRanking();
  };

  window.csSelecionarModoMeta = function (modo) {
    const input = document.getElementById('cf_metaModo');
    if (input) input.value = modo;
    document.querySelectorAll('[data-goal-mode]').forEach((botao) => botao.classList.toggle('active', botao.dataset.goalMode === modo));
    const coletiva = document.getElementById('csMetaColetivaBox');
    const individual = document.getElementById('csMetaIndividualBox');
    if (coletiva) coletiva.hidden = !['COLETIVA', 'AMBAS'].includes(modo);
    if (individual) individual.hidden = !['INDIVIDUAL', 'AMBAS'].includes(modo);
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

  window.ordenarComDesempate = function (lista, ordemDesempate, metricasPrincipais = ['pontosFinal']) {
    const principais = Array.isArray(metricasPrincipais) ? metricasPrincipais : [metricasPrincipais || 'pontosFinal'];
    const ordem = normalizarDesempates(ordemDesempate).filter((c) => !principais.includes(c.campo));
    return [...(lista || [])].sort((a, b) => {
      for (const metrica of principais) {
        const diferenca = (Number(b[metrica]) || 0) - (Number(a[metrica]) || 0);
        if (diferenca !== 0) return diferenca;
      }
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
  let fornecedorBuscaTimer = null;
  let fornecedorCarregando = false;
  const FORNECEDORES_CACHE_KEY = 'pmg-campanhas-fornecedores-v1';
  const FORNECEDORES_CACHE_TTL = 30 * 60 * 1000;

  function lerFornecedoresCacheLocal() {
    try {
      const item = JSON.parse(sessionStorage.getItem(FORNECEDORES_CACHE_KEY) || 'null');
      if (!item || !Array.isArray(item.dados) || Date.now() - Number(item.salvoEm || 0) > FORNECEDORES_CACHE_TTL) return [];
      return item.dados;
    } catch (_) { return []; }
  }

  function salvarFornecedoresCacheLocal(lista) {
    try { sessionStorage.setItem(FORNECEDORES_CACHE_KEY, JSON.stringify({ salvoEm: Date.now(), dados: lista })); } catch (_) {}
  }

  function normalizarListaFornecedores(dados) {
    const lista = Array.isArray(dados) ? dados : (Array.isArray(dados?.dados) ? dados.dados : []);
    return lista
      .map((item) => ({
        id: item.id ?? item.fornecedorId ?? '',
        nome: String(item.nome ?? item.fornecedor ?? '').trim(),
        totalProdutos: Number(item.totalProdutos ?? item.produtos ?? 0) || 0,
        produtosAtivos: Number(item.produtosAtivos ?? 0) || 0,
        totalGrupos: Number(item.totalGrupos ?? item.grupos ?? 0) || 0,
        totalSubgrupos: Number(item.totalSubgrupos ?? item.subgrupos ?? 0) || 0,
      }))
      .filter((item) => item.nome);
  }

  async function carregarFornecedores({ busca = '', forcar = false } = {}) {
    const termo = String(busca || '').trim();
    if (!termo && !fornecedoresCache.length && !forcar) fornecedoresCache = lerFornecedoresCacheLocal();
    if (!termo && fornecedoresCache.length && !forcar) return fornecedoresCache;

    const params = new URLSearchParams({ recurso: 'fornecedores', limite: termo ? '80' : '60' });
    if (termo) params.set('busca', termo);
    const dados = await fetchJsonSeguro(`${CAMPANHAS_SQL_ENDPOINT}?${params.toString()}`);
    const lista = normalizarListaFornecedores(dados);
    if (!termo) {
      fornecedoresCache = lista;
      salvarFornecedoresCacheLocal(lista);
    }
    return lista;
  }

  function renderFornecedorCards(lista, opcoes = {}) {
    const grade = document.getElementById('csFornecedorGrade');
    if (!grade) return;
    const selecionado = document.getElementById('cf_fornecedor')?.value || '';
    const termo = String(opcoes.termo || '').trim();

    if (opcoes.carregando) {
      grade.innerHTML = `<div class="cs-supplier-loading">${icon('loader-circle')} Consultando fornecedores no SQL Server...</div>`;
      atualizarIcones();
      return;
    }

    if (opcoes.erro) {
      grade.innerHTML = `<div class="cs-supplier-error">
        <strong>Não foi possível carregar os fornecedores.</strong>
        <span>${esc(opcoes.erro.message || opcoes.erro)}</span>
        ${opcoes.erro.dica ? `<small>${esc(opcoes.erro.dica)}</small>` : '<small>A consulta usa dbo.Produtos no banco Power BI.</small>'}
        <button type="button" class="btn btn-primary btn-sm" onclick="csRecarregarFornecedores()">${icon('refresh-cw')} Tentar novamente</button>
      </div>`;
      atualizarIcones();
      return;
    }

    const limiteVisual = termo ? 40 : 18;
    let listaVisivel = lista.slice(0, limiteVisual);
    const fornecedorSelecionado = lista.find((item) => normalizeKey(item.nome) === normalizeKey(selecionado));
    if (fornecedorSelecionado && !listaVisivel.some((item) => String(item.id) === String(fornecedorSelecionado.id))) {
      listaVisivel = [fornecedorSelecionado, ...listaVisivel.slice(0, limiteVisual - 1)];
    }
    const avisoLimite = lista.length > listaVisivel.length
      ? `<div class="cs-supplier-limit-note">Mostrando ${listaVisivel.length} de ${lista.length}. Digite o nome para pesquisar diretamente no SQL Server.</div>`
      : '';
    grade.innerHTML = listaVisivel.map((fornecedor) => `<button type="button" class="cs-supplier-card ${normalizeKey(fornecedor.nome) === normalizeKey(selecionado) ? 'active' : ''}" data-id="${esc(String(fornecedor.id ?? ''))}" data-nome="${esc(fornecedor.nome)}" onclick="csSelecionarFornecedor(this.dataset.id, this.dataset.nome)">
      <span class="cs-supplier-avatar">${esc(fornecedor.nome.slice(0, 2).toUpperCase())}</span>
      <div><strong>${esc(fornecedor.nome)}</strong><small>${Number(fornecedor.totalProdutos || 0)} produtos · ${Number(fornecedor.totalGrupos || 0)} grupos</small></div>
      <span class="cs-supplier-check">${icon('check')}</span>
    </button>`).join('') + avisoLimite || `<div class="cs-supplier-empty">${termo ? `Nenhum fornecedor encontrado para “${esc(termo)}”.` : 'Nenhum fornecedor foi retornado pelo SQL Server.'}<button type="button" class="btn btn-ghost btn-sm" onclick="csRecarregarFornecedores()">${icon('refresh-cw')} Recarregar</button></div>`;
    atualizarIcones();
  }

  async function consultarFornecedoresNaTela(termo = '', forcar = false) {
    if (fornecedorCarregando) return;
    fornecedorCarregando = true;
    renderFornecedorCards([], { carregando: true });
    try {
      const lista = await carregarFornecedores({ busca: termo, forcar });
      renderFornecedorCards(lista, { termo });
    } catch (erro) {
      renderFornecedorCards([], { erro, termo });
    } finally {
      fornecedorCarregando = false;
    }
  }

  function instalarSeletorFornecedor() {
    const input = document.getElementById('cf_fornecedor');
    if (!input || document.getElementById('csFornecedorStudio')) return;
    const campo = input.closest('.field');
    campo.style.display = 'none';
    if (!document.getElementById('cf_fornecedorId')) input.insertAdjacentHTML('afterend', `<input type="hidden" id="cf_fornecedorId" value="${esc(estadoModal()?.campanha?.fornecedorId || '')}">`);
    campo.insertAdjacentHTML('afterend', `<section class="field full cs-supplier-studio" id="csFornecedorStudio">
      <div class="cs-supplier-heading"><div><label>Fornecedor da campanha *</label><p>Selecione o fornecedor primeiro. Produtos e apuração serão limitados a ele.</p></div><span class="cs-source-badge">SQL · dbo.Produtos</span></div>
      <div class="cs-supplier-search">${icon('search')}<input id="csFornecedorBusca" placeholder="Buscar fornecedor pelo nome" oninput="csFiltrarFornecedores(this.value)"><button type="button" class="cs-supplier-refresh" onclick="csRecarregarFornecedores()" title="Recarregar fornecedores">${icon('refresh-cw')}</button></div>
      <div class="cs-supplier-grid" id="csFornecedorGrade"></div>
    </section>`);

    const cache = fornecedoresCache.length ? fornecedoresCache : lerFornecedoresCacheLocal();
    if (cache.length) {
      fornecedoresCache = cache;
      renderFornecedorCards(cache);
      // Atualiza silenciosamente sem bloquear o modal.
      setTimeout(() => consultarFornecedoresNaTela('', true), 50);
    } else {
      renderFornecedorCards([], { carregando: true });
      setTimeout(() => consultarFornecedoresNaTela('', false), 0);
    }
  }

  window.csFiltrarFornecedores = function (termo) {
    clearTimeout(fornecedorBuscaTimer);
    const busca = String(termo || '').trim();

    // Resposta instantânea com o que já foi carregado.
    if (fornecedoresCache.length) {
      const local = fornecedoresCache.filter((item) => !busca || normalizeKey(item.nome).includes(normalizeKey(busca)));
      renderFornecedorCards(local, { termo: busca });
    }

    // Confirma a pesquisa no servidor, inclusive quando o cache inicial falhou/vazio.
    fornecedorBuscaTimer = setTimeout(() => consultarFornecedoresNaTela(busca, true), 350);
  };

  window.csRecarregarFornecedores = async function () {
    fornecedoresCache = [];
    const termo = document.getElementById('csFornecedorBusca')?.value || '';
    await consultarFornecedoresNaTela(termo, true);
  };

  window.csSelecionarFornecedor = function (id, nome) {
    const input = document.getElementById('cf_fornecedor');
    const inputId = document.getElementById('cf_fornecedorId');
    if (input) input.value = nome;
    if (inputId) inputId.value = id;
    renderFornecedorCards(fornecedoresCache.length ? fornecedoresCache : [{ id, nome }]);
    window.cbDefinirFornecedor?.(nome, id);
    showToast(`Fornecedor selecionado: ${nome}`);
  };

  const abrirCampanhaOriginal = window.openCampanhaModal;
  window.openCampanhaModal = async function abrirCampanhaStudio(id) {
    await abrirCampanhaOriginal(id);
    instalarSeletorFornecedor();
    window.csAtualizarTipoResultado();
    window.csAtualizarDesempates();
    document.querySelectorAll('#regrasList [data-row]').forEach(window.csAtualizarRegra);
    atualizarIcones();
  };

  const trocarEtapaOriginal = window.switchCampTab;
  window.switchCampTab = function trocarEtapaCampanha(i) {
    trocarEtapaOriginal(i);
    if (Number(i) === 2) window.cbAtivarEtapaProdutos?.();
  };

  // Fornecedores são consultados somente depois que o modal já apareceu.
  // Não fazemos pré-aquecimento: listas grandes eram renderizadas no clique e bloqueavam a interface.

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
      metaModo: document.getElementById('cf_metaModo')?.value || 'NENHUMA',
      metaColetivaMetrica: document.getElementById('cf_metaColetivaMetrica')?.value || 'positivacao',
      metaColetivaValor: document.getElementById('cf_metaColetivaValor')?.value === '' ? null : Number(document.getElementById('cf_metaColetivaValor')?.value),
      metaIndividualMetrica: document.getElementById('cf_metaIndividualMetrica')?.value || 'positivacao',
      metaIndividualValor: document.getElementById('cf_metaIndividualValor')?.value === '' ? null : Number(document.getElementById('cf_metaIndividualValor')?.value),
      minClientesBonus: Number(document.getElementById('cf_minClientesBonus')?.value) || null,
      metricasPrincipais: lerMetricasPrincipais(),
      metricaPrincipal: lerMetricasPrincipais()[0] || 'pontosFinal',
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
    const parametros = new URLSearchParams({ recurso: 'vendedores', ativos: 'true', diasHistorico: '365' });
    if (busca) parametros.set('busca', busca);
    return fetchJsonSeguro(CAMPANHAS_SQL_ENDPOINT + '?' + parametros.toString());
  }

  async function sincronizarRepresentantes(dados) {
    const representantes = (dados || [])
      .filter((item) => item.ativo !== false && Number(item.clientesAtivos || 0) > 0)
      .map((item) => ({
        id: `sql:${item.vendedor}`,
        nome: item.vendedor,
        clientesCarteira: Number(item.clientesCarteira) || 0,
        clientesAtivos: Number(item.clientesAtivos) || 0,
        clientesHistoricos: Number(item.clientesHistoricos) || 0,
        pedidosHistoricos: Number(item.pedidosHistoricos) || 0,
        ultimaVenda: item.ultimaVenda,
        faturamentoHistorico: Number(item.faturamentoHistorico) || 0,
        criterioAtividade: item.criterioAtividade || 'dbo.Clientes.[Status]',
        origem: 'SQL Server Power BI',
        ativo: true,
      }));
    if (representantes.length) await DB.putMany('representantes', representantes);
    return representantes;
  }

  window.renderRepresentantes = async function renderRepresentantesSql() {
    root().innerHTML = pageHeader('Representantes', 'Vendedores ativos identificados pela carteira de clientes do Power BI',
      `<button class="btn btn-primary" onclick="renderRepresentantes()">${icon('refresh-cw')} Atualizar do SQL</button>`) + `
      <div class="cs-data-source-panel">
        <span>${icon('database')}</span><div><strong>Somente vendedores ativos</strong><small>O vendedor entra na lista quando possui ao menos um cliente cujo dbo.Clientes.[Status] contém “ATIV”. O histórico considera os últimos 365 dias.</small></div>
        <span class="cs-source-status">Consulta ao vivo</span>
      </div>
      <div class="box"><div class="cs-list-toolbar"><div class="global-search">${icon('search')}<input id="csRepBusca" placeholder="Buscar vendedor" oninput="csFiltrarRepresentantes(this.value)"></div><span id="csRepTotal"></span></div><div id="csRepresentantesResultado"><div class="cs-loading-state">Consultando vendedores ativos...</div></div></div>`;
    atualizarIcones();
    try {
      const dados = await consultarVendedoresSql();
      const representantes = await sincronizarRepresentantes(dados);
      window.__CS_REPRESENTANTES = representantes;
      desenharRepresentantes(representantes);
    } catch (erro) {
      const locais = (await DB.getAll('representantes')).filter((item) => item.ativo !== false);
      window.__CS_REPRESENTANTES = locais;
      desenharRepresentantes(locais, `${erro.message}${erro.dica ? ` · ${erro.dica}` : ''}`);
    }
  };

  function desenharRepresentantes(representantes, aviso = '') {
    const alvo = document.getElementById('csRepresentantesResultado');
    const total = document.getElementById('csRepTotal');
    if (!alvo) return;
    if (total) total.textContent = `${representantes.length} vendedor(es) ativo(s)`;
    alvo.innerHTML = `${aviso ? `<div class="cs-inline-warning"><strong>Consulta SQL indisponível.</strong><span>${esc(aviso)}</span><small>O cache local abaixo pode estar desatualizado.</small></div>` : ''}
      <div class="table-wrap"><table class="data-table"><thead><tr><th>Vendedor</th><th>Status</th><th>Clientes ativos</th><th>Carteira total</th><th>Clientes com compra recente</th><th>Pedidos recentes</th><th>Última venda</th></tr></thead><tbody>
      ${representantes.map((rep) => `<tr data-rep-search="${esc(normalizeKey(rep.nome))}"><td><div class="cs-rep-name"><span>${esc(rep.nome.slice(0, 2).toUpperCase())}</span><strong>${esc(rep.nome)}</strong></div></td><td><span class="badge-eleg sim">Ativo</span></td><td><strong>${fmtNum(rep.clientesAtivos || 0)}</strong></td><td>${fmtNum(rep.clientesCarteira || 0)}</td><td>${fmtNum(rep.clientesHistoricos || 0)}</td><td>${fmtNum(rep.pedidosHistoricos || 0)}</td><td>${rep.ultimaVenda ? fmtDate(rep.ultimaVenda) : '—'}</td></tr>`).join('') || '<tr><td colspan="7" class="cs-table-empty">Nenhum vendedor ativo foi encontrado.</td></tr>'}
      </tbody></table></div>`;
  }

  window.csFiltrarRepresentantes = function (termo) {
    const busca = normalizeKey(termo || '');
    document.querySelectorAll('[data-rep-search]').forEach((linha) => linha.style.display = !busca || linha.dataset.repSearch.includes(busca) ? '' : 'none');
  };

  function calcularMixCategorias(atuais, regrasProduto) {
    const grupos = new Map();
    (regrasProduto || []).filter((regra) => regra.escopo === 'produto' && regra.ativa !== false).forEach((regra) => {
      const grupoId = regra.grupoId || 'grupo_principal';
      if (!grupos.has(grupoId)) grupos.set(grupoId, {
        id: grupoId,
        nome: regra.grupoNome || 'Produtos participantes',
        participaMix: regra.participaMix !== false,
        obrigatoria: regra.obrigatoriaMix !== false,
        minimoProdutos: Math.max(1, Number(regra.minimoProdutosMix) || 1),
        produtos: new Set(),
      });
      grupos.get(grupoId).produtos.add(String(regra.valor));
    });

    const vendidos = new Set(atuais.map((venda) => String(venda.codigo ?? venda.produtoId ?? '')));
    const detalhes = [...grupos.values()].filter((grupo) => grupo.participaMix).map((grupo) => {
      const produtosVendidos = [...grupo.produtos].filter((codigo) => vendidos.has(codigo));
      return {
        id: grupo.id,
        nome: grupo.nome,
        obrigatoria: grupo.obrigatoria,
        minimoProdutos: grupo.minimoProdutos,
        produtosVendidos: produtosVendidos.length,
        atingida: produtosVendidos.length >= grupo.minimoProdutos,
      };
    });
    const obrigatorias = detalhes.filter((grupo) => grupo.obrigatoria);
    const base = obrigatorias.length ? obrigatorias : detalhes;
    const atingidas = base.filter((grupo) => grupo.atingida).length;
    const total = base.length;
    return {
      mix: total ? (atingidas / total) * 100 : 0,
      mixCategoriasAtingidas: atingidas,
      mixCategoriasTotal: total,
      mixCompleto: total ? atingidas === total : true,
      mixDetalhes: detalhes,
    };
  }

  function metricasRepresentante(vendas, regrasProduto) {
    const atuais = vendas.filter((venda) => venda.periodo === 'campanha');
    const anteriores = vendas.filter((venda) => venda.periodo === 'anterior');
    const somar = (lista, campo) => lista.reduce((total, item) => total + (Number(item[campo]) || 0), 0);
    const chaveCliente = (venda) => String(venda.clienteCodigo || normalizeKey(venda.cliente));
    const clientesAtuaisSet = new Set(atuais.map(chaveCliente).filter(Boolean));
    const clientesAnterioresSet = new Set(anteriores.map(chaveCliente).filter(Boolean));
    const clientesGanhos = [...clientesAtuaisSet].filter((id) => !clientesAnterioresSet.has(id)).length;
    const clientesPerdidos = [...clientesAnterioresSet].filter((id) => !clientesAtuaisSet.has(id)).length;
    const clientesAtuais = clientesAtuaisSet.size;
    const clientesAnteriores = clientesAnterioresSet.size;
    const kgCampanha = somar(atuais, 'kg');
    const kgAnterior = somar(anteriores, 'kg');
    const faturamentoCampanha = somar(atuais, 'valor');
    const faturamentoAnterior = somar(anteriores, 'valor');
    const produtosDistintos = new Set(atuais.map((venda) => String(venda.codigo))).size;
    const crescimento = (atual, anterior) => anterior > 0 ? ((atual - anterior) / anterior) * 100 : (atual > 0 ? 100 : 0);
    const mix = calcularMixCategorias(atuais, regrasProduto);
    const positivacao = clientesAtuais - clientesAnteriores;
    return {
      kgCampanha,
      kgAnterior,
      faturamentoCampanha,
      faturamentoAnterior,
      clientesCampanha: clientesAtuais,
      clientesAnterior: clientesAnteriores,
      clientesGanhos,
      clientesPerdidos,
      pedidos: new Set(atuais.map((venda) => venda.pedido)).size,
      produtosDistintos,
      positivacao,
      saldoClientes: positivacao,
      crescimentoClientes: crescimento(clientesAtuais, clientesAnteriores),
      crescimentoKg: crescimento(kgCampanha, kgAnterior),
      crescimentoFaturamento: crescimento(faturamentoCampanha, faturamentoAnterior),
      pontosProdutos: calcularPontosProdutos(atuais, regrasProduto),
      ...mix,
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
    if (resultadoAlvo) resultadoAlvo.innerHTML = '<div class="cs-loading-state">Consultando vendas, produtos, clientes e vendedores ativos no SQL Server Power BI...</div>';

    try {
      const dados = await fetchJsonSeguro(CAMPANHAS_SQL_ENDPOINT + '?recurso=apuracao', {
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

      const linhas = dados.linhas || [];
      const nomes = [...new Set(linhas.map((linha) => linha.vendedor).filter(Boolean))];
      const repIds = nomes.map((nome) => `sql:${nome}`);
      const resultados = repIds.map((repId) => {
        const nome = repId.slice(4);
        const vendas = linhas.filter((linha) => linha.representanteId === repId);
        const metricas = metricasRepresentante(vendas, regrasProduto);
        const regraResultado = aplicarRegras(regras, metricas, metricas.pontosProdutos);
        const modoMeta = campanha.metaModo || 'NENHUMA';
        const metaIndividualConfigurada = ['INDIVIDUAL', 'AMBAS'].includes(modoMeta) && campanha.metaIndividualValor != null;
        const metaIndividualValorAtual = Number(metricas[campanha.metaIndividualMetrica || 'positivacao']) || 0;
        const metaIndividualBatida = !metaIndividualConfigurada || metaIndividualValorAtual >= Number(campanha.metaIndividualValor);
        if (!metaIndividualBatida) {
          regraResultado.elegivel = false;
          regraResultado.log = [...(regraResultado.log || []), `Meta individual não atingida: ${campoLabel(campanha.metaIndividualMetrica)} ${metaIndividualValorAtual} de ${campanha.metaIndividualValor}`];
        }
        return { representanteId: repId, nome, regiao: '—', ativo: true, ...metricas, ...regraResultado, metaIndividualConfigurada, metaIndividualMetrica: campanha.metaIndividualMetrica, metaIndividualValor: campanha.metaIndividualValor, metaIndividualValorAtual, metaIndividualBatida };
      });

      const modoMeta = campanha.metaModo || 'NENHUMA';
      const possuiMetaColetiva = ['COLETIVA', 'AMBAS'].includes(modoMeta) && campanha.metaColetivaValor !== null && campanha.metaColetivaValor !== undefined && campanha.metaColetivaValor !== '';
      const metaColetivaMetrica = campanha.metaColetivaMetrica || 'positivacao';
      const totalMetaColetiva = resultados.reduce((soma, item) => soma + (Number(item[metaColetivaMetrica]) || 0), 0);
      const apuracao = {
        id: parcial ? `ap_${campanhaId}_parcial_s${corte.numSemanas}` : `ap_${campanhaId}`,
        campanhaId,
        campanhaNome: campanha.nome,
        fornecedor: campanha.fornecedor,
        geradoEm: new Date().toISOString(),
        resultados,
        parcial,
        ateSemana: parcial ? corte.numSemanas : null,
        intervaloCampanha: { inicio: corte.campanhaInicioISO, fim: corte.campanhaFimISO },
        intervaloAnterior: { inicio: corte.anteriorInicioISO, fim: corte.anteriorFimISO },
        metricasPrincipais: Array.isArray(campanha.metricasPrincipais) && campanha.metricasPrincipais.length ? campanha.metricasPrincipais : [campanha.metricaPrincipal || 'pontosFinal'],
        metricaPrincipal: campanha.metricaPrincipal || campanha.metricasPrincipais?.[0] || 'pontosFinal',
        desempate: campanha.desempate || [],
        tipoResultado: campanha.tipoResultado,
        quantidadeClassificados: campanha.quantidadeClassificados,
        fonte: dados.fonte,
        dataReferencia: dados.dataReferencia,
        filtroRepresentantes: dados.filtroRepresentantes,
        diagnostico: dados.resumo,
        totalProdutosEscopo: Number(dados.totalProdutosEscopo) || produtos.length,
        metaModo: modoMeta,
        metaColetiva: {
          configurada: possuiMetaColetiva,
          metrica: metaColetivaMetrica,
          valorAtual: totalMetaColetiva,
          valorExigido: possuiMetaColetiva ? Number(campanha.metaColetivaValor) : null,
          batida: possuiMetaColetiva ? totalMetaColetiva >= Number(campanha.metaColetivaValor) : null,
        },
        metaIndividual: {
          configurada: ['INDIVIDUAL', 'AMBAS'].includes(modoMeta) && campanha.metaIndividualValor != null,
          metrica: campanha.metaIndividualMetrica || 'positivacao',
          valorExigido: campanha.metaIndividualValor,
        },
      };
      await DB.put('apuracoes', apuracao);
      showToast(`Apuração SQL concluída para ${resultados.length} vendedor(es) ativo(s).`);
      window.desenharApuracao(apuracao);
    } catch (erro) {
      if (resultadoAlvo) resultadoAlvo.innerHTML = `<div class="cs-apuration-error"><strong>Não foi possível consultar o SQL Server.</strong><span>${esc(erro.message)}</span>${erro.dica ? `<small>${esc(erro.dica)}</small>` : ''}<div><a class="btn btn-ghost btn-sm" href="${CAMPANHAS_SQL_ENDPOINT}?recurso=diagnostico" target="_blank">Abrir diagnóstico da API</a></div></div>`;
      showToast(erro.message, true);
    }
  };

  function valorMetrica(resultado, metrica) {
    const valor = Number(resultado[metrica]) || 0;
    if (metrica.toLowerCase().includes('faturamento')) return fmtMoney(valor);
    if (metrica.toLowerCase().includes('crescimento') || metrica === 'mix') return fmtPct(valor);
    if (metrica.toLowerCase().includes('kg')) return fmtKg(valor);
    if (metrica === 'positivacao' || metrica === 'saldoClientes') return `${valor > 0 ? '+' : ''}${fmtNum(valor)}`;
    return fmtNum(valor);
  }

  function statusMetaHtml(meta) {
    if (!meta?.configurada) return `<article class="cs-result-kpi neutral"><small>Meta coletiva</small><strong>Não configurada</strong><span>A campanha não exige meta coletiva.</span></article>`;
    const info = [...METRICAS_META_COLETIVA, ...METRICAS_META_INDIVIDUAL].find((m) => m.valor === meta.metrica) || { label: meta.metrica, unidade: '' };
    const formatar = (valor) => meta.metrica === 'faturamentoCampanha' ? fmtMoney(valor) : meta.metrica === 'kgCampanha' ? fmtKg(valor) : fmtNum(valor);
    return `<article class="cs-result-kpi ${meta.batida ? 'success' : 'danger'}"><small>Meta coletiva · ${esc(info.label)}</small><strong>${meta.batida ? 'BATIDA' : 'NÃO BATIDA'}</strong><span>${formatar(meta.valorAtual)} de ${formatar(meta.valorExigido)} exigidos</span></article>`;
  }

  function valorMetricasPrincipais(resultado, metricas) {
    return (metricas || []).map((metrica, indice) => {
      const info = METRICAS_RANKING.find((item) => item.valor === metrica) || { label: metrica };
      return `<span class="cs-multi-metric"><b>${indice + 1}</b><small>${esc(info.label)}</small><strong>${valorMetrica(resultado, metrica)}</strong></span>`;
    }).join('');
  }

  window.desenharApuracao = function desenharApuracaoSql(apuracao) {
    const alvo = document.getElementById('apuracaoResultado');
    if (!alvo) return;
    const metricas = Array.isArray(apuracao.metricasPrincipais) && apuracao.metricasPrincipais.length ? apuracao.metricasPrincipais : [apuracao.metricaPrincipal || 'pontosFinal'];
    const metrica = metricas[0];
    const todosOrdenados = window.ordenarComDesempate(apuracao.resultados || [], apuracao.desempate, metricas);
    let classificados = apuracao.tipoResultado === 'TOP_N_ENTRE_ELEGIVEIS' ? todosOrdenados.filter((item) => item.elegivel) : [...todosOrdenados];
    if (apuracao.tipoResultado === 'TODOS_QUE_ATINGIREM') classificados = todosOrdenados.filter((item) => item.elegivel);
    else if (apuracao.quantidadeClassificados) classificados = classificados.slice(0, apuracao.quantidadeClassificados);
    const metaColetivaBloqueiaPremiacao = apuracao.metaColetiva?.configurada && !apuracao.metaColetiva?.batida;
    if (metaColetivaBloqueiaPremiacao) classificados = [];
    const classificadosIds = new Set(classificados.map((item) => item.representanteId));
    const fimCampanha = addDays(parseISODate(apuracao.intervaloCampanha.fim), -1);
    const fimAnterior = addDays(parseISODate(apuracao.intervaloAnterior.fim), -1);
    const metricaInfo = METRICAS_RANKING.find((item) => item.valor === metrica) || { label: metrica, icon: 'trophy' };
    const tituloMetricas = metricas.map((m) => METRICAS_RANKING.find((item) => item.valor === m)?.label || m).join(' → ');
    const totais = (apuracao.resultados || []).reduce((acc, item) => {
      acc.faturamentoCampanha += Number(item.faturamentoCampanha) || 0;
      acc.faturamentoAnterior += Number(item.faturamentoAnterior) || 0;
      acc.kgCampanha += Number(item.kgCampanha) || 0;
      acc.kgAnterior += Number(item.kgAnterior) || 0;
      acc.positivacao += Number(item.positivacao) || 0;
      return acc;
    }, { faturamentoCampanha: 0, faturamentoAnterior: 0, kgCampanha: 0, kgAnterior: 0, positivacao: 0 });
    const crescimento = (atual, anterior) => anterior > 0 ? ((atual - anterior) / anterior) * 100 : (atual > 0 ? 100 : 0);

    alvo.innerHTML = `<div class="cs-apuration-source">
      <div>${icon('database')}<span><strong>${esc(apuracao.fonte || 'SQL Server Power BI')}</strong><small>${esc(apuracao.dataReferencia || 'dbo.Vendas.[Data]')} · somente vendedores ativos · consulta em ${apuracao.diagnostico?.duracaoMs || 0} ms</small></span></div>
      <span class="cs-source-status">Dados consultados agora</span>
    </div>
    <div class="cs-apuration-periods">
      <article><small>Campanha${apuracao.parcial ? ` · até semana ${apuracao.ateSemana}` : ''}</small><strong>${fmtDataBR(parseISODate(apuracao.intervaloCampanha.inicio))} → ${fmtDataBR(fimCampanha)}</strong></article>
      <span>${icon('arrow-left-right')}</span>
      <article><small>Período anterior equivalente</small><strong>${fmtDataBR(parseISODate(apuracao.intervaloAnterior.inicio))} → ${fmtDataBR(fimAnterior)}</strong></article>
      <article><small>Escopo consultado</small><strong>${apuracao.totalProdutosEscopo || 0} produtos · ${apuracao.diagnostico?.vendedores || 0} vendedores ativos</strong></article>
    </div>
    <div class="cs-results-kpis">
      ${statusMetaHtml(apuracao.metaColetiva)}
      <article class="cs-result-kpi"><small>Faturamento da campanha</small><strong>${fmtMoney(totais.faturamentoCampanha)}</strong><span>Anterior: ${fmtMoney(totais.faturamentoAnterior)} · ${fmtPct(crescimento(totais.faturamentoCampanha, totais.faturamentoAnterior))}</span></article>
      <article class="cs-result-kpi"><small>Volume da campanha</small><strong>${fmtKg(totais.kgCampanha)}</strong><span>Anterior: ${fmtKg(totais.kgAnterior)} · ${fmtPct(crescimento(totais.kgCampanha, totais.kgAnterior))}</span></article>
      <article class="cs-result-kpi"><small>Positivação líquida</small><strong>${totais.positivacao > 0 ? '+' : ''}${fmtNum(totais.positivacao)}</strong><span>Saldo agregado de clientes por vendedor</span></article>
    </div>
    <div class="cs-apuration-heading"><div><span>${icon(metricaInfo.icon)}</span><div><small>Performance e ranking da campanha</small><strong>${esc(tituloMetricas)}</strong></div></div><span>${classificados.length} classificado(s)</span></div>
    <div class="table-wrap"><table class="data-table cs-ranking-table cs-performance-table"><thead><tr><th>#</th><th>Vendedor</th><th>Critérios do ranking</th><th>R$ campanha</th><th>R$ anterior</th><th>Δ R$</th><th>KG campanha</th><th>KG anterior</th><th>Δ KG</th><th>Clientes campanha</th><th>Clientes anterior</th><th>Positivação</th><th>Mix</th><th>Status</th></tr></thead><tbody>
      ${todosOrdenados.map((resultado, indice) => {
        const faltantes = (resultado.mixDetalhes || []).filter((item) => item.obrigatoria && !item.atingida).map((item) => item.nome).join(', ');
        const classificado = classificadosIds.has(resultado.representanteId);
        const status = !resultado.elegivel ? (resultado.metaIndividualConfigurada && !resultado.metaIndividualBatida ? 'Meta individual não atingida' : 'Inelegível') : metaColetivaBloqueiaPremiacao ? 'Aguardando meta coletiva' : classificado ? 'Classificado' : 'Elegível';
        const statusClass = !resultado.elegivel ? 'nao' : classificado ? 'sim' : 'warn';
        return `<tr><td><span class="rank-pos">${indice + 1}</span></td><td><strong>${esc(resultado.nome)}</strong></td><td><div class="cs-multi-metrics-cell">${valorMetricasPrincipais(resultado, metricas)}</div></td><td>${fmtMoney(resultado.faturamentoCampanha)}</td><td>${fmtMoney(resultado.faturamentoAnterior)}</td><td>${fmtPct(resultado.crescimentoFaturamento)}</td><td>${fmtKg(resultado.kgCampanha)}</td><td>${fmtKg(resultado.kgAnterior)}</td><td>${fmtPct(resultado.crescimentoKg)}</td><td>${fmtNum(resultado.clientesCampanha)}</td><td>${fmtNum(resultado.clientesAnterior)}</td><td><strong class="${resultado.positivacao >= 0 ? 'cs-positive' : 'cs-negative'}">${resultado.positivacao > 0 ? '+' : ''}${fmtNum(resultado.positivacao)}</strong></td><td title="${esc(faltantes ? `Faltam: ${faltantes}` : 'Todas as categorias obrigatórias foram cumpridas')}"><strong>${fmtNum(resultado.mixCategoriasAtingidas)}/${fmtNum(resultado.mixCategoriasTotal)}</strong><small class="cs-cell-sub">${fmtPct(resultado.mix)}</small></td><td><span class="badge-eleg ${statusClass}">${status}</span></td></tr>`;
      }).join('') || '<tr><td colspan="14" class="cs-table-empty">Nenhuma venda encontrada no escopo e período selecionados.</td></tr>'}
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

  if (typeof ROUTES !== 'undefined') ROUTES.rankings = () => renderApuracao();


  /* ═══════════════════════════════════════════════════════════════
     MODAL PROGRESSIVO 3.6.5
     Abre primeiro, monta uma etapa por vez e nunca consulta SQL no clique.
     ═══════════════════════════════════════════════════════════════ */
  const csModalLazy = {
    token: 0,
    campanha: null,
    regras: [],
    regrasProduto: [],
    carregadas: new Set(),
  };

  function csCampanhaVazia() {
    return {
      id: null,
      nome: '',
      fornecedor: '',
      fornecedorId: null,
      dataInicio: '',
      dataFim: '',
      periodoAnteriorInicio: '',
      periodoAnteriorFim: '',
      descricao: '',
      ativa: true,
      bannerUrl: '',
      cor: '#1a4d2e',
      premiacoes: '',
      tipos: [],
      metaModo: 'NENHUMA',
      metricasPrincipais: ['pontosFinal'],
      metricaPrincipal: 'pontosFinal',
      quantidadeClassificados: 5,
      tipoResultado: 'TOP_N_ENTRE_ELEGIVEIS',
      desempate: (typeof DESEMPATE_CAMPOS !== 'undefined' ? DESEMPATE_CAMPOS : DESEMPATES_EXTRA).map((item) => item.valor),
    };
  }

  function csEditorShell() {
    const labels = ['Informações gerais', 'Regras e metas', 'Produtos e categorias', 'Desempate'];
    return `<div class="wizard-steps" id="campTabs">
      ${labels.map((label, index) => `<div class="wizard-step ${index === 0 ? 'active' : ''}" data-tab="${index}" data-step="${String(index + 1).padStart(2, '0')}" onclick="switchCampTab(${index})">${label}</div>`).join('')}
    </div>
    ${labels.map((_, index) => `<div id="campTab${index}" data-lazy-tab="${index}" style="${index ? 'display:none;' : ''}">${index === 0 ? '<div class="cs-modal-boot"><i data-lucide="loader-circle"></i><strong>Preparando o formulário...</strong></div>' : ''}</div>`).join('')}`;
  }

  function csAplicarChromeEditor() {
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
    const header = modal?.querySelector('.modal-hdr');
    if (header && !header.querySelector('.editor-progress')) {
      header.insertAdjacentHTML('beforeend', '<div class="editor-progress"><span id="campaignEditorProgress" style="width:25%"></span></div>');
    }
  }

  function csAtualizarProgressoEtapa(index) {
    const bar = document.getElementById('campaignEditorProgress');
    if (bar) bar.style.width = `${((Number(index) + 1) / 4) * 100}%`;
    document.querySelectorAll('#campTabs .wizard-step').forEach((step, position) => {
      step.classList.toggle('active', position === Number(index));
      step.classList.toggle('done', position < Number(index));
    });
  }

  function csRenderizarEtapa(index) {
    const alvo = document.getElementById(`campTab${index}`);
    if (!alvo || csModalLazy.carregadas.has(Number(index))) return;
    const campanha = csModalLazy.campanha || csCampanhaVazia();

    if (Number(index) === 0) {
      alvo.innerHTML = campTabInfoHtml(campanha);
      csModalLazy.carregadas.add(0);
      atualizarPreviewPeriodo();
      // O modal já está pintado. Só agora instalamos e consultamos fornecedores.
      requestAnimationFrame(() => {
        instalarSeletorFornecedor();
        atualizarIcones();
      });
      return;
    }

    if (Number(index) === 1) {
      alvo.innerHTML = campTabRegrasHtml(csModalLazy.regras || []);
      csModalLazy.carregadas.add(1);
      window.csAtualizarTipoResultado?.();
      window.csSelecionarModoMeta?.(document.getElementById('cf_metaModo')?.value || campanha.metaModo || 'NENHUMA');
      document.querySelectorAll('#regrasList [data-row]').forEach(window.csAtualizarRegra);
      atualizarIcones();
      return;
    }

    if (Number(index) === 2) {
      alvo.innerHTML = campTabRegrasProdutoHtml(csModalLazy.regrasProduto || []);
      csModalLazy.carregadas.add(2);
      Promise.resolve(window.abrirDndProdutos?.()).finally(() => window.cbAtivarEtapaProdutos?.());
      atualizarIcones();
      return;
    }

    alvo.innerHTML = campTabDesempateHtml(campanha.desempate);
    csModalLazy.carregadas.add(3);
    const lista = document.getElementById('desempateList');
    if (window.Sortable && lista) Sortable.create(lista, { handle: '.handle', animation: 150 });
    window.csAtualizarDesempates?.();
    atualizarIcones();
  }

  async function csCarregarDadosEditor(id, token) {
    try {
      if (!id) {
        csModalLazy.campanha = csCampanhaVazia();
        csModalLazy.regras = [];
        csModalLazy.regrasProduto = [];
      } else {
        const [campanha, regras, regrasProduto] = await Promise.all([
          DB.get('campanhas', id),
          DB.getAll('regras'),
          DB.getAll('regrasProduto'),
        ]);
        if (token !== csModalLazy.token) return;
        csModalLazy.campanha = campanha || csCampanhaVazia();
        csModalLazy.regras = (regras || []).filter((item) => item.campanhaId === id);
        csModalLazy.regrasProduto = (regrasProduto || []).filter((item) => item.campanhaId === id);
      }
      if (token !== csModalLazy.token) return;
      _campanhaModalState = {
        campanha: csModalLazy.campanha,
        regras: csModalLazy.regras,
        regrasProduto: csModalLazy.regrasProduto,
      };
      csRenderizarEtapa(0);
    } catch (erro) {
      const alvo = document.getElementById('campTab0');
      if (alvo) alvo.innerHTML = `<div class="cs-supplier-error"><strong>Não foi possível preparar a campanha.</strong><span>${esc(erro.message || erro)}</span></div>`;
    }
  }

  window.openCampanhaModal = function abrirCampanhaInstantanea(id) {
    const token = ++csModalLazy.token;
    csModalLazy.campanha = null;
    csModalLazy.regras = [];
    csModalLazy.regrasProduto = [];
    csModalLazy.carregadas = new Set();

    // Esta chamada só injeta a casca pequena do modal. Nenhuma consulta acontece aqui.
    openModal(id ? 'Editar Campanha' : 'Nova Campanha', csEditorShell(),
      `<button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="csSalvarCampanhaProgressiva()">Salvar Campanha</button>`, true);
    csAplicarChromeEditor();
    csAtualizarProgressoEtapa(0);
    atualizarIcones();

    // Dá ao navegador um frame para desenhar o modal antes de montar o formulário.
    requestAnimationFrame(() => setTimeout(() => csCarregarDadosEditor(id, token), 0));
  };

  window.switchCampTab = function trocarEtapaProgressiva(index) {
    const numero = Number(index) || 0;
    for (let position = 0; position < 4; position++) {
      const painel = document.getElementById(`campTab${position}`);
      if (painel) painel.style.display = position === numero ? '' : 'none';
    }
    csAtualizarProgressoEtapa(numero);
    // Renderiza a etapa depois de o clique ter sido visualmente respondido.
    requestAnimationFrame(() => csRenderizarEtapa(numero));
  };

  window.csSalvarCampanhaProgressiva = async function salvarCampanhaProgressiva() {
    // Garante os controles necessários sem consultar produtos ou SQL.
    [0, 1, 2, 3].forEach(csRenderizarEtapa);
    await Promise.resolve();
    return window.salvarCampanha();
  };

  const observerMetas = new MutationObserver(() => {
    if (document.getElementById('cf_metricasPrincipais')) { renderSequenciaRanking(); window.csSelecionarModoMeta(document.getElementById('cf_metaModo')?.value || 'NENHUMA'); }
  });
  document.addEventListener('DOMContentLoaded', () => { atualizarIcones(); observerMetas.observe(document.body, { childList: true, subtree: true }); });
})();
