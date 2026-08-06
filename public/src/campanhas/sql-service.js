import { getPool, sql, diagnosticoConfiguracaoSql } from '../lib/db.js';

function texto(valor) {
  return String(valor ?? '').trim();
}

function inteiro(valor, padrao = 100, maximo = 1000) {
  const numero = Number.parseInt(valor, 10);
  if (!Number.isFinite(numero) || numero <= 0) return padrao;
  return Math.min(numero, maximo);
}

function listaInteiros(valor, maximo = 1000) {
  const lista = Array.isArray(valor) ? valor : [];
  return [...new Set(lista.map((item) => Number.parseInt(item, 10)).filter(Number.isFinite))].slice(0, maximo);
}

function listaTextos(valor, maximo = 300) {
  const lista = Array.isArray(valor) ? valor : [];
  return [...new Set(lista.map(texto).filter(Boolean))].slice(0, maximo);
}

function dataSql(valor, nome) {
  const limpo = texto(valor).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpo)) throw new Error(`Data inválida em ${nome}`);
  const [ano, mes, dia] = limpo.split('-').map(Number);
  const data = new Date(ano, mes - 1, dia, 12, 0, 0, 0);
  if (Number.isNaN(data.getTime())) throw new Error(`Data inválida em ${nome}`);
  return data;
}

function adicionarListaInteiros(request, nome, valores) {
  if (!valores.length) return '';
  const parametros = valores.map((valor, indice) => {
    const parametro = `${nome}${indice}`;
    request.input(parametro, sql.Int, valor);
    return `@${parametro}`;
  });
  return parametros.join(', ');
}

function adicionarListaTextos(request, nome, valores) {
  if (!valores.length) return '';
  const parametros = valores.map((valor, indice) => {
    const parametro = `${nome}${indice}`;
    request.input(parametro, sql.NVarChar(200), valor);
    return `@${parametro}`;
  });
  return parametros.join(', ');
}

export async function listarFornecedores(query = {}) {
  const pool = await getPool();
  const request = pool.request();
  const busca = texto(query.busca);
  const limite = inteiro(query.limite, 200, 500);
  const filtros = [`NULLIF(LTRIM(RTRIM(p.[Fornecedor])), '') IS NOT NULL`];

  if (busca) {
    request.input('busca', sql.NVarChar(200), `%${busca}%`);
    filtros.push(`(p.[Fornecedor] LIKE @busca OR CAST(p.[ID Fornecedor] AS varchar(30)) LIKE @busca)`);
  }
  request.input('limite', sql.Int, limite);

  const resultado = await request.query(`
    SELECT
      p.[ID Fornecedor] AS id,
      LTRIM(RTRIM(p.[Fornecedor])) AS nome,
      COUNT(DISTINCT p.[ID Produto]) AS totalProdutos,
      COUNT(DISTINCT CASE WHEN UPPER(ISNULL(p.[Status], '')) LIKE '%ATIV%' THEN p.[ID Produto] END) AS produtosAtivos,
      COUNT(DISTINCT NULLIF(LTRIM(RTRIM(p.[Grupo])), '')) AS totalGrupos,
      COUNT(DISTINCT NULLIF(LTRIM(RTRIM(p.[Sub-grupo])), '')) AS totalSubgrupos
    FROM dbo.Produtos p
    WHERE ${filtros.join(' AND ')}
    GROUP BY p.[ID Fornecedor], LTRIM(RTRIM(p.[Fornecedor]))
    ORDER BY LTRIM(RTRIM(p.[Fornecedor]))
    OFFSET 0 ROWS FETCH NEXT @limite ROWS ONLY;
  `);

  return resultado.recordset;
}

