// PMG Connect — API local de Campanhas V3.6.3
// Mesmo padrão de conexão do Dashboard Regional: uma conexão por invocação,
// fechamento garantido e resposta JSON em qualquer falha tratável.

import sql from 'mssql';

const CACHE = new Map();

function texto(valor) {
  return String(valor ?? '').trim();
}

function env(...nomes) {
  for (const nome of nomes) {
    const valor = process.env[nome];
    if (valor !== undefined && texto(valor)) return texto(valor);
  }
  return '';
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

function obterConfigSql() {
  const server = env('SQL_SERVER', 'AZURE_SQL_SERVER');
  const database = env('SQL_DATABASE', 'AZURE_SQL_DATABASE');
  const user = env('SQL_USER', 'AZURE_SQL_USER');
  const password = env('SQL_PASSWORD', 'AZURE_SQL_PASSWORD');

  const faltando = [];
  if (!server) faltando.push('SQL_SERVER ou AZURE_SQL_SERVER');
  if (!database) faltando.push('SQL_DATABASE ou AZURE_SQL_DATABASE');
  if (!user) faltando.push('SQL_USER ou AZURE_SQL_USER');
  if (!password) faltando.push('SQL_PASSWORD ou AZURE_SQL_PASSWORD');

  if (faltando.length) {
    const erro = new Error(`Configuração SQL incompleta: ${faltando.join(', ')}`);
    erro.code = 'SQL_ENV_MISSING';
    throw erro;
  }

  return {
    server,
    database,
    user,
    password,
    port: Number(env('SQL_PORT')) || 1433,
    connectionTimeout: Number(env('SQL_CONNECTION_TIMEOUT')) || 25000,
    requestTimeout: Number(env('SQL_REQUEST_TIMEOUT')) || 55000,
    pool: {
      max: 3,
      min: 0,
      idleTimeoutMillis: 10000,
    },
    options: {
      encrypt: env('SQL_ENCRYPT').toLowerCase() !== 'false',
      trustServerCertificate: env('SQL_TRUST_SERVER_CERTIFICATE').toLowerCase() === 'true',
      enableArithAbort: true,
      appName: 'PMG Connect Campanhas Local',
    },
  };
}

async function comPool(executar) {
  let pool;
  try {
    pool = new sql.ConnectionPool(obterConfigSql());
    await pool.connect();
    return await executar(pool);
  } finally {
    if (pool) {
      try {
        await pool.close();
      } catch (erroFechamento) {
        console.warn('[campanhas-data] Não foi possível fechar o pool:', erroFechamento?.message);
      }
    }
  }
}

function chaveCache(recurso, parametros = {}) {
  const limpos = {};
  for (const chave of Object.keys(parametros).sort()) {
    if (parametros[chave] !== undefined) limpos[chave] = parametros[chave];
  }
  return `${recurso}:${JSON.stringify(limpos)}`;
}

async function comCache(recurso, parametros, ttlMs, carregar) {
  const chave = chaveCache(recurso, parametros);
  const item = CACHE.get(chave);
  if (item && Date.now() < item.expiraEm) return item.dados;

  const dados = await carregar();
  CACHE.set(chave, { dados, expiraEm: Date.now() + ttlMs });
  return dados;
}

function dataSql(valor, nome) {
  const limpo = texto(valor).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(limpo)) {
    const erro = new Error(`Data inválida em ${nome}`);
    erro.code = 'DATA_INVALIDA';
    throw erro;
  }
  const [ano, mes, dia] = limpo.split('-').map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia, 12, 0, 0));
  if (Number.isNaN(data.getTime())) {
    const erro = new Error(`Data inválida em ${nome}`);
    erro.code = 'DATA_INVALIDA';
    throw erro;
  }
  return data;
}

function parametrosInteiros(request, prefixo, valores) {
  return valores.map((valor, indice) => {
    const nome = `${prefixo}${indice}`;
    request.input(nome, sql.Int, valor);
    return `@${nome}`;
  }).join(', ');
}

