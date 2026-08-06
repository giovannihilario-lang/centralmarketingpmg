// PMG Connect - Campanhas API autocontida para Vercel
// Esta rota contém conexão e consultas SQL no próprio arquivo para evitar módulos ausentes no deploy.

import sql from 'mssql';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

function env(...nomes) {
  for (const nome of nomes) {
    const valor = process.env[nome];
    if (valor !== undefined && String(valor).trim() !== '') return String(valor).trim();
  }
  return '';
}

function booleano(valor, padrao = false) {
  if (valor === undefined || valor === null || valor === '') return padrao;
  return String(valor).toLowerCase() === 'true';
}

const server = env('SQL_SERVER', 'AZURE_SQL_SERVER');
const database = env('SQL_DATABASE', 'AZURE_SQL_DATABASE');
const user = env('SQL_USER', 'AZURE_SQL_USER');
const password = env('SQL_PASSWORD', 'AZURE_SQL_PASSWORD');
const usaWindowsAuth = booleano(env('SQL_TRUSTED_CONNECTION'), false);

function validarConfiguracao() {
  const faltando = [];
  if (!server) faltando.push('SQL_SERVER/AZURE_SQL_SERVER');
  if (!database) faltando.push('SQL_DATABASE/AZURE_SQL_DATABASE');
  if (!usaWindowsAuth && !user) faltando.push('SQL_USER/AZURE_SQL_USER');
  if (!usaWindowsAuth && !password) faltando.push('SQL_PASSWORD/AZURE_SQL_PASSWORD');
  if (faltando.length) {
    const erro = new Error(`Configuração SQL incompleta: ${faltando.join(', ')}`);
    erro.code = 'SQL_ENV_MISSING';
    throw erro;
  }
}

const sqlConfig = usaWindowsAuth
  ? {
      server,
      database,
      driver: 'msnodesqlv8',
      connectionTimeout: Number(env('SQL_CONNECTION_TIMEOUT')) || 30000,
      requestTimeout: Number(env('SQL_REQUEST_TIMEOUT')) || 50000,
      pool: { max: 5, min: 0, idleTimeoutMillis: 20000 },
      options: {
        trustedConnection: true,
        trustServerCertificate: true,
        enableArithAbort: true,
      },
    }
  : {
      server,
      database,
      user,
      password,
      port: Number(env('SQL_PORT')) || 1433,
      connectionTimeout: Number(env('SQL_CONNECTION_TIMEOUT')) || 30000,
      requestTimeout: Number(env('SQL_REQUEST_TIMEOUT')) || 50000,
      pool: { max: 5, min: 0, idleTimeoutMillis: 20000 },
      options: {
        encrypt: booleano(env('SQL_ENCRYPT'), true),
        trustServerCertificate: booleano(env('SQL_TRUST_SERVER_CERTIFICATE'), false),
        enableArithAbort: true,
        appName: 'PMG Connect - Campanhas',
      },
    };

let poolPromise = null;

function getPool() {
  validarConfiguracao();
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(sqlConfig)
      .connect()
      .catch((erro) => {
        poolPromise = null;
        throw erro;
      });
  }
  return poolPromise;
}

async function resetPool() {
  if (!poolPromise) return;
  try {
    const pool = await poolPromise;
    await pool.close();
  } catch (_) {
    // A próxima chamada recria o pool.
  } finally {
    poolPromise = null;
  }
}

function diagnosticoConfiguracaoSql() {
  return {
    serverConfigurado: Boolean(server),
    databaseConfigurado: Boolean(database),
    userConfigurado: usaWindowsAuth || Boolean(user),
    passwordConfigurado: usaWindowsAuth || Boolean(password),
    autenticacao: usaWindowsAuth ? 'windows' : 'sql-login',
    server,
    database,
    port: sqlConfig.port || null,
    encrypt: Boolean(sqlConfig.options?.encrypt),
    connectionTimeout: sqlConfig.connectionTimeout,
    requestTimeout: sqlConfig.requestTimeout,
  };
}


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