export async function listarProdutos(query = {}) {
  const pool = await getPool();
  const request = pool.request();
  const filtros = [];

  const busca = texto(query.busca);
  const fornecedor = texto(query.fornecedor);
  const fornecedorId = Number.parseInt(query.fornecedorId, 10);
  const grupo = texto(query.grupo);
  const subgrupo = texto(query.subgrupo);
  const status = texto(query.status);
  const limite = inteiro(query.limite, 250, 1000);

  if (busca) {
    request.input('busca', sql.NVarChar(200), `%${busca}%`);
    filtros.push(`(
      CAST(p.[ID Produto] AS varchar(30)) LIKE @busca
      OR p.[Produto] LIKE @busca
      OR p.[Fornecedor] LIKE @busca
      OR p.[Grupo] LIKE @busca
      OR p.[Sub-grupo] LIKE @busca
      OR p.[Fabricante] LIKE @busca
    )`);
  }
  if (Number.isFinite(fornecedorId)) {
    request.input('fornecedorId', sql.Int, fornecedorId);
    filtros.push('p.[ID Fornecedor] = @fornecedorId');
  } else if (fornecedor) {
    request.input('fornecedor', sql.NVarChar(200), fornecedor);
    filtros.push('LTRIM(RTRIM(p.[Fornecedor])) = @fornecedor');
  }
  if (grupo) {
    request.input('grupo', sql.NVarChar(200), grupo);
    filtros.push('p.[Grupo] = @grupo');
  }
  if (subgrupo) {
    request.input('subgrupo', sql.NVarChar(200), subgrupo);
    filtros.push('p.[Sub-grupo] = @subgrupo');
  }
  if (status) {
    request.input('status', sql.NVarChar(80), status);
    filtros.push('p.[Status] = @status');
  }

  request.input('limite', sql.Int, limite);
  const whereSql = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';
  const resultado = await request.query(`
    SELECT
      p.[ID Produto] AS id,
      p.[ID Produto] AS codigo,
      p.[Produto] AS nome,
      p.[Unidade] AS unidade,
      p.[Fator Unidade] AS fatorUnidade,
      p.[Master] AS master,
      p.[TipoCarga] AS tipoCarga,
      p.[Grupo] AS grupo,
      p.[Sub-grupo] AS subgrupo,
      p.[ID Fornecedor] AS fornecedorId,
      LTRIM(RTRIM(p.[Fornecedor])) AS fornecedor,
      p.[Fabricante] AS fabricante,
      p.[Status] AS status
    FROM dbo.Produtos p
    ${whereSql}
    ORDER BY p.[Grupo], p.[Produto]
    OFFSET 0 ROWS FETCH NEXT @limite ROWS ONLY;
  `);
  return resultado.recordset;
}

export async function listarFiltrosProdutos(query = {}) {
  const pool = await getPool();
  const fornecedor = texto(query.fornecedor);
  const fornecedorId = Number.parseInt(query.fornecedorId, 10);

  const filtro = [];
  const aplicarFornecedor = (request) => {
    if (Number.isFinite(fornecedorId)) {
      request.input('fornecedorId', sql.Int, fornecedorId);
      filtro.push('[ID Fornecedor] = @fornecedorId');
    } else if (fornecedor) {
      request.input('fornecedor', sql.NVarChar(200), fornecedor);
      filtro.push('LTRIM(RTRIM([Fornecedor])) = @fornecedor');
    }
  };

  const consultar = async (coluna) => {
    const request = pool.request();
    filtro.length = 0;
    aplicarFornecedor(request);
    filtro.push(`NULLIF(LTRIM(RTRIM(${coluna})), '') IS NOT NULL`);
    return request.query(`
      SELECT DISTINCT LTRIM(RTRIM(${coluna})) AS valor
      FROM dbo.Produtos
      WHERE ${filtro.join(' AND ')}
      ORDER BY LTRIM(RTRIM(${coluna}));
    `);
  };

  const [grupos, subgrupos, status] = await Promise.all([
    consultar('[Grupo]'),
    consultar('[Sub-grupo]'),
    consultar('[Status]'),
  ]);

  const valores = (resultado) => resultado.recordset.map((item) => item.valor);
  return {
    fornecedores: fornecedor ? [fornecedor] : [],
    grupos: valores(grupos),
    subgrupos: valores(subgrupos),
    status: valores(status),
  };
}