function parametrosTextos(request, prefixo, valores) {
  return valores.map((valor, indice) => {
    const nome = `${prefixo}${indice}`;
    request.input(nome, sql.NVarChar(200), valor);
    return `@${nome}`;
  }).join(', ');
}

async function listarFornecedores(query = {}) {
  return comPool(async (pool) => {
    const request = pool.request();
    const busca = texto(query.busca);
    const limite = inteiro(query.limite, 300, 500);

    request.input('limite', sql.Int, limite);
    request.input('busca', sql.NVarChar(220), busca ? `%${busca}%` : '');
    request.input('buscaVazia', sql.Bit, busca ? 0 : 1);

    const resultado = await request.query(`
      WITH ProdutosNormalizados AS (
        SELECT
          [ID Fornecedor] AS fornecedorId,
          [ID Produto] AS produtoId,
          NULLIF(LTRIM(RTRIM([Fornecedor])), '') AS fornecedor,
          NULLIF(LTRIM(RTRIM([Grupo])), '') AS grupo,
          NULLIF(LTRIM(RTRIM([Sub-grupo])), '') AS subgrupo,
          LTRIM(RTRIM(ISNULL([Status], ''))) AS statusProduto
        FROM dbo.Produtos
      )
      SELECT TOP (@limite)
        MIN(fornecedorId) AS id,
        fornecedor AS nome,
        COUNT(DISTINCT produtoId) AS totalProdutos,
        COUNT(DISTINCT CASE WHEN UPPER(statusProduto) LIKE '%ATIV%' THEN produtoId END) AS produtosAtivos,
        COUNT(DISTINCT grupo) AS totalGrupos,
        COUNT(DISTINCT subgrupo) AS totalSubgrupos
      FROM ProdutosNormalizados
      WHERE fornecedor IS NOT NULL
        AND (
          @buscaVazia = 1
          OR fornecedor LIKE @busca
          OR CAST(fornecedorId AS varchar(30)) LIKE @busca
        )
      GROUP BY fornecedor
      ORDER BY fornecedor;
    `);

    return resultado.recordset.map((item) => ({
      id: item.id,
      nome: texto(item.nome),
      totalProdutos: Number(item.totalProdutos) || 0,
      produtosAtivos: Number(item.produtosAtivos) || 0,
      totalGrupos: Number(item.totalGrupos) || 0,
      totalSubgrupos: Number(item.totalSubgrupos) || 0,
    })).filter((item) => item.nome);
  });
}

async function listarProdutos(query = {}) {
  return comPool(async (pool) => {
    const request = pool.request();
    const limite = inteiro(query.limite, 250, 1000);
    const filtros = ['1 = 1'];
    const busca = texto(query.busca);
    const fornecedor = texto(query.fornecedor);
    const fornecedorId = Number.parseInt(query.fornecedorId, 10);
    const grupo = texto(query.grupo);
    const subgrupo = texto(query.subgrupo);
    const status = texto(query.status);

    request.input('limite', sql.Int, limite);

    if (busca) {
      request.input('busca', sql.NVarChar(220), `%${busca}%`);
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
      request.input('fornecedor', sql.NVarChar(220), fornecedor);
      filtros.push('LTRIM(RTRIM(p.[Fornecedor])) = @fornecedor');
    }
    if (grupo) {
      request.input('grupo', sql.NVarChar(220), grupo);
      filtros.push('p.[Grupo] = @grupo');
    }
    if (subgrupo) {
      request.input('subgrupo', sql.NVarChar(220), subgrupo);
      filtros.push('p.[Sub-grupo] = @subgrupo');
    }
    if (status) {
      request.input('status', sql.NVarChar(100), status);
      filtros.push('p.[Status] = @status');
    }

    const resultado = await request.query(`
      SELECT TOP (@limite)
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
      WHERE ${filtros.join(' AND ')}
      ORDER BY p.[Grupo], p.[Produto];
    `);

    return resultado.recordset;
  });
}