async function listarFornecedores(query = {}) {
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

async function listarProdutos(query = {}) {
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

async function listarFiltrosProdutos(query = {}) {
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

async function listarVendedores(query = {}) {
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

async function consultarApuracao(payload = {}) {
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

async function diagnosticoSql() {
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


const TABELAS_PERSISTENCIA = new Set([
  'campanhas',
  'campanhas_representantes',
  'campanhas_vendas',
  'campanhas_regras',
  'campanhas_regras_produto',
  'campanhas_mapeamentos',
  'campanhas_apuracoes',
]);

const CACHE_MEMORIA = new Map();

function getSupabase() {
  const url = env('SUPABASE_URL');
  const serviceKey = env('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    const erro = new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas');
    erro.code = 'SUPABASE_ENV_MISSING';
    throw erro;
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function normalizarTabela(valor) {
  const tabela = texto(valor);
  if (!TABELAS_PERSISTENCIA.has(tabela)) {
    const erro = new Error("Parâmetro 'tabela' ausente ou inválido");
    erro.code = 'TABELA_INVALIDA';
    throw erro;
  }
  return tabela;
}

async function listarDocumentos(tabela, filtros = {}) {
  const supabase = getSupabase();
  let consulta = supabase
    .from('campanhas_documentos')
    .select('dados, atualizado_em')
    .eq('store', tabela)
    .order('atualizado_em', { ascending: false });

  if (filtros.id) consulta = consulta.eq('id', texto(filtros.id));
  if (filtros.campanhaId) consulta = consulta.eq('campanha_id', texto(filtros.campanhaId));

  const { data, error } = await consulta;
  if (error) throw error;
  return (data || []).map((item) => item.dados).filter(Boolean);
}

async function salvarDocumentos(tabela, corpo) {
  const itens = (Array.isArray(corpo) ? corpo : [corpo]).filter(Boolean);
  if (!itens.length) return { ok: true, quantidade: 0, fonte: 'Supabase' };
  if (itens.some((item) => !item.id)) {
    const erro = new Error('Todo registro precisa possuir id');
    erro.code = 'ID_AUSENTE';
    throw erro;
  }

  const agora = new Date().toISOString();
  const registros = itens.map((item) => ({
    store: tabela,
    id: String(item.id),
    campanha_id: item.campanhaId ? String(item.campanhaId) : null,
    dados: item,
    atualizado_em: agora,
  }));

  const supabase = getSupabase();
  const { error } = await supabase
    .from('campanhas_documentos')
    .upsert(registros, { onConflict: 'store,id' });
  if (error) throw error;
  return { ok: true, quantidade: itens.length, fonte: 'Supabase' };
}

async function removerDocumentos(tabela, filtros = {}) {
  const supabase = getSupabase();
  let consulta = supabase.from('campanhas_documentos').delete().eq('store', tabela);
  if (!filtros.todos) {
    if (!filtros.id) {
      const erro = new Error('id obrigatório');
      erro.code = 'ID_AUSENTE';
      throw erro;
    }
    consulta = consulta.eq('id', texto(filtros.id));
  }
  const { error } = await consulta;
  if (error) throw error;
  return { ok: true, fonte: 'Supabase' };
}

function chaveCache(recurso, entrada) {
  const serializado = JSON.stringify(entrada || {}, Object.keys(entrada || {}).sort());
  return createHash('sha256').update(`${recurso}:${serializado}`).digest('hex');
}

async function gravarCacheSupabase(chave, recurso, parametros, dados, ttlMs) {
  try {
    const supabase = getSupabase();
    const agora = new Date();
    const { error } = await supabase.from('campanhas_cache_sql').upsert({
      chave,
      recurso,
      parametros: parametros || {},
      dados,
      atualizado_em: agora.toISOString(),
      expira_em: new Date(agora.getTime() + ttlMs).toISOString(),
    }, { onConflict: 'chave' });
    if (error) throw error;
  } catch (erro) {
    console.warn('[campanhas-cache] Não foi possível gravar cache no Supabase:', erro.message);
  }
}

async function lerCacheSupabase(chave) {
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase
      .from('campanhas_cache_sql')
      .select('dados, atualizado_em, expira_em')
      .eq('chave', chave)
      .maybeSingle();
    if (error) throw error;
    return data || null;
  } catch (erro) {
    console.warn('[campanhas-cache] Não foi possível ler cache do Supabase:', erro.message);
    return null;
  }
}

async function executarComCache({ recurso, parametros, ttlMs, carregar }) {
  const chave = chaveCache(recurso, parametros);
  const memoria = CACHE_MEMORIA.get(chave);
  if (memoria && Date.now() < memoria.expiraEm) {
    return { dados: memoria.dados, fonte: 'SQL Server · cache em memória', cache: true, stale: false };
  }

  try {
    const dados = await carregar();
    CACHE_MEMORIA.set(chave, { dados, expiraEm: Date.now() + ttlMs });
    void gravarCacheSupabase(chave, recurso, parametros, dados, ttlMs);
    return { dados, fonte: 'SQL Server · banco Power BI', cache: false, stale: false };
  } catch (erroSql) {
    const cache = await lerCacheSupabase(chave);
    if (cache?.dados !== undefined && cache?.dados !== null) {
      return {
        dados: cache.dados,
        fonte: 'Supabase · contingência do SQL Server',
        cache: true,
        stale: new Date(cache.expira_em).getTime() < Date.now(),
        cacheAtualizadoEm: cache.atualizado_em,
        erroSql: erroSql.message,
      };
    }
    throw erroSql;
  }
}

function aplicarCabecalhosFonte(res, resultado) {
  res.setHeader('X-PMG-Data-Source', resultado.fonte || 'desconhecida');
  res.setHeader('X-PMG-Cache', resultado.cache ? (resultado.stale ? 'stale' : 'hit') : 'miss');
  if (resultado.cacheAtualizadoEm) res.setHeader('X-PMG-Cache-Updated-At', resultado.cacheAtualizadoEm);
  if (resultado.erroSql) res.setHeader('Warning', '110 - "Resposta de contingência; SQL Server indisponível"');
}

async function diagnosticoHibrido() {
  const inicio = Date.now();
  const resultado = {
    ok: true,
    arquitetura: {
      leituraComercial: 'SQL Server / Power BI',
      persistenciaCampanhas: 'Supabase',
      contingenciaSql: 'Supabase + memória da função',
      contingenciaFrontend: 'IndexedDB',
    },
    sql: { ok: false },
    supabase: { ok: false },
  };

  try {
    const sqlInfo = await diagnosticoSql();
    resultado.sql = { ok: true, ...sqlInfo };
  } catch (erro) {
    resultado.sql = { ok: false, erro: erro.message, codigo: erro.code || null };
  }

  try {
    const supabase = getSupabase();
    const { count, error } = await supabase
      .from('campanhas_documentos')
      .select('*', { count: 'exact', head: true });
    if (error) throw error;
    resultado.supabase = { ok: true, documentos: count || 0 };
  } catch (erro) {
    resultado.supabase = { ok: false, erro: erro.message, codigo: erro.code || null };
  }

  resultado.ok = resultado.sql.ok || resultado.supabase.ok;
  resultado.duracaoMs = Date.now() - inicio;
  return resultado;
}

export const config = { maxDuration: 60 };

function erroPublico(erro) {
  const codigo = erro?.code || erro?.originalError?.code || 'CAMPANHAS_API_ERROR';
  const mensagem = erro?.message || 'Falha inesperada na API de campanhas';
  let dica = 'Abra os Runtime Logs do deployment para consultar o erro completo.';
  if (codigo === 'SQL_ENV_MISSING') dica = 'Confira as variáveis SQL_* ou AZURE_SQL_* na Vercel e faça um novo deploy.';
  if (codigo === 'SUPABASE_ENV_MISSING') dica = 'Confira SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY na Vercel.';
  if (String(mensagem).includes('campanhas_documentos')) dica = 'Execute sql/campanhas_supabase_hibrido.sql no SQL Editor do Supabase.';
  return { erro: mensagem, codigo, origem: 'api/campanhas-data', dica };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const tabelaInformada = texto(req.query.tabela);
    if (tabelaInformada) {
      const tabela = normalizarTabela(tabelaInformada);
      if (req.method === 'GET') {
        return res.status(200).json(await listarDocumentos(tabela, req.query));
      }
      if (req.method === 'POST') {
        return res.status(200).json(await salvarDocumentos(tabela, req.body));
      }
      if (req.method === 'DELETE') {
        return res.status(200).json(await removerDocumentos(tabela, {
          id: req.query.id,
          todos: ['1', 'true', 'sim'].includes(texto(req.query.all).toLowerCase()),
        }));
      }
      return res.status(405).json({ erro: 'Método não permitido', codigo: 'METODO_INVALIDO' });
    }

    const recurso = texto(req.query.recurso);
    if (!recurso) {
      return res.status(400).json({
        erro: "Informe 'tabela' para persistência ou 'recurso' para dados comerciais",
        codigo: 'PARAMETRO_AUSENTE',
        origem: 'api/campanhas-data',
      });
    }

    if (recurso === 'diagnostico') {
      return res.status(200).json(await diagnosticoHibrido());
    }

    if (recurso === 'apuracao') {
      if (req.method !== 'POST') {
        return res.status(405).json({ erro: 'Use POST para apuração', codigo: 'METODO_INVALIDO' });
      }
      const resultado = await executarComCache({
        recurso,
        parametros: req.body || {},
        ttlMs: 5 * 60 * 1000,
        carregar: () => consultarApuracao(req.body || {}),
      });
      aplicarCabecalhosFonte(res, resultado);
      const dados = resultado.dados || {};
      return res.status(200).json({
        ...dados,
        fonte: resultado.fonte,
        contingencia: resultado.cache,
        cacheDesatualizado: resultado.stale,
        cacheAtualizadoEm: resultado.cacheAtualizadoEm || null,
        aviso: resultado.erroSql ? `SQL Server indisponível. Exibindo o último resultado salvo: ${resultado.erroSql}` : null,
      });
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ erro: 'Método não permitido', codigo: 'METODO_INVALIDO' });
    }

    const configuracoes = {
      produtos: { ttl: 10 * 60 * 1000, carregar: () => listarProdutos(req.query) },
      'filtros-produtos': { ttl: 30 * 60 * 1000, carregar: () => listarFiltrosProdutos(req.query) },
      fornecedores: { ttl: 30 * 60 * 1000, carregar: () => listarFornecedores(req.query) },
      vendedores: { ttl: 15 * 60 * 1000, carregar: () => listarVendedores(req.query) },
      representantes: { ttl: 15 * 60 * 1000, carregar: () => listarVendedores(req.query) },
    };
    const configuracao = configuracoes[recurso];
    if (!configuracao) {
      return res.status(404).json({ erro: `Recurso desconhecido: ${recurso}`, codigo: 'RECURSO_DESCONHECIDO' });
    }

    const resultado = await executarComCache({
      recurso,
      parametros: req.query,
      ttlMs: configuracao.ttl,
      carregar: configuracao.carregar,
    });
    aplicarCabecalhosFonte(res, resultado);
    return res.status(200).json(resultado.dados);
  } catch (erro) {
    console.error('[api/campanhas-data]', erro);
    const publico = erroPublico(erro);
    const status = ['SQL_ENV_MISSING', 'SUPABASE_ENV_MISSING'].includes(publico.codigo) ? 503 : 500;
    return res.status(status).json(publico);
  }
}