export async function listarVendedores(query = {}) {
  const pool = await getPool();
  const request = pool.request();
  const busca = texto(query.busca);
  const somenteAtivos = texto(query.ativos).toLowerCase() !== 'false';
  const diasHistorico = inteiro(query.diasHistorico, 365, 3650);
  request.input('diasHistorico', sql.Int, diasHistorico);

  const filtros = [];
  if (busca) {
    request.input('busca', sql.NVarChar(200), `%${busca}%`);
    filtros.push('c.vendedor LIKE @busca');
  }
  if (somenteAtivos) filtros.push('c.clientesAtivos > 0');
  const whereSql = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  const resultado = await request.query(`
    WITH Carteira AS (
      SELECT
        LTRIM(RTRIM([Vendedor])) AS vendedor,
        COUNT(DISTINCT [ID Cliente]) AS clientesCarteira,
        COUNT(DISTINCT CASE
          WHEN UPPER(LTRIM(RTRIM(ISNULL([Status], '')))) LIKE '%ATIV%'
          THEN [ID Cliente]
        END) AS clientesAtivos
      FROM dbo.Clientes
      WHERE NULLIF(LTRIM(RTRIM([Vendedor])), '') IS NOT NULL
      GROUP BY LTRIM(RTRIM([Vendedor]))
    ),
    HistoricoRecente AS (
      SELECT
        LTRIM(RTRIM([Vendedor])) AS vendedor,
        COUNT(DISTINCT [ID Cliente]) AS clientesHistoricos,
        COUNT(DISTINCT [ID Pedido de Venda]) AS pedidosHistoricos,
        MAX([Data]) AS ultimaVenda,
        SUM(ISNULL([Valor Total], 0)) AS faturamentoHistorico
      FROM dbo.Vendas
      WHERE
        NULLIF(LTRIM(RTRIM([Vendedor])), '') IS NOT NULL
        AND [Data] >= DATEADD(DAY, -@diasHistorico, GETDATE())
      GROUP BY LTRIM(RTRIM([Vendedor]))
    )
    SELECT
      c.vendedor,
      c.clientesCarteira,
      c.clientesAtivos,
      ISNULL(h.clientesHistoricos, 0) AS clientesHistoricos,
      ISNULL(h.pedidosHistoricos, 0) AS pedidosHistoricos,
      h.ultimaVenda,
      ISNULL(h.faturamentoHistorico, 0) AS faturamentoHistorico,
      CAST(CASE WHEN c.clientesAtivos > 0 THEN 1 ELSE 0 END AS bit) AS ativo,
      'dbo.Clientes.[Status]' AS criterioAtividade
    FROM Carteira c
    LEFT JOIN HistoricoRecente h ON h.vendedor = c.vendedor
    ${whereSql}
    ORDER BY c.vendedor;
  `);
  return resultado.recordset;
}

function montarFiltroEscopo(request, payload, prefixo = 'p') {
  const filtros = [];
  const produtos = listaInteiros(payload.produtos, 1000);
  const fornecedorId = Number.parseInt(payload.fornecedorId, 10);
  const fornecedor = texto(payload.fornecedor);

  if (produtos.length) {
    const lista = adicionarListaInteiros(request, 'produto', produtos);
    filtros.push(`${prefixo}.[ID Produto] IN (${lista})`);
  } else if (Number.isFinite(fornecedorId)) {
    request.input('fornecedorId', sql.Int, fornecedorId);
    filtros.push(`${prefixo}.[ID Fornecedor] = @fornecedorId`);
  } else if (fornecedor) {
    request.input('fornecedor', sql.NVarChar(200), fornecedor);
    filtros.push(`LTRIM(RTRIM(${prefixo}.[Fornecedor])) = @fornecedor`);
  } else {
    throw new Error('Selecione um fornecedor ou ao menos um produto para apurar');
  }

  return { filtros, produtos };
}