async function listarFiltrosProdutos(query = {}) {
  return comPool(async (pool) => {
    const fornecedor = texto(query.fornecedor);
    const fornecedorId = Number.parseInt(query.fornecedorId, 10);

    const consultar = async (coluna) => {
      const request = pool.request();
      const filtros = [`NULLIF(LTRIM(RTRIM(${coluna})), '') IS NOT NULL`];
      if (Number.isFinite(fornecedorId)) {
        request.input('fornecedorId', sql.Int, fornecedorId);
        filtros.push('[ID Fornecedor] = @fornecedorId');
      } else if (fornecedor) {
        request.input('fornecedor', sql.NVarChar(220), fornecedor);
        filtros.push('LTRIM(RTRIM([Fornecedor])) = @fornecedor');
      }
      const resultado = await request.query(`
        SELECT DISTINCT LTRIM(RTRIM(${coluna})) AS valor
        FROM dbo.Produtos
        WHERE ${filtros.join(' AND ')}
        ORDER BY LTRIM(RTRIM(${coluna}));
      `);
      return resultado.recordset.map((item) => texto(item.valor)).filter(Boolean);
    };

    return {
      fornecedores: fornecedor ? [fornecedor] : [],
      grupos: await consultar('[Grupo]'),
      subgrupos: await consultar('[Sub-grupo]'),
      status: await consultar('[Status]'),
    };
  });
}

async function listarRepresentantes(query = {}) {
  return comPool(async (pool) => {
    const request = pool.request();
    const busca = texto(query.busca);
    const somenteAtivos = texto(query.ativos).toLowerCase() !== 'false';
    const diasHistorico = inteiro(query.diasHistorico, 365, 3650);

    request.input('diasHistorico', sql.Int, diasHistorico);
    request.input('busca', sql.NVarChar(220), busca ? `%${busca}%` : '');
    request.input('buscaVazia', sql.Bit, busca ? 0 : 1);
    request.input('somenteAtivos', sql.Bit, somenteAtivos ? 1 : 0);

    const resultado = await request.query(`
      WITH Carteira AS (
        SELECT
          LTRIM(RTRIM([Vendedor])) AS vendedor,
          COUNT(DISTINCT [ID Cliente]) AS clientesCarteira,
          COUNT(DISTINCT CASE
            WHEN UPPER(LTRIM(RTRIM(ISNULL([Status], '')))) LIKE 'ATIV%'
            THEN [ID Cliente]
          END) AS clientesAtivos
        FROM dbo.Clientes
        WHERE NULLIF(LTRIM(RTRIM([Vendedor])), '') IS NOT NULL
        GROUP BY LTRIM(RTRIM([Vendedor]))
      ),
      Historico AS (
        SELECT
          LTRIM(RTRIM([Vendedor])) AS vendedor,
          COUNT(DISTINCT [ID Cliente]) AS clientesHistoricos,
          COUNT(DISTINCT [ID Pedido de Venda]) AS pedidosHistoricos,
          MAX([Data]) AS ultimaVenda,
          SUM(ISNULL([Valor Total], 0)) AS faturamentoHistorico
        FROM dbo.Vendas
        WHERE NULLIF(LTRIM(RTRIM([Vendedor])), '') IS NOT NULL
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
      LEFT JOIN Historico h ON h.vendedor = c.vendedor
      WHERE (@buscaVazia = 1 OR c.vendedor LIKE @busca)
        AND (@somenteAtivos = 0 OR c.clientesAtivos > 0)
      ORDER BY c.vendedor;
    `);

    return resultado.recordset;
  });
}

function adicionarEscopo(request, payload, aliasProduto = 'p') {
  const filtros = [];
  const produtos = listaInteiros(payload.produtos, 1000);
  const fornecedorId = Number.parseInt(payload.fornecedorId, 10);
  const fornecedor = texto(payload.fornecedor);

  if (produtos.length) {
    filtros.push(`${aliasProduto}.[ID Produto] IN (${parametrosInteiros(request, 'produto', produtos)})`);
  } else if (Number.isFinite(fornecedorId)) {
    request.input('fornecedorId', sql.Int, fornecedorId);
    filtros.push(`${aliasProduto}.[ID Fornecedor] = @fornecedorId`);
  } else if (fornecedor) {
    request.input('fornecedor', sql.NVarChar(220), fornecedor);
    filtros.push(`LTRIM(RTRIM(${aliasProduto}.[Fornecedor])) = @fornecedor`);
  } else {
    const erro = new Error('Selecione um fornecedor ou ao menos um produto para apurar');
    erro.code = 'ESCOPO_AUSENTE';
    throw erro;
  }

  return { filtros, produtos };
}

