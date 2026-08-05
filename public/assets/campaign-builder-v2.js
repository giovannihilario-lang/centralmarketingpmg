/* global CAMPOS_METRICA, DB, normalizeKey, showToast */
(function () {
  const CORES = ['#2d7a4f', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#0891b2', '#7c3aed'];

  const state = {
    grupos: [],
    catalogo: [],
    filtros: null,
    buscaTimer: null,
    carregando: false,
  };

  function id() {
    return 'grp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  }

  function esc(valor) {
    return String(valor ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function numero(valor) {
    const n = Number(valor);
    return Number.isFinite(n) ? n : 0;
  }

  function criarGrupo(parcial = {}) {
    return {
      id: parcial.id || id(),
      nome: parcial.nome || 'Nova categoria',
      cor: parcial.cor || CORES[state.grupos.length % CORES.length],
      criterio: parcial.criterio || 'SEM_PONTOS',
      valorPontos: numero(parcial.valorPontos),
      produtos: Array.isArray(parcial.produtos) ? parcial.produtos : [],
    };
  }

  function regraParaCriterio(regra) {
    if (numero(regra.pontosPorKg)) return { criterio: 'PONTOS_KG', valorPontos: numero(regra.pontosPorKg) };
    if (numero(regra.pontosPorUnidade)) return { criterio: 'PONTOS_PC', valorPontos: numero(regra.pontosPorUnidade) };
    if (numero(regra.pontosPorReal)) return { criterio: 'PONTOS_REAL', valorPontos: numero(regra.pontosPorReal) };
    if (numero(regra.pontosFixos)) return { criterio: 'PONTOS_FIXOS', valorPontos: numero(regra.pontosFixos) };
    return { criterio: 'SEM_PONTOS', valorPontos: 0 };
  }

  function hidratarGrupos(regrasProduto) {
    const porGrupo = new Map();

    (regrasProduto || [])
      .filter((regra) => regra.escopo === 'produto')
      .forEach((regra) => {
        const grupoId = regra.grupoId || 'grupo_principal';
        if (!porGrupo.has(grupoId)) {
          const pontos = regraParaCriterio(regra);
          porGrupo.set(grupoId, criarGrupo({
            id: grupoId,
            nome: regra.grupoNome || 'Produtos participantes',
            cor: regra.grupoCor || CORES[porGrupo.size % CORES.length],
            ...pontos,
          }));
        }

        porGrupo.get(grupoId).produtos.push({
          id: String(regra.valor),
          codigo: String(regra.valor),
          nome: regra.nomeProduto || String(regra.valor),
          fornecedor: regra.fornecedor || '',
          grupo: regra.grupoProduto || '',
          subgrupo: regra.subgrupoProduto || '',
          unidade: regra.unidadeProduto || '',
        });
      });

    state.grupos = [...porGrupo.values()];
    if (!state.grupos.length) {
      state.grupos = [criarGrupo({ nome: 'Produtos participantes' })];
    }
  }

  function produtoSelecionado(codigo) {
    const chave = String(codigo);
    for (const grupo of state.grupos) {
      if (grupo.produtos.some((produto) => String(produto.codigo) === chave)) return grupo;
    }
    return null;
  }

  function removerProdutoDeTodos(codigo) {
    const chave = String(codigo);
    state.grupos.forEach((grupo) => {
      grupo.produtos = grupo.produtos.filter((produto) => String(produto.codigo) !== chave);
    });
  }

  function totalProdutos() {
    return state.grupos.reduce((total, grupo) => total + grupo.produtos.length, 0);
  }

  function montarResumo() {
    const comPontos = state.grupos.filter((grupo) => grupo.criterio !== 'SEM_PONTOS').length;
    return `
      <div class="cb-summary">
        <span><b>${state.grupos.length}</b> categoria(s)</span>
        <span><b>${totalProdutos()}</b> produto(s) participante(s)</span>
        <span><b>${comPontos}</b> categoria(s) com pontuação</span>
        <span>Mix calculado sobre os produtos selecionados</span>
      </div>`;
  }

  function htmlProdutoCatalogo(produto) {
    const selecionado = produtoSelecionado(produto.codigo);
    return `
      <div class="cb-product ${selecionado ? 'is-selected' : ''}"
           draggable="true"
           data-codigo="${esc(produto.codigo)}"
           ondragstart="cbDragCatalogo(event, '${esc(produto.codigo)}')">
        <span class="cb-product-code">${esc(produto.codigo)}</span>
        <div class="cb-product-main">
          <div class="cb-product-name" title="${esc(produto.nome)}">${esc(produto.nome)}</div>
          <div class="cb-product-meta">${esc(produto.fornecedor || 'Sem fornecedor')} · ${esc(produto.grupo || 'Sem grupo')} · ${esc(produto.unidade || 'Sem unidade')}</div>
        </div>
        ${selecionado ? `<span class="cb-selected-badge" title="${esc(selecionado.nome)}">${esc(selecionado.nome)}</span>` : ''}
      </div>`;
  }

  function htmlProdutoGrupo(produto, grupoId) {
    return `
      <div class="cb-group-product"
           draggable="true"
           data-codigo="${esc(produto.codigo)}"
           ondragstart="cbDragSelecionado(event, '${esc(produto.codigo)}', '${esc(grupoId)}')">
        <span class="handle">⠿⠿</span>
        <span class="cb-product-code">${esc(produto.codigo)}</span>
        <div class="cb-product-main">
          <div class="cb-product-name" title="${esc(produto.nome)}">${esc(produto.nome)}</div>
          <div class="cb-product-meta">${esc(produto.fornecedor || '')}${produto.grupo ? ` · ${esc(produto.grupo)}` : ''}</div>
        </div>
        <button type="button" class="cb-remove" title="Remover produto" onclick="cbRemoverProduto('${esc(produto.codigo)}')">✕</button>
      </div>`;
  }

  function htmlGrupo(grupo, indice) {
    const produtos = grupo.produtos.length
      ? grupo.produtos.map((produto) => htmlProdutoGrupo(produto, grupo.id)).join('')
      : '<div class="cb-empty-drop">Arraste produtos do catálogo para esta categoria</div>';

    return `
      <section class="cb-group" data-grupo-id="${esc(grupo.id)}" style="border-left-color:${esc(grupo.cor)}"
               ondragover="cbGrupoDragOver(event)"
               ondragleave="cbGrupoDragLeave(event)"
               ondrop="cbDropGrupo(event, '${esc(grupo.id)}')">
        <div class="cb-group-head">
          <span class="handle">⠿⠿</span>
          <input class="cb-group-name" value="${esc(grupo.nome)}" oninput="cbAtualizarGrupo('${esc(grupo.id)}', 'nome', this.value)">
          <span class="cb-group-count">${grupo.produtos.length} produto(s)</span>
          <input type="color" value="${esc(grupo.cor)}" title="Cor da categoria" style="width:31px;height:27px;padding:1px;border:0;background:transparent;" onchange="cbAtualizarGrupo('${esc(grupo.id)}', 'cor', this.value)">
          ${state.grupos.length > 1 ? `<button type="button" class="cb-remove" title="Excluir categoria" onclick="cbExcluirGrupo('${esc(grupo.id)}')">✕</button>` : ''}
        </div>
        <div class="cb-group-config">
          <select onchange="cbAtualizarGrupo('${esc(grupo.id)}', 'criterio', this.value)">
            <option value="SEM_PONTOS" ${grupo.criterio === 'SEM_PONTOS' ? 'selected' : ''}>Participa do filtro e do mix</option>
            <option value="PONTOS_PC" ${grupo.criterio === 'PONTOS_PC' ? 'selected' : ''}>Pontos por peça/unidade</option>
            <option value="PONTOS_KG" ${grupo.criterio === 'PONTOS_KG' ? 'selected' : ''}>Pontos por quilo</option>
            <option value="PONTOS_REAL" ${grupo.criterio === 'PONTOS_REAL' ? 'selected' : ''}>Pontos por real faturado</option>
            <option value="PONTOS_FIXOS" ${grupo.criterio === 'PONTOS_FIXOS' ? 'selected' : ''}>Pontos fixos por item de venda</option>
          </select>
          <input type="number" min="0" step="0.01" value="${grupo.valorPontos || ''}"
                 ${grupo.criterio === 'SEM_PONTOS' ? 'disabled' : ''}
                 placeholder="Pontos"
                 oninput="cbAtualizarGrupo('${esc(grupo.id)}', 'valorPontos', this.value)">
          <div style="display:flex;align-items:center;font-size:10px;color:var(--gray-text);padding:0 4px;">
            ${grupo.criterio === 'PONTOS_PC' ? 'por PC' : grupo.criterio === 'PONTOS_KG' ? 'por KG' : grupo.criterio === 'PONTOS_REAL' ? 'por R$' : grupo.criterio === 'PONTOS_FIXOS' ? 'por linha' : 'sem pontos'}
          </div>
        </div>
        <div class="cb-group-products">${produtos}</div>
      </section>`;
  }

  function renderizarCatalogo() {
    const alvo = document.getElementById('cbCatalogoProdutos');
    if (!alvo) return;
    if (state.carregando) {
      alvo.innerHTML = '<div class="cb-loading">Carregando produtos do SQL Server...</div>';
      return;
    }
    alvo.innerHTML = state.catalogo.length
      ? state.catalogo.map(htmlProdutoCatalogo).join('')
      : '<div class="cb-empty">Nenhum produto encontrado com esses filtros.</div>';
  }

  function renderizarGrupos() {
    const alvo = document.getElementById('cbGruposCampanha');
    const resumo = document.getElementById('cbResumoCampanha');
    if (resumo) resumo.innerHTML = montarResumo();
    if (!alvo) return;
    alvo.innerHTML = state.grupos.map(htmlGrupo).join('');

    if (window.Sortable) {
      Sortable.create(alvo, {
        handle: '.cb-group-head .handle',
        animation: 140,
        onEnd(evento) {
          const [movido] = state.grupos.splice(evento.oldIndex, 1);
          state.grupos.splice(evento.newIndex, 0, movido);
          renderizarGrupos();
        },
      });
    }
  }

  async function carregarFiltros() {
    if (state.filtros) return state.filtros;
    const resposta = await fetch('/api/campanhas-data?recurso=filtros-produtos');
    const dados = await resposta.json();
    if (!resposta.ok) throw new Error(dados.erro || 'Falha ao carregar filtros de produtos');
    state.filtros = dados;
    return dados;
  }

  function preencherSelect(idElemento, valores, rotulo) {
    const elemento = document.getElementById(idElemento);
    if (!elemento) return;
    const valorAtual = elemento.value;
    elemento.innerHTML = `<option value="">${rotulo}</option>` +
      (valores || []).map((valor) => `<option value="${esc(valor)}">${esc(valor)}</option>`).join('');
    if ([...elemento.options].some((opcao) => opcao.value === valorAtual)) elemento.value = valorAtual;
  }

  async function buscarProdutos() {
    const alvo = document.getElementById('cbCatalogoProdutos');
    if (!alvo) return;
    state.carregando = true;
    renderizarCatalogo();

    try {
      const parametros = new URLSearchParams({
        recurso: 'produtos',
        busca: document.getElementById('cbBuscaProduto')?.value || '',
        fornecedor: document.getElementById('cbFiltroFornecedor')?.value || '',
        grupo: document.getElementById('cbFiltroGrupo')?.value || '',
        subgrupo: document.getElementById('cbFiltroSubgrupo')?.value || '',
        status: document.getElementById('cbFiltroStatus')?.value || '',
        limite: '250',
      });

      const resposta = await fetch('/api/campanhas-data?' + parametros.toString());
      const dados = await resposta.json();
      if (!resposta.ok) throw new Error(dados.erro || 'Falha ao carregar produtos');

      state.catalogo = dados.map((produto) => ({
        ...produto,
        id: String(produto.id),
        codigo: String(produto.codigo),
      }));
    } catch (erro) {
      console.error('[campaign-builder] produtos', erro);
      state.catalogo = [];
      if (typeof showToast === 'function') showToast('Erro ao consultar produtos: ' + erro.message, true);
    } finally {
      state.carregando = false;
      renderizarCatalogo();
    }
  }

  window.campTabRegrasProdutoHtml = function (regrasProduto) {
    hidratarGrupos(regrasProduto);
    state.catalogo = [];
    return `
      <div class="section-title">
        Produtos, categorias e pontuação
        <button type="button" class="btn btn-ghost btn-sm" onclick="cbAdicionarGrupo()">+ Nova categoria</button>
      </div>
      <div class="cb-help">
        Arraste os produtos do catálogo para categorias personalizadas. Cada categoria pode apenas filtrar a campanha e compor o mix, ou gerar pontos por peça, quilo, faturamento ou item de venda. Um produto fica em uma categoria por vez, evitando pontuação duplicada.
      </div>
      <div id="cbResumoCampanha"></div>
      <div class="cb-layout">
        <aside class="cb-panel">
          <div class="cb-panel-title">
            <span>Catálogo do SQL Server</span>
            <button type="button" class="btn btn-ghost btn-sm" onclick="cbBuscarProdutos(true)">Atualizar</button>
          </div>
          <div class="cb-filters">
            <input class="cb-wide" id="cbBuscaProduto" placeholder="Buscar por ID, produto, fornecedor ou fabricante" oninput="cbAgendarBusca()">
            <select id="cbFiltroFornecedor" onchange="cbBuscarProdutos()"><option value="">Todos os fornecedores</option></select>
            <select id="cbFiltroGrupo" onchange="cbBuscarProdutos()"><option value="">Todos os grupos</option></select>
            <select id="cbFiltroSubgrupo" onchange="cbBuscarProdutos()"><option value="">Todos os subgrupos</option></select>
            <select id="cbFiltroStatus" onchange="cbBuscarProdutos()"><option value="">Todos os status</option></select>
          </div>
          <div id="cbCatalogoProdutos" class="cb-catalog"><div class="cb-loading">Abra esta etapa para consultar os produtos.</div></div>
        </aside>
        <section class="cb-panel">
          <div class="cb-panel-title">
            <span>Categorias da campanha</span>
            <span style="font-size:10px;color:var(--gray-text);font-weight:500;">Arraste também entre categorias</span>
          </div>
          <div id="cbGruposCampanha" class="cb-workspace"></div>
        </section>
      </div>`;
  };

  window.abrirDndProdutos = async function () {
    renderizarGrupos();
    try {
      const filtros = await carregarFiltros();
      preencherSelect('cbFiltroFornecedor', filtros.fornecedores, 'Todos os fornecedores');
      preencherSelect('cbFiltroGrupo', filtros.grupos, 'Todos os grupos');
      preencherSelect('cbFiltroSubgrupo', filtros.subgrupos, 'Todos os subgrupos');
      preencherSelect('cbFiltroStatus', filtros.status, 'Todos os status');

      const fornecedorCampanha = document.getElementById('cf_fornecedor')?.value?.trim();
      const seletorFornecedor = document.getElementById('cbFiltroFornecedor');
      if (fornecedorCampanha && seletorFornecedor && [...seletorFornecedor.options].some((opcao) => normalizeKey(opcao.value) === normalizeKey(fornecedorCampanha))) {
        const opcao = [...seletorFornecedor.options].find((item) => normalizeKey(item.value) === normalizeKey(fornecedorCampanha));
        seletorFornecedor.value = opcao.value;
      }
      await buscarProdutos();
    } catch (erro) {
      console.error('[campaign-builder] filtros', erro);
      if (typeof showToast === 'function') showToast('Não foi possível carregar o catálogo: ' + erro.message, true);
    }
  };

  window.cbBuscarProdutos = buscarProdutos;
  window.cbAgendarBusca = function () {
    clearTimeout(state.buscaTimer);
    state.buscaTimer = setTimeout(buscarProdutos, 280);
  };

  window.cbAdicionarGrupo = function () {
    state.grupos.push(criarGrupo({ nome: `Categoria ${state.grupos.length + 1}` }));
    renderizarGrupos();
  };

  window.cbAtualizarGrupo = function (grupoId, campo, valor) {
    const grupo = state.grupos.find((item) => item.id === grupoId);
    if (!grupo) return;
    grupo[campo] = campo === 'valorPontos' ? numero(valor) : valor;
    if (campo === 'criterio' || campo === 'cor') renderizarGrupos();
  };

  window.cbExcluirGrupo = function (grupoId) {
    const grupo = state.grupos.find((item) => item.id === grupoId);
    if (!grupo) return;
    const mensagem = grupo.produtos.length
      ? `Excluir a categoria “${grupo.nome}” e retirar ${grupo.produtos.length} produto(s) da campanha?`
      : `Excluir a categoria “${grupo.nome}”?`;
    if (!confirm(mensagem)) return;
    state.grupos = state.grupos.filter((item) => item.id !== grupoId);
    if (!state.grupos.length) state.grupos.push(criarGrupo({ nome: 'Produtos participantes' }));
    renderizarGrupos();
    renderizarCatalogo();
  };

  window.cbRemoverProduto = function (codigo) {
    removerProdutoDeTodos(codigo);
    renderizarGrupos();
    renderizarCatalogo();
  };

  window.cbDragCatalogo = function (evento, codigo) {
    const produto = state.catalogo.find((item) => String(item.codigo) === String(codigo));
    if (!produto) return;
    evento.dataTransfer.effectAllowed = 'copyMove';
    evento.dataTransfer.setData('application/json', JSON.stringify({ tipo: 'catalogo', produto }));
  };

  window.cbDragSelecionado = function (evento, codigo, grupoOrigemId) {
    const grupo = state.grupos.find((item) => item.id === grupoOrigemId);
    const produto = grupo?.produtos.find((item) => String(item.codigo) === String(codigo));
    if (!produto) return;
    evento.dataTransfer.effectAllowed = 'move';
    evento.dataTransfer.setData('application/json', JSON.stringify({ tipo: 'selecionado', grupoOrigemId, produto }));
  };

  window.cbGrupoDragOver = function (evento) {
    evento.preventDefault();
    evento.currentTarget.classList.add('is-over');
  };

  window.cbGrupoDragLeave = function (evento) {
    if (!evento.currentTarget.contains(evento.relatedTarget)) evento.currentTarget.classList.remove('is-over');
  };

  window.cbDropGrupo = function (evento, grupoDestinoId) {
    evento.preventDefault();
    evento.currentTarget.classList.remove('is-over');
    let dados;
    try {
      dados = JSON.parse(evento.dataTransfer.getData('application/json') || '{}');
    } catch {
      return;
    }
    if (!dados.produto?.codigo) return;

    const destino = state.grupos.find((grupo) => grupo.id === grupoDestinoId);
    if (!destino) return;

    removerProdutoDeTodos(dados.produto.codigo);
    destino.produtos.push({ ...dados.produto, codigo: String(dados.produto.codigo), id: String(dados.produto.id || dados.produto.codigo) });
    renderizarGrupos();
    renderizarCatalogo();
  };

  window.coletarRegrasProdutoBuilder = function () {
    const regras = [];
    state.grupos.forEach((grupo, ordemGrupo) => {
      grupo.produtos.forEach((produto, ordemProduto) => {
        const regra = {
          escopo: 'produto',
          valor: String(produto.codigo),
          nomeProduto: produto.nome || String(produto.codigo),
          fornecedor: produto.fornecedor || '',
          grupoProduto: produto.grupo || '',
          subgrupoProduto: produto.subgrupo || '',
          unidadeProduto: produto.unidade || '',
          grupoId: grupo.id,
          grupoNome: grupo.nome.trim() || 'Categoria sem nome',
          grupoCor: grupo.cor,
          criterio: grupo.criterio,
          ordemGrupo,
          ordemProduto,
          pontosPorKg: grupo.criterio === 'PONTOS_KG' ? numero(grupo.valorPontos) : 0,
          pontosPorUnidade: grupo.criterio === 'PONTOS_PC' ? numero(grupo.valorPontos) : 0,
          pontosPorReal: grupo.criterio === 'PONTOS_REAL' ? numero(grupo.valorPontos) : 0,
          pontosFixos: grupo.criterio === 'PONTOS_FIXOS' ? numero(grupo.valorPontos) : 0,
          multiplicador: 1,
          ativa: true,
        };
        regras.push(regra);
      });
    });
    return regras;
  };

  // Amplia o motor já existente sem criar uma lógica paralela.
  if (typeof CAMPOS_METRICA !== 'undefined' && !CAMPOS_METRICA.some((campo) => campo.valor === 'saldoClientes')) {
    CAMPOS_METRICA.push({ valor: 'saldoClientes', label: 'Saldo de clientes vs. período anterior' });
  }

  // Pontuação por produto, categoria configurada e unidade escolhida.
  window.calcularPontosProdutos = function (vendasRepresentante, regrasProduto) {
    let total = 0;
    const regrasPorProduto = new Map(
      (regrasProduto || [])
        .filter((regra) => regra.ativa !== false && regra.escopo === 'produto')
        .map((regra) => [String(regra.valor), regra])
    );

    (vendasRepresentante || []).forEach((venda) => {
      const codigo = String(venda.codigo ?? venda.produtoId ?? '');
      const regra = regrasPorProduto.get(codigo);
      if (!regra) return;
      const pontos =
        numero(regra.pontosPorKg) * numero(venda.kg) +
        numero(regra.pontosPorUnidade) * numero(venda.unidades ?? venda.qtdePc) +
        numero(regra.pontosPorReal) * numero(venda.valor) +
        numero(regra.pontosFixos);
      total += pontos * (numero(regra.multiplicador) || 1);
    });

    return Math.round(total * 100) / 100;
  };
})();