export async function consultarApuracao(payload = {}) {
  const inicioExecucao = Date.now();
  const campanhaInicio = dataSql(payload.campanhaInicio, 'campanhaInicio');
  const campanhaFim = dataSql(payload.campanhaFim, 'campanhaFim');
  const anteriorInicio = dataSql(payload.anteriorInicio, 'anteriorInicio');
  const anteriorFim = dataSql(payload.anteriorFim, 'anteriorFim');

  if (campanhaFim <= campanhaInicio) throw new Error('O fechamento da campanha precisa ser posterior ao início');
  if (anteriorFim <= anteriorInicio) throw new Error('O período anterior está inválido');

  const pool = await getPool();
  const request = pool.request();
  request.input('campanhaInicio', sql.DateTime2, campanhaInicio);
  request.input('campanhaFim', sql.DateTime2, campanhaFim);
  request.input('anteriorInicio', sql.DateTime2, anteriorInicio);
  request.input('anteriorFim', sql.DateTime2, anteriorFim);

  const { filtros: filtrosEscopo, produtos } = montarFiltroEscopo(request, payload, 'p');
  const vendedores = listaTextos(payload.vendedores);
  if (vendedores.length) {
    const lista = adicionarListaTextos(request, 'vendedor', vendedores);
    filtrosEscopo.push(`LTRIM(RTRIM(v.[Vendedor])) IN (${lista})`);
  }

  const resultado = await request.query(`
    WITH VendedoresAtivos AS (
      SELECT DISTINCT LTRIM(RTRIM([Vendedor])) AS vendedor
      FROM dbo.Clientes
      WHERE
        NULLIF(LTRIM(RTRIM([Vendedor])), '') IS NOT NULL
        AND UPPER(LTRIM(RTRIM(ISNULL([Status], '')))) LIKE '%ATIV%'
    )
    SELECT
      CASE
        WHEN v.[Data] >= @campanhaInicio AND v.[Data] < @campanhaFim THEN 'campanha'
        ELSE 'anterior'
      END AS periodo,
      LTRIM(RTRIM(v.[Vendedor])) AS vendedor,
      v.[ID Cliente] AS clienteCodigo,
      MAX(c.[Cliente]) AS cliente,
      MAX(c.[Nome Fantasia]) AS nomeFantasia,
      v.[ID Pedido de Venda] AS pedido,
      vp.[ID Produto] AS codigo,
      MAX(p.[Produto]) AS produto,
      MAX(p.[ID Fornecedor]) AS fornecedorId,
      MAX(LTRIM(RTRIM(p.[Fornecedor]))) AS fornecedor,
      MAX(p.[Grupo]) AS grupo,
      MAX(p.[Sub-grupo]) AS subgrupo,
      SUM(ISNULL(vp.[Qtde PC], 0)) AS unidades,
      SUM(ISNULL(vp.[Qtde Kg], 0)) AS kg,
      SUM(ISNULL(vp.[Valor], 0)) AS valor,
      SUM(ISNULL(vp.[Margem], 0)) AS margem
    FROM dbo.Vendas v
    INNER JOIN VendedoresAtivos va
      ON va.vendedor = LTRIM(RTRIM(v.[Vendedor]))
    INNER JOIN dbo.VendasProdutos vp
      ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
    INNER JOIN dbo.Produtos p
      ON p.[ID Produto] = vp.[ID Produto]
    LEFT JOIN (
      SELECT
        [ID Cliente],
        MAX([Cliente]) AS [Cliente],
        MAX([Nome Fantasia]) AS [Nome Fantasia]
      FROM dbo.Clientes
      GROUP BY [ID Cliente]
    ) c ON c.[ID Cliente] = v.[ID Cliente]
    WHERE
      NULLIF(LTRIM(RTRIM(v.[Vendedor])), '') IS NOT NULL
      AND (
        (v.[Data] >= @campanhaInicio AND v.[Data] < @campanhaFim)
        OR
        (v.[Data] >= @anteriorInicio AND v.[Data] < @anteriorFim)
      )
      AND ${filtrosEscopo.join(' AND ')}
    GROUP BY
      CASE
        WHEN v.[Data] >= @campanhaInicio AND v.[Data] < @campanhaFim THEN 'campanha'
        ELSE 'anterior'
      END,
      LTRIM(RTRIM(v.[Vendedor])),
      v.[ID Cliente],
      v.[ID Pedido de Venda],
      vp.[ID Produto];
  `);

  const countRequest = pool.request();
  const { filtros: filtrosCount } = montarFiltroEscopo(countRequest, payload, 'p');
  const totalProdutosResultado = await countRequest.query(`
    SELECT COUNT(DISTINCT p.[ID Produto]) AS totalProdutosEscopo
    FROM dbo.Produtos p
    WHERE ${filtrosCount.join(' AND ')};
  `);

  const linhas = resultado.recordset.map((item) => ({
    periodo: item.periodo,
    representanteId: `sql:${item.vendedor}`,
    vendedor: item.vendedor,
    clienteCodigo: item.clienteCodigo,
    cliente: item.nomeFantasia || item.cliente || String(item.clienteCodigo),
    pedido: item.pedido,
    codigo: item.codigo,
    produtoId: item.codigo,
    produto: item.produto,
    fornecedorId: item.fornecedorId,
    fornecedor: item.fornecedor,
    categoria: item.grupo,
    grupo: item.grupo,
    subgrupo: item.subgrupo,
    unidades: Number(item.unidades) || 0,
    qtdePc: Number(item.unidades) || 0,
    kg: Number(item.kg) || 0,
    valor: Number(item.valor) || 0,
    margem: Number(item.margem) || 0,
  }));

  return {
    fonte: 'SQL Server · banco Power BI',
    dataReferencia: 'dbo.Vendas.[Data]',
    filtroRepresentantes: "Somente vendedores com ao menos um cliente cujo dbo.Clientes.[Status] contém 'ATIV'",
    intervalos: {
      campanha: { inicio: texto(payload.campanhaInicio), fimExclusivo: texto(payload.campanhaFim) },
      anterior: { inicio: texto(payload.anteriorInicio), fimExclusivo: texto(payload.anteriorFim) },
    },
    totalProdutosEscopo: Number(totalProdutosResultado.recordset[0]?.totalProdutosEscopo) || produtos.length,
    linhas,
    resumo: {
      linhas: linhas.length,
      vendedores: new Set(linhas.map((item) => item.vendedor)).size,
      clientes: new Set(linhas.map((item) => item.clienteCodigo)).size,
      pedidos: new Set(linhas.map((item) => item.pedido)).size,
      produtos: new Set(linhas.map((item) => item.codigo)).size,
      duracaoMs: Date.now() - inicioExecucao,
    },
  };
}

export async function diagnosticoSql() {
  const inicio = Date.now();
  const pool = await getPool();
  const resultado = await pool.request().query(`
    SELECT
      DB_NAME() AS banco,
      SUSER_SNAME() AS usuario,
      GETDATE() AS dataServidor,
      (SELECT COUNT_BIG(*) FROM dbo.Produtos) AS produtos,
      (SELECT COUNT_BIG(*) FROM dbo.Clientes) AS clientes;
  `);
  return {
    ok: true,
    sql: resultado.recordset[0],
    configuracao: diagnosticoConfiguracaoSql(),
    duracaoMs: Date.now() - inicio,
  };
}