async function consultarApuracao(payload = {}) {
  return comPool(async (pool) => {
    const inicioExecucao = Date.now();
    const campanhaInicio = dataSql(payload.campanhaInicio, 'campanhaInicio');
    const campanhaFim = dataSql(payload.campanhaFim, 'campanhaFim');
    const anteriorInicio = dataSql(payload.anteriorInicio, 'anteriorInicio');
    const anteriorFim = dataSql(payload.anteriorFim, 'anteriorFim');

    const request = pool.request();
    request.input('campanhaInicio', sql.DateTime2, campanhaInicio);
    request.input('campanhaFim', sql.DateTime2, campanhaFim);
    request.input('anteriorInicio', sql.DateTime2, anteriorInicio);
    request.input('anteriorFim', sql.DateTime2, anteriorFim);

    const { filtros, produtos } = adicionarEscopo(request, payload, 'p');
    const vendedores = listaTextos(payload.vendedores);
    if (vendedores.length) {
      filtros.push(`LTRIM(RTRIM(v.[Vendedor])) IN (${parametrosTextos(request, 'vendedor', vendedores)})`);
    }

    const resultado = await request.query(`
      WITH VendedoresAtivos AS (
        SELECT DISTINCT LTRIM(RTRIM([Vendedor])) AS vendedor
        FROM dbo.Clientes
        WHERE NULLIF(LTRIM(RTRIM([Vendedor])), '') IS NOT NULL
          AND UPPER(LTRIM(RTRIM(ISNULL([Status], '')))) LIKE 'ATIV%'
      ),
      ClientesUnicos AS (
        SELECT
          [ID Cliente],
          MAX([Cliente]) AS cliente,
          MAX([Nome Fantasia]) AS nomeFantasia
        FROM dbo.Clientes
        GROUP BY [ID Cliente]
      )
      SELECT
        CASE WHEN v.[Data] >= @campanhaInicio AND v.[Data] < @campanhaFim THEN 'campanha' ELSE 'anterior' END AS periodo,
        LTRIM(RTRIM(v.[Vendedor])) AS vendedor,
        v.[ID Cliente] AS clienteCodigo,
        MAX(c.cliente) AS cliente,
        MAX(c.nomeFantasia) AS nomeFantasia,
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
      INNER JOIN VendedoresAtivos va ON va.vendedor = LTRIM(RTRIM(v.[Vendedor]))
      INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
      INNER JOIN dbo.Produtos p ON p.[ID Produto] = vp.[ID Produto]
      LEFT JOIN ClientesUnicos c ON c.[ID Cliente] = v.[ID Cliente]
      WHERE NULLIF(LTRIM(RTRIM(v.[Vendedor])), '') IS NOT NULL
        AND (
          (v.[Data] >= @campanhaInicio AND v.[Data] < @campanhaFim)
          OR (v.[Data] >= @anteriorInicio AND v.[Data] < @anteriorFim)
        )
        AND ${filtros.join(' AND ')}
      GROUP BY
        CASE WHEN v.[Data] >= @campanhaInicio AND v.[Data] < @campanhaFim THEN 'campanha' ELSE 'anterior' END,
        LTRIM(RTRIM(v.[Vendedor])),
        v.[ID Cliente],
        v.[ID Pedido de Venda],
        vp.[ID Produto];
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
      filtroRepresentantes: "Somente vendedores com cliente ativo em dbo.Clientes",
      intervalos: {
        campanha: { inicio: texto(payload.campanhaInicio), fimExclusivo: texto(payload.campanhaFim) },
        anterior: { inicio: texto(payload.anteriorInicio), fimExclusivo: texto(payload.anteriorFim) },
      },
      totalProdutosEscopo: produtos.length || null,
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
  });
}

async function diagnostico() {
  const inicio = Date.now();
  const config = obterConfigSql();
  const sqlInfo = await comPool(async (pool) => {
    const resultado = await pool.request().query(`
      SELECT
        DB_NAME() AS banco,
        SUSER_SNAME() AS usuario,
        GETDATE() AS dataServidor,
        (SELECT COUNT_BIG(*) FROM dbo.Produtos) AS produtos,
        (SELECT COUNT_BIG(*) FROM dbo.Clientes) AS clientes;
    `);
    return resultado.recordset[0];
  });

  return {
    ok: true,
    versao: '3.6.3-local',
    arquitetura: 'Padrão Dashboard Regional: Vercel Function + SQL Server por conexão curta',
    escritaSupabase: false,
    sql: sqlInfo,
    configuracao: {
      server: config.server,
      database: config.database,
      port: config.port,
      encrypt: config.options.encrypt,
      connectionTimeout: config.connectionTimeout,
      requestTimeout: config.requestTimeout,
    },
    duracaoMs: Date.now() - inicio,
  };
}

function erroPublico(erro) {
  const codigo = erro?.code || erro?.originalError?.code || 'CAMPANHAS_API_ERROR';
  let dica = 'Consulte os Runtime Logs da função api/campanhas-data na Vercel.';
  if (codigo === 'SQL_ENV_MISSING') dica = 'Confira as variáveis SQL_* ou AZURE_SQL_* e faça um novo deploy.';
  if (codigo === 'ELOGIN') dica = 'Confira usuário, senha e permissão de acesso ao banco Power BI.';
  if (['ETIMEOUT', 'ESOCKET', 'ECONNRESET'].includes(codigo)) dica = 'A conexão com o Azure SQL não foi concluída. Confira firewall, rede e tempo de execução.';

  return {
    erro: erro?.message || 'Falha inesperada na API de campanhas',
    codigo,
    origem: 'api/campanhas-data',
    versao: '3.6.3-local',
    dica,
  };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const inicio = Date.now();
  const recurso = texto(req.query?.recurso);

  try {
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (!recurso) {
      return res.status(400).json({
        erro: "Informe o parâmetro 'recurso'",
        codigo: 'PARAMETRO_AUSENTE',
        versao: '3.6.3-local',
      });
    }

    if (recurso === 'diagnostico') {
      return res.status(200).json(await diagnostico());
    }

    if (recurso === 'apuracao') {
      if (req.method !== 'POST') {
        res.setHeader('Allow', 'POST');
        return res.status(405).json({ erro: 'Use POST para apuração', codigo: 'METODO_INVALIDO' });
      }
      const dados = await consultarApuracao(req.body || {});
      return res.status(200).json(dados);
    }

    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      return res.status(405).json({ erro: 'Método não permitido', codigo: 'METODO_INVALIDO' });
    }

    const rotas = {
      fornecedores: () => comCache('fornecedores', req.query, 15 * 60 * 1000, () => listarFornecedores(req.query)),
      produtos: () => comCache('produtos', req.query, 10 * 60 * 1000, () => listarProdutos(req.query)),
      'filtros-produtos': () => comCache('filtros-produtos', req.query, 20 * 60 * 1000, () => listarFiltrosProdutos(req.query)),
      representantes: () => comCache('representantes', req.query, 10 * 60 * 1000, () => listarRepresentantes(req.query)),
      vendedores: () => comCache('vendedores', req.query, 10 * 60 * 1000, () => listarRepresentantes(req.query)),
    };

    const executar = rotas[recurso];
    if (!executar) {
      return res.status(404).json({ erro: `Recurso desconhecido: ${recurso}`, codigo: 'RECURSO_DESCONHECIDO' });
    }

    const dados = await executar();
    res.setHeader('X-PMG-API-Version', '3.6.2');
    res.setHeader('X-PMG-Duration-Ms', String(Date.now() - inicio));
    return res.status(200).json(dados);
  } catch (erro) {
    console.error(`[api/campanhas-data:${recurso || 'sem-recurso'}]`, erro);
    const publico = erroPublico(erro);
    const status = publico.codigo === 'SQL_ENV_MISSING' ? 503 : 500;
    return res.status(status).json(publico);
  }
}
