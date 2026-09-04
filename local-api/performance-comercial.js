import { getPool, sql } from '../src/lib/db.js';

const CACHE = new Map();
const CACHE_MS = 90_000;
const FILTER_CACHE_MS = 10 * 60_000;

function text(value, max = 200) {
  return String(value ?? '').trim().slice(0, max);
}

function positiveInt(value, fallback, max = 500) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : fallback;
}

function dateKey(value) {
  const raw = text(value, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : raw;
}

function toDate(value) {
  const key = dateKey(value);
  return key ? new Date(`${key}T12:00:00Z`) : null;
}

function isoDate(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function defaultRange() {
  const now = new Date();
  return {
    inicio: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
    fim: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`,
  };
}

function resolveRange(query) {
  const fallback = defaultRange();
  const inicio = dateKey(query.inicio) || fallback.inicio;
  const fim = dateKey(query.fim) || fallback.fim;
  if (inicio > fim) return { inicio: fim, fim: inicio };
  return { inicio, fim };
}

function previousRange(range) {
  const start = toDate(range.inicio);
  const end = toDate(range.fim);
  const days = Math.max(1, Math.round((end - start) / 86400000) + 1);
  const previousEnd = new Date(start);
  previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);
  const previousStart = new Date(previousEnd);
  previousStart.setUTCDate(previousStart.getUTCDate() - days + 1);
  return { inicio: isoDate(previousStart), fim: isoDate(previousEnd) };
}

function filtersFrom(query) {
  return {
    vendedor: text(query.vendedor),
    zona: text(query.zona),
    subregiao: text(query.subregiao),
    cidade: text(query.cidade),
    uf: text(query.uf, 4).toUpperCase(),
    segmento: text(query.segmento),
    fornecedor: text(query.fornecedor),
    grupo: text(query.grupo),
    subgrupo: text(query.subgrupo),
    formaVenda: text(query.formaVenda),
  };
}

function hasProductFilter(filters) {
  return Boolean(filters.fornecedor || filters.grupo || filters.subgrupo);
}

function cacheKey(resource, query) {
  const entries = Object.entries(query || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return `${resource}|${JSON.stringify(entries)}`;
}

async function withCache(key, ttl, factory) {
  const now = Date.now();
  const hit = CACHE.get(key);
  if (hit && hit.expires > now) return hit.value;
  const value = await factory();
  CACHE.set(key, { value, expires: now + ttl });
  if (CACHE.size > 250) {
    const first = CACHE.keys().next().value;
    CACHE.delete(first);
  }
  return value;
}

function addInputs(request, filters, ranges = {}) {
  request.input('fltVendedor', sql.NVarChar(200), filters.vendedor || null);
  request.input('fltZona', sql.NVarChar(200), filters.zona || null);
  request.input('fltSubregiao', sql.NVarChar(200), filters.subregiao || null);
  request.input('fltCidade', sql.NVarChar(200), filters.cidade || null);
  request.input('fltUf', sql.NVarChar(4), filters.uf || null);
  request.input('fltSegmento', sql.NVarChar(200), filters.segmento || null);
  request.input('fltFornecedor', sql.NVarChar(200), filters.fornecedor || null);
  request.input('fltGrupo', sql.NVarChar(200), filters.grupo || null);
  request.input('fltSubgrupo', sql.NVarChar(200), filters.subgrupo || null);
  request.input('fltFormaVenda', sql.NVarChar(200), filters.formaVenda || null);
  for (const [prefix, range] of Object.entries(ranges)) {
    request.input(`${prefix}Inicio`, sql.Date, toDate(range.inicio));
    request.input(`${prefix}Fim`, sql.Date, toDate(range.fim));
  }
}

function clientConditions(alias = 'c') {
  return [
    `(@fltVendedor IS NULL OR LTRIM(RTRIM(${alias}.[Vendedor])) = @fltVendedor)`,
    `(@fltZona IS NULL OR LTRIM(RTRIM(${alias}.[Zona])) = @fltZona)`,
    `(@fltSubregiao IS NULL OR LTRIM(RTRIM(${alias}.[SubRegião])) = @fltSubregiao)`,
    `(@fltCidade IS NULL OR LTRIM(RTRIM(${alias}.[Cidade])) = @fltCidade)`,
    `(@fltUf IS NULL OR UPPER(LTRIM(RTRIM(${alias}.[UF]))) = @fltUf)`,
    `(@fltSegmento IS NULL OR LTRIM(RTRIM(${alias}.[Segmento])) = @fltSegmento)`,
  ].join('\n      AND ');
}

function productConditions(alias = 'p') {
  return [
    `(@fltFornecedor IS NULL OR LTRIM(RTRIM(${alias}.[Fornecedor])) = @fltFornecedor)`,
    `(@fltGrupo IS NULL OR LTRIM(RTRIM(${alias}.[Grupo])) = @fltGrupo)`,
    `(@fltSubgrupo IS NULL OR LTRIM(RTRIM(${alias}.[Sub-grupo])) = @fltSubgrupo)`,
  ].join('\n      AND ');
}

function orderConditions(rangePrefix, v = 'v', c = 'c', includeProduct = true) {
  const exists = includeProduct ? `
      AND (
        (@fltFornecedor IS NULL AND @fltGrupo IS NULL AND @fltSubgrupo IS NULL)
        OR EXISTS (
          SELECT 1
          FROM dbo.VendasProdutos fvp
          INNER JOIN dbo.Produtos fp ON fp.[ID Produto] = fvp.[ID Produto]
          WHERE fvp.[ID Pedido de Venda] = ${v}.[ID Pedido de Venda]
            AND ${productConditions('fp')}
        )
      )` : '';
  return `
      ${v}.[Data] >= @${rangePrefix}Inicio
      AND ${v}.[Data] < DATEADD(day, 1, @${rangePrefix}Fim)
      AND (@fltFormaVenda IS NULL OR LTRIM(RTRIM(${v}.[Forma de Venda])) = @fltFormaVenda)
      AND ${clientConditions(c)}
      ${exists}`;
}

function growth(current, previous) {
  const a = Number(current || 0);
  const b = Number(previous || 0);
  if (!b) return a ? 100 : 0;
  return ((a - b) / Math.abs(b)) * 100;
}

function normalizeMargin(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

async function queryFilters() {
  const pool = await getPool();
  const queries = [
    ['vendedores', `SELECT DISTINCT LTRIM(RTRIM([Vendedor])) valor FROM dbo.Vendas WHERE NULLIF(LTRIM(RTRIM([Vendedor])), '') IS NOT NULL ORDER BY valor`],
    ['zonas', `SELECT DISTINCT LTRIM(RTRIM([Zona])) valor FROM dbo.Clientes WHERE NULLIF(LTRIM(RTRIM([Zona])), '') IS NOT NULL ORDER BY valor`],
    ['subregioes', `SELECT DISTINCT LTRIM(RTRIM([SubRegião])) valor FROM dbo.Clientes WHERE NULLIF(LTRIM(RTRIM([SubRegião])), '') IS NOT NULL ORDER BY valor`],
    ['cidades', `SELECT DISTINCT LTRIM(RTRIM([Cidade])) valor FROM dbo.Clientes WHERE NULLIF(LTRIM(RTRIM([Cidade])), '') IS NOT NULL ORDER BY valor`],
    ['ufs', `SELECT DISTINCT UPPER(LTRIM(RTRIM([UF]))) valor FROM dbo.Clientes WHERE NULLIF(LTRIM(RTRIM([UF])), '') IS NOT NULL ORDER BY valor`],
    ['segmentos', `SELECT DISTINCT LTRIM(RTRIM([Segmento])) valor FROM dbo.Clientes WHERE NULLIF(LTRIM(RTRIM([Segmento])), '') IS NOT NULL ORDER BY valor`],
    ['fornecedores', `SELECT DISTINCT LTRIM(RTRIM([Fornecedor])) valor FROM dbo.Produtos WHERE NULLIF(LTRIM(RTRIM([Fornecedor])), '') IS NOT NULL ORDER BY valor`],
    ['grupos', `SELECT DISTINCT LTRIM(RTRIM([Grupo])) valor FROM dbo.Produtos WHERE NULLIF(LTRIM(RTRIM([Grupo])), '') IS NOT NULL ORDER BY valor`],
    ['subgrupos', `SELECT DISTINCT LTRIM(RTRIM([Sub-grupo])) valor FROM dbo.Produtos WHERE NULLIF(LTRIM(RTRIM([Sub-grupo])), '') IS NOT NULL ORDER BY valor`],
    ['formasVenda', `SELECT DISTINCT LTRIM(RTRIM([Forma de Venda])) valor FROM dbo.Vendas WHERE NULLIF(LTRIM(RTRIM([Forma de Venda])), '') IS NOT NULL ORDER BY valor`],
  ];
  const results = await Promise.all(queries.map(async ([key, query]) => {
    const result = await pool.request().query(query);
    return [key, result.recordset.map(row => row.valor).filter(Boolean)];
  }));
  return Object.fromEntries(results);
}

async function queryKpis(filters, range) {
  const pool = await getPool();
  const request = pool.request();
  addInputs(request, filters, { cur: range });
  const productScoped = hasProductFilter(filters);

  const result = await request.query(`
    WITH SelectedOrders AS (
      SELECT
        v.[ID Pedido de Venda] pedidoId,
        v.[ID Cliente] clienteId,
        v.[Valor Total] valorTotal,
        v.[Margem Líquida] margemLiquida,
        v.[Margem Bruta] margemBruta,
        v.[Peso] peso
      FROM dbo.Vendas v
      LEFT JOIN dbo.Clientes c ON c.[ID Cliente] = v.[ID Cliente]
      WHERE ${orderConditions('cur', 'v', 'c', true)}
    ),
    OrderAgg AS (
      SELECT
        COALESCE(SUM(valorTotal), 0) faturamentoPedidos,
        AVG(CAST(margemLiquida AS float)) margemLiquida,
        AVG(CAST(margemBruta AS float)) margemBruta,
        COALESCE(SUM(peso), 0) pesoPedidos,
        COUNT_BIG(*) pedidos,
        COUNT(DISTINCT clienteId) clientesAtivos
      FROM SelectedOrders
    ),
    ItemAgg AS (
      SELECT
        COALESCE(SUM(vp.[Valor]), 0) faturamentoItens,
        COALESCE(SUM(vp.[Qtde Kg]), 0) kgItens,
        AVG(CAST(vp.[Margem] AS float)) margemItens
      FROM SelectedOrders so
      INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = so.pedidoId
      INNER JOIN dbo.Produtos p ON p.[ID Produto] = vp.[ID Produto]
      WHERE ${productConditions('p')}
    ),
    Portfolio AS (
      SELECT COUNT(DISTINCT c.[ID Cliente]) carteiraTotal
      FROM dbo.Clientes c
      WHERE ${clientConditions('c')}
    )
    SELECT
      oa.faturamentoPedidos,
      oa.margemLiquida,
      oa.margemBruta,
      oa.pesoPedidos,
      oa.pedidos,
      oa.clientesAtivos,
      ia.faturamentoItens,
      ia.kgItens,
      ia.margemItens,
      p.carteiraTotal
    FROM OrderAgg oa CROSS JOIN ItemAgg ia CROSS JOIN Portfolio p;
  `);

  const row = result.recordset[0] || {};
  const faturamento = productScoped ? Number(row.faturamentoItens || 0) : Number(row.faturamentoPedidos || 0);
  const kg = productScoped ? Number(row.kgItens || 0) : Number(row.pesoPedidos || 0);
  const pedidos = Number(row.pedidos || 0);
  const clientesAtivos = Number(row.clientesAtivos || 0);
  const carteiraTotal = Number(row.carteiraTotal || 0);
  return {
    faturamento,
    margemLiquida: normalizeMargin(row.margemLiquida),
    margemBruta: normalizeMargin(row.margemBruta),
    margemItens: normalizeMargin(row.margemItens),
    kg,
    pedidos,
    clientesAtivos,
    carteiraTotal,
    positivacao: carteiraTotal ? (clientesAtivos / carteiraTotal) * 100 : 0,
    ticketMedio: pedidos ? faturamento / pedidos : 0,
    productScoped,
    regraFaturamento: productScoped ? 'itens_filtrados' : 'valor_total_pedido',
  };
}

async function querySummary(filters, range) {
  const prev = previousRange(range);
  const [current, previous] = await Promise.all([
    queryKpis(filters, range),
    queryKpis(filters, prev),
  ]);
  const compare = {};
  for (const key of ['faturamento', 'kg', 'pedidos', 'clientesAtivos', 'ticketMedio', 'positivacao']) {
    compare[key] = growth(current[key], previous[key]);
  }
  compare.margemLiquidaPp = current.margemLiquida == null || previous.margemLiquida == null ? null : current.margemLiquida - previous.margemLiquida;
  compare.margemBrutaPp = current.margemBruta == null || previous.margemBruta == null ? null : current.margemBruta - previous.margemBruta;
  return { periodo: range, periodoAnterior: prev, atual: current, anterior: previous, comparacao: compare };
}

async function querySellers(filters, range) {
  const prev = previousRange(range);
  const pool = await getPool();
  const request = pool.request();
  addInputs(request, filters, { cur: range, prev });
  const productScoped = hasProductFilter(filters);

  const result = await request.query(`
    WITH CurOrders AS (
      SELECT DISTINCT
        v.[ID Pedido de Venda] pedidoId,
        NULLIF(LTRIM(RTRIM(v.[Vendedor])), '') vendedor,
        v.[ID Cliente] clienteId,
        v.[Valor Total] valorTotal,
        v.[Margem Líquida] margemLiquida,
        v.[Margem Bruta] margemBruta,
        v.[Peso] peso
      FROM dbo.Vendas v
      LEFT JOIN dbo.Clientes c ON c.[ID Cliente] = v.[ID Cliente]
      WHERE ${orderConditions('cur', 'v', 'c', true)}
        AND NULLIF(LTRIM(RTRIM(v.[Vendedor])), '') IS NOT NULL
    ),
    PrevOrders AS (
      SELECT DISTINCT
        v.[ID Pedido de Venda] pedidoId,
        NULLIF(LTRIM(RTRIM(v.[Vendedor])), '') vendedor,
        v.[ID Cliente] clienteId,
        v.[Valor Total] valorTotal
      FROM dbo.Vendas v
      LEFT JOIN dbo.Clientes c ON c.[ID Cliente] = v.[ID Cliente]
      WHERE ${orderConditions('prev', 'v', 'c', true)}
        AND NULLIF(LTRIM(RTRIM(v.[Vendedor])), '') IS NOT NULL
    ),
    CurAgg AS (
      SELECT vendedor,
        SUM(valorTotal) faturamentoPedidos,
        AVG(CAST(margemLiquida AS float)) margemLiquida,
        AVG(CAST(margemBruta AS float)) margemBruta,
        SUM(peso) pesoPedidos,
        COUNT_BIG(*) pedidos,
        COUNT(DISTINCT clienteId) clientesAtivos
      FROM CurOrders GROUP BY vendedor
    ),
    PrevAgg AS (
      SELECT vendedor, SUM(valorTotal) faturamentoAnterior
      FROM PrevOrders GROUP BY vendedor
    ),
    ItemAgg AS (
      SELECT co.vendedor,
        SUM(vp.[Valor]) faturamentoItens,
        SUM(vp.[Qtde Kg]) kgItens,
        COUNT(DISTINCT p.[Fornecedor]) fornecedoresPositivados
      FROM CurOrders co
      INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = co.pedidoId
      INNER JOIN dbo.Produtos p ON p.[ID Produto] = vp.[ID Produto]
      WHERE ${productConditions('p')}
      GROUP BY co.vendedor
    ),
    PrevItemAgg AS (
      SELECT po.vendedor,
        SUM(vp.[Valor]) faturamentoItensAnterior
      FROM PrevOrders po
      INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = po.pedidoId
      INNER JOIN dbo.Produtos p ON p.[ID Produto] = vp.[ID Produto]
      WHERE ${productConditions('p')}
      GROUP BY po.vendedor
    ),
    MixByClient AS (
      SELECT co.vendedor, co.clienteId, COUNT(DISTINCT vp.[ID Produto]) produtos
      FROM CurOrders co
      INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = co.pedidoId
      INNER JOIN dbo.Produtos p ON p.[ID Produto] = vp.[ID Produto]
      WHERE ${productConditions('p')}
      GROUP BY co.vendedor, co.clienteId
    ),
    MixAgg AS (
      SELECT vendedor, AVG(CAST(produtos AS float)) mixMedio
      FROM MixByClient GROUP BY vendedor
    ),
    Portfolio AS (
      SELECT NULLIF(LTRIM(RTRIM(c.[Vendedor])), '') vendedor, COUNT(DISTINCT c.[ID Cliente]) carteiraTotal
      FROM dbo.Clientes c
      WHERE ${clientConditions('c')}
        AND NULLIF(LTRIM(RTRIM(c.[Vendedor])), '') IS NOT NULL
      GROUP BY NULLIF(LTRIM(RTRIM(c.[Vendedor])), '')
    )
    SELECT
      ca.vendedor,
      ca.faturamentoPedidos,
      pa.faturamentoAnterior,
      ia.faturamentoItens,
      pia.faturamentoItensAnterior,
      ca.margemLiquida,
      ca.margemBruta,
      ca.pesoPedidos,
      ia.kgItens,
      ca.pedidos,
      ca.clientesAtivos,
      COALESCE(po.carteiraTotal, 0) carteiraTotal,
      ma.mixMedio,
      COALESCE(ia.fornecedoresPositivados, 0) fornecedoresPositivados
    FROM CurAgg ca
    LEFT JOIN PrevAgg pa ON pa.vendedor = ca.vendedor
    LEFT JOIN ItemAgg ia ON ia.vendedor = ca.vendedor
    LEFT JOIN PrevItemAgg pia ON pia.vendedor = ca.vendedor
    LEFT JOIN MixAgg ma ON ma.vendedor = ca.vendedor
    LEFT JOIN Portfolio po ON po.vendedor = ca.vendedor
    ORDER BY ${productScoped ? 'COALESCE(ia.faturamentoItens,0)' : 'ca.faturamentoPedidos'} DESC;
  `);

  return result.recordset.map(row => {
    const faturamento = productScoped ? Number(row.faturamentoItens || 0) : Number(row.faturamentoPedidos || 0);
    const anterior = productScoped ? Number(row.faturamentoItensAnterior || 0) : Number(row.faturamentoAnterior || 0);
    const carteira = Number(row.carteiraTotal || 0);
    const ativos = Number(row.clientesAtivos || 0);
    const pedidos = Number(row.pedidos || 0);
    return {
      vendedor: row.vendedor,
      faturamento,
      faturamentoAnterior: anterior,
      crescimento: growth(faturamento, anterior),
      margemLiquida: normalizeMargin(row.margemLiquida),
      margemBruta: normalizeMargin(row.margemBruta),
      kg: productScoped ? Number(row.kgItens || 0) : Number(row.pesoPedidos || 0),
      pedidos,
      clientesAtivos: ativos,
      carteiraTotal: carteira,
      positivacao: carteira ? (ativos / carteira) * 100 : 0,
      ticketMedio: pedidos ? faturamento / pedidos : 0,
      mixMedio: Number(row.mixMedio || 0),
      fornecedoresPositivados: Number(row.fornecedoresPositivados || 0),
      tendencia: growth(faturamento, anterior) > 2 ? 'alta' : growth(faturamento, anterior) < -2 ? 'queda' : 'estavel',
    };
  });
}

async function queryEvolution(filters, range, granularity = 'dia') {
  const pool = await getPool();
  const request = pool.request();
  addInputs(request, filters, { cur: range });
  const productScoped = hasProductFilter(filters);
  const bucket = granularity === 'mes'
    ? `DATEFROMPARTS(YEAR(v.[Data]), MONTH(v.[Data]), 1)`
    : granularity === 'semana'
      ? `DATEADD(day, -(DATEDIFF(day, 0, CAST(v.[Data] AS date)) % 7), CAST(v.[Data] AS date))`
      : `CAST(v.[Data] AS date)`;

  const sqlText = productScoped ? `
    SELECT ${bucket} periodo,
      SUM(vp.[Valor]) faturamento,
      SUM(vp.[Qtde Kg]) kg,
      COUNT(DISTINCT v.[ID Pedido de Venda]) pedidos,
      COUNT(DISTINCT v.[ID Cliente]) clientes,
      AVG(CAST(vp.[Margem] AS float)) margem
    FROM dbo.Vendas v
    LEFT JOIN dbo.Clientes c ON c.[ID Cliente] = v.[ID Cliente]
    INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
    INNER JOIN dbo.Produtos p ON p.[ID Produto] = vp.[ID Produto]
    WHERE ${orderConditions('cur', 'v', 'c', false)}
      AND ${productConditions('p')}
    GROUP BY ${bucket}
    ORDER BY periodo
  ` : `
    SELECT ${bucket} periodo,
      SUM(v.[Valor Total]) faturamento,
      SUM(v.[Peso]) kg,
      COUNT_BIG(*) pedidos,
      COUNT(DISTINCT v.[ID Cliente]) clientes,
      AVG(CAST(v.[Margem Líquida] AS float)) margem
    FROM dbo.Vendas v
    LEFT JOIN dbo.Clientes c ON c.[ID Cliente] = v.[ID Cliente]
    WHERE ${orderConditions('cur', 'v', 'c', false)}
    GROUP BY ${bucket}
    ORDER BY periodo
  `;
  const result = await request.query(sqlText);
  return result.recordset.map(row => ({
    periodo: isoDate(row.periodo),
    faturamento: Number(row.faturamento || 0),
    kg: Number(row.kg || 0),
    pedidos: Number(row.pedidos || 0),
    clientes: Number(row.clientes || 0),
    ticketMedio: Number(row.pedidos || 0) ? Number(row.faturamento || 0) / Number(row.pedidos) : 0,
    margem: normalizeMargin(row.margem),
  }));
}

async function queryPortfolio(filters, range, limit = 100, page = 1) {
  const prev = previousRange(range);
  const pool = await getPool();
  const request = pool.request();
  addInputs(request, filters, { cur: range, prev });
  request.input('offsetRows', sql.Int, (page - 1) * limit);
  request.input('limitRows', sql.Int, limit);
  request.input('asOf', sql.Date, toDate(range.fim));

  const result = await request.query(`
    WITH Portfolio AS (
      SELECT
        c.[ID Cliente] id,
        c.[Cliente] cliente,
        c.[Nome Fantasia] nomeFantasia,
        c.[Cidade] cidade,
        c.[UF] uf,
        c.[Zona] zona,
        c.[SubRegião] subregiao,
        c.[Segmento] segmento,
        c.[Status] status,
        c.[Bloqueio] bloqueio,
        c.[Boletos Vencidos] boletosVencidos,
        c.[Cliente Desde] clienteDesde,
        c.[Data Último Pedido] dataUltimoPedido,
        c.[Vendedor] vendedor,
        c.[Limite de Crédito] limiteCredito,
        c.[Saldo de Crédito] saldoCredito
      FROM dbo.Clientes c
      WHERE ${clientConditions('c')}
    ),
    Cur AS (
      SELECT v.[ID Cliente] id, SUM(v.[Valor Total]) faturamento, COUNT_BIG(*) pedidos, MAX(v.[Data]) ultimaCompra
      FROM dbo.Vendas v
      LEFT JOIN dbo.Clientes c ON c.[ID Cliente] = v.[ID Cliente]
      WHERE ${orderConditions('cur', 'v', 'c', true)}
      GROUP BY v.[ID Cliente]
    ),
    Prev AS (
      SELECT v.[ID Cliente] id, SUM(v.[Valor Total]) faturamento
      FROM dbo.Vendas v
      LEFT JOIN dbo.Clientes c ON c.[ID Cliente] = v.[ID Cliente]
      WHERE ${orderConditions('prev', 'v', 'c', true)}
      GROUP BY v.[ID Cliente]
    ),
    History AS (
      SELECT x.[ID Cliente] id,
        MAX(x.[Data]) ultimaCompraHistorica,
        AVG(CAST(x.intervalo AS float)) intervaloMedio
      FROM (
        SELECT v.[ID Cliente], v.[Data],
          DATEDIFF(day, LAG(v.[Data]) OVER (PARTITION BY v.[ID Cliente] ORDER BY v.[Data]), v.[Data]) intervalo
        FROM dbo.Vendas v
        WHERE v.[Data] >= DATEADD(day, -365, @asOf)
          AND v.[Data] < DATEADD(day, 1, @asOf)
      ) x
      GROUP BY x.[ID Cliente]
    )
    SELECT
      p.*,
      COALESCE(cur.faturamento, 0) faturamento,
      COALESCE(prev.faturamento, 0) faturamentoAnterior,
      COALESCE(cur.pedidos, 0) pedidos,
      COALESCE(cur.ultimaCompra, h.ultimaCompraHistorica, p.dataUltimoPedido) ultimaCompra,
      h.intervaloMedio,
      DATEDIFF(day, COALESCE(cur.ultimaCompra, h.ultimaCompraHistorica, p.dataUltimoPedido), @asOf) diasSemComprar,
      COUNT_BIG(*) OVER() totalRegistros
    FROM Portfolio p
    LEFT JOIN Cur cur ON cur.id = p.id
    LEFT JOIN Prev prev ON prev.id = p.id
    LEFT JOIN History h ON h.id = p.id
    ORDER BY COALESCE(cur.faturamento, 0) DESC, p.cliente
    OFFSET @offsetRows ROWS FETCH NEXT @limitRows ROWS ONLY;
  `);

  const rows = result.recordset.map(row => ({
    ...row,
    faturamento: Number(row.faturamento || 0),
    faturamentoAnterior: Number(row.faturamentoAnterior || 0),
    crescimento: growth(row.faturamento, row.faturamentoAnterior),
    pedidos: Number(row.pedidos || 0),
    intervaloMedio: row.intervaloMedio == null ? null : Number(row.intervaloMedio),
    diasSemComprar: row.diasSemComprar == null ? null : Number(row.diasSemComprar),
    totalRegistros: Number(row.totalRegistros || 0),
  }));
  return { pagina: page, limite: limit, total: rows[0]?.totalRegistros || 0, rows };
}

async function queryRisk(filters, range, limit = 80) {
  const prev = previousRange(range);
  const pool = await getPool();
  const request = pool.request();
  addInputs(request, filters, { cur: range, prev });
  request.input('asOf', sql.Date, toDate(range.fim));
  request.input('limite', sql.Int, limit);

  const result = await request.query(`
    WITH Portfolio AS (
      SELECT c.[ID Cliente] id, c.[Cliente] cliente, c.[Nome Fantasia] nomeFantasia,
        c.[Vendedor] vendedor, c.[Cidade] cidade, c.[UF] uf, c.[Segmento] segmento
      FROM dbo.Clientes c WHERE ${clientConditions('c')}
    ),
    Cur AS (
      SELECT v.[ID Cliente] id, SUM(v.[Valor Total]) faturamento, COUNT_BIG(*) pedidos, MAX(v.[Data]) ultima
      FROM dbo.Vendas v LEFT JOIN dbo.Clientes c ON c.[ID Cliente] = v.[ID Cliente]
      WHERE ${orderConditions('cur', 'v', 'c', true)}
      GROUP BY v.[ID Cliente]
    ),
    Prev AS (
      SELECT v.[ID Cliente] id, SUM(v.[Valor Total]) faturamento
      FROM dbo.Vendas v LEFT JOIN dbo.Clientes c ON c.[ID Cliente] = v.[ID Cliente]
      WHERE ${orderConditions('prev', 'v', 'c', true)}
      GROUP BY v.[ID Cliente]
    ),
    MixCur AS (
      SELECT v.[ID Cliente] id, COUNT(DISTINCT vp.[ID Produto]) mix
      FROM dbo.Vendas v
      LEFT JOIN dbo.Clientes c ON c.[ID Cliente] = v.[ID Cliente]
      INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
      INNER JOIN dbo.Produtos p ON p.[ID Produto] = vp.[ID Produto]
      WHERE ${orderConditions('cur', 'v', 'c', false)} AND ${productConditions('p')}
      GROUP BY v.[ID Cliente]
    ),
    MixPrev AS (
      SELECT v.[ID Cliente] id, COUNT(DISTINCT vp.[ID Produto]) mix
      FROM dbo.Vendas v
      LEFT JOIN dbo.Clientes c ON c.[ID Cliente] = v.[ID Cliente]
      INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
      INNER JOIN dbo.Produtos p ON p.[ID Produto] = vp.[ID Produto]
      WHERE ${orderConditions('prev', 'v', 'c', false)} AND ${productConditions('p')}
      GROUP BY v.[ID Cliente]
    ),
    HistBase AS (
      SELECT v.[ID Cliente] id, v.[Data],
        DATEDIFF(day, LAG(v.[Data]) OVER (PARTITION BY v.[ID Cliente] ORDER BY v.[Data]), v.[Data]) intervalo
      FROM dbo.Vendas v
      WHERE v.[Data] >= DATEADD(day,-365,@asOf) AND v.[Data] < DATEADD(day,1,@asOf)
    ),
    Hist AS (
      SELECT id, MAX([Data]) ultima, AVG(CAST(intervalo AS float)) intervaloMedio
      FROM HistBase GROUP BY id
    )
    SELECT TOP (@limite)
      p.*, COALESCE(cur.faturamento,0) faturamento, COALESCE(prev.faturamento,0) faturamentoAnterior,
      COALESCE(mc.mix,0) mix, COALESCE(mp.mix,0) mixAnterior,
      h.ultima ultimaCompra, h.intervaloMedio,
      DATEDIFF(day,h.ultima,@asOf) diasSemComprar
    FROM Portfolio p
    LEFT JOIN Cur cur ON cur.id=p.id
    LEFT JOIN Prev prev ON prev.id=p.id
    LEFT JOIN MixCur mc ON mc.id=p.id
    LEFT JOIN MixPrev mp ON mp.id=p.id
    LEFT JOIN Hist h ON h.id=p.id
    WHERE h.ultima IS NOT NULL
    ORDER BY
      CASE WHEN COALESCE(prev.faturamento,0)>0 AND COALESCE(cur.faturamento,0)<=COALESCE(prev.faturamento,0)*0.6 THEN 2 ELSE 0 END
      + CASE WHEN DATEDIFF(day,h.ultima,@asOf)>CASE WHEN COALESCE(h.intervaloMedio,0)*1.8>30 THEN COALESCE(h.intervaloMedio,0)*1.8 ELSE 30 END THEN 2 ELSE 0 END
      + CASE WHEN DATEDIFF(day,h.ultima,@asOf)>45 THEN 1 ELSE 0 END
      + CASE WHEN COALESCE(mp.mix,0)>0 AND COALESCE(mc.mix,0)<=COALESCE(mp.mix,0)*0.6 THEN 1 ELSE 0 END DESC,
      COALESCE(prev.faturamento,0) DESC;
  `);

  return result.recordset.map(row => {
    let score = 0;
    const faturamento = Number(row.faturamento || 0);
    const anterior = Number(row.faturamentoAnterior || 0);
    const interval = Number(row.intervaloMedio || 0);
    const days = Number(row.diasSemComprar || 0);
    const mix = Number(row.mix || 0);
    const mixPrev = Number(row.mixAnterior || 0);
    if (anterior > 0 && faturamento <= anterior * 0.6) score += 2;
    if (days > Math.max(interval * 1.8, 30)) score += 2;
    if (days > 45) score += 1;
    if (mixPrev > 0 && mix <= mixPrev * 0.6) score += 1;
    return {
      ...row,
      faturamento,
      faturamentoAnterior: anterior,
      variacao: growth(faturamento, anterior),
      intervaloMedio: interval || null,
      diasSemComprar: days,
      mix,
      mixAnterior: mixPrev,
      score,
      risco: score >= 4 ? 'alto' : score >= 2 ? 'medio' : score >= 1 ? 'baixo' : 'estavel',
    };
  }).filter(row => row.score > 0);
}

async function queryRecovered(filters, range, limit = 100) {
  const pool = await getPool();
  const request = pool.request();
  addInputs(request, filters, { cur: range });
  request.input('limite', sql.Int, limit);
  const result = await request.query(`
    WITH FirstCurrent AS (
      SELECT v.[ID Cliente] id, MIN(v.[Data]) primeiraVolta
      FROM dbo.Vendas v LEFT JOIN dbo.Clientes c ON c.[ID Cliente]=v.[ID Cliente]
      WHERE ${orderConditions('cur','v','c',true)}
      GROUP BY v.[ID Cliente]
    ),
    LastBefore AS (
      SELECT fc.id, fc.primeiraVolta, MAX(v.[Data]) ultimaAntes
      FROM FirstCurrent fc
      LEFT JOIN dbo.Vendas v ON v.[ID Cliente]=fc.id AND v.[Data] < @curInicio
      GROUP BY fc.id, fc.primeiraVolta
    ),
    CurValue AS (
      SELECT v.[ID Cliente] id, SUM(v.[Valor Total]) receita
      FROM dbo.Vendas v LEFT JOIN dbo.Clientes c ON c.[ID Cliente]=v.[ID Cliente]
      WHERE ${orderConditions('cur','v','c',true)}
      GROUP BY v.[ID Cliente]
    )
    SELECT TOP (@limite)
      c.[ID Cliente] id, c.[Cliente] cliente, c.[Nome Fantasia] nomeFantasia, c.[Vendedor] vendedor,
      lb.primeiraVolta, lb.ultimaAntes, DATEDIFF(day,lb.ultimaAntes,lb.primeiraVolta) diasAusente,
      cv.receita
    FROM LastBefore lb
    INNER JOIN dbo.Clientes c ON c.[ID Cliente]=lb.id
    LEFT JOIN CurValue cv ON cv.id=lb.id
    WHERE lb.ultimaAntes IS NOT NULL AND DATEDIFF(day,lb.ultimaAntes,lb.primeiraVolta)>=60
    ORDER BY cv.receita DESC;
  `);
  const rows = result.recordset.map(r => ({ ...r, receita: Number(r.receita || 0), diasAusente: Number(r.diasAusente || 0) }));
  return { total: rows.length, receitaRecuperada: rows.reduce((s, r) => s + r.receita, 0), rows };
}

async function queryNewClients(filters, range, limit = 100) {
  const pool = await getPool();
  const request = pool.request();
  addInputs(request, filters, { cur: range });
  request.input('limite', sql.Int, limit);
  const result = await request.query(`
    WITH Sales AS (
      SELECT v.[ID Cliente] id, SUM(v.[Valor Total]) faturamento, COUNT_BIG(*) pedidos
      FROM dbo.Vendas v LEFT JOIN dbo.Clientes c ON c.[ID Cliente]=v.[ID Cliente]
      WHERE ${orderConditions('cur','v','c',true)}
      GROUP BY v.[ID Cliente]
    )
    SELECT TOP (@limite)
      c.[ID Cliente] id, c.[Cliente] cliente, c.[Nome Fantasia] nomeFantasia, c.[Vendedor] vendedor,
      c.[Cliente Desde] clienteDesde, c.[Cidade] cidade, c.[UF] uf,
      COALESCE(s.faturamento,0) faturamento, COALESCE(s.pedidos,0) pedidos
    FROM dbo.Clientes c
    LEFT JOIN Sales s ON s.id=c.[ID Cliente]
    WHERE ${clientConditions('c')}
      AND c.[Cliente Desde] >= @curInicio
      AND c.[Cliente Desde] < DATEADD(day,1,@curFim)
    ORDER BY COALESCE(s.faturamento,0) DESC;
  `);
  const rows = result.recordset.map(r => ({ ...r, faturamento: Number(r.faturamento || 0), pedidos: Number(r.pedidos || 0) }));
  return {
    total: rows.length,
    faturamento: rows.reduce((s, r) => s + r.faturamento, 0),
    ticketMedio: rows.reduce((s, r) => s + r.pedidos, 0) ? rows.reduce((s, r) => s + r.faturamento, 0) / rows.reduce((s, r) => s + r.pedidos, 0) : 0,
    rows,
  };
}

async function querySuppliers(filters, range, limit = 50) {
  const pool = await getPool();
  const request = pool.request();
  addInputs(request, filters, { cur: range });
  request.input('limite', sql.Int, limit);
  const result = await request.query(`
    WITH Portfolio AS (
      SELECT COUNT(DISTINCT c.[ID Cliente]) total FROM dbo.Clientes c WHERE ${clientConditions('c')}
    )
    SELECT TOP (@limite)
      NULLIF(LTRIM(RTRIM(p.[Fornecedor])), '') fornecedor,
      SUM(vp.[Valor]) faturamento,
      SUM(vp.[Qtde Kg]) kg,
      AVG(CAST(vp.[Margem] AS float)) margem,
      COUNT(DISTINCT v.[ID Cliente]) clientesPositivados,
      COUNT(DISTINCT vp.[ID Produto]) produtos,
      COUNT(DISTINCT v.[ID Pedido de Venda]) pedidos,
      MAX(po.total) carteiraTotal
    FROM dbo.Vendas v
    LEFT JOIN dbo.Clientes c ON c.[ID Cliente]=v.[ID Cliente]
    INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda]=v.[ID Pedido de Venda]
    INNER JOIN dbo.Produtos p ON p.[ID Produto]=vp.[ID Produto]
    CROSS JOIN Portfolio po
    WHERE ${orderConditions('cur','v','c',false)}
      AND ${productConditions('p')}
      AND NULLIF(LTRIM(RTRIM(p.[Fornecedor])), '') IS NOT NULL
    GROUP BY NULLIF(LTRIM(RTRIM(p.[Fornecedor])), '')
    ORDER BY SUM(vp.[Valor]) DESC;
  `);
  return result.recordset.map(r => {
    const carteira = Number(r.carteiraTotal || 0);
    const clientes = Number(r.clientesPositivados || 0);
    return {
      fornecedor: r.fornecedor,
      faturamento: Number(r.faturamento || 0),
      kg: Number(r.kg || 0),
      margem: normalizeMargin(r.margem),
      clientesPositivados: clientes,
      produtos: Number(r.produtos || 0),
      pedidos: Number(r.pedidos || 0),
      carteiraTotal: carteira,
      penetracao: carteira ? (clientes / carteira) * 100 : 0,
      clientesNaoPositivados: Math.max(0, carteira - clientes),
    };
  });
}

async function queryMix(filters, range, limit = 80) {
  const pool = await getPool();
  const request = pool.request();
  addInputs(request, filters, { cur: range });
  request.input('limite', sql.Int, limit);
  const result = await request.query(`
    WITH ClientMix AS (
      SELECT
        v.[ID Cliente] id,
        MAX(c.[Cliente]) cliente,
        MAX(c.[Nome Fantasia]) nomeFantasia,
        MAX(c.[Vendedor]) vendedor,
        MAX(c.[Segmento]) segmento,
        COUNT(DISTINCT vp.[ID Produto]) produtos,
        COUNT(DISTINCT p.[Grupo]) grupos,
        COUNT(DISTINCT p.[Sub-grupo]) subgrupos,
        COUNT(DISTINCT p.[Fornecedor]) fornecedores
      FROM dbo.Vendas v
      LEFT JOIN dbo.Clientes c ON c.[ID Cliente]=v.[ID Cliente]
      INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda]=v.[ID Pedido de Venda]
      INNER JOIN dbo.Produtos p ON p.[ID Produto]=vp.[ID Produto]
      WHERE ${orderConditions('cur','v','c',false)}
        AND ${productConditions('p')}
      GROUP BY v.[ID Cliente]
    ),
    Bench AS (
      SELECT segmento, AVG(CAST(grupos AS float)) mediaGrupos
      FROM ClientMix
      WHERE NULLIF(LTRIM(RTRIM(segmento)), '') IS NOT NULL
      GROUP BY segmento
    )
    SELECT TOP (@limite) cm.*, b.mediaGrupos
    FROM ClientMix cm
    LEFT JOIN Bench b ON b.segmento=cm.segmento
    ORDER BY CASE WHEN COALESCE(b.mediaGrupos,0)-cm.grupos>0 THEN COALESCE(b.mediaGrupos,0)-cm.grupos ELSE 0 END DESC, cm.produtos ASC;
  `);
  const rows = result.recordset.map(r => ({
    ...r,
    produtos: Number(r.produtos || 0),
    grupos: Number(r.grupos || 0),
    subgrupos: Number(r.subgrupos || 0),
    fornecedores: Number(r.fornecedores || 0),
    mediaGruposSegmento: Number(r.mediaGrupos || 0),
    oportunidadeGrupos: Math.max(0, Math.ceil(Number(r.mediaGrupos || 0) - Number(r.grupos || 0))),
  }));
  const avg = key => rows.length ? rows.reduce((s, r) => s + Number(r[key] || 0), 0) / rows.length : 0;
  return {
    resumo: { produtosMedio: avg('produtos'), gruposMedio: avg('grupos'), subgruposMedio: avg('subgrupos'), fornecedoresMedio: avg('fornecedores') },
    oportunidades: rows.filter(r => r.oportunidadeGrupos > 0),
    rows,
  };
}

async function queryHeatmap(filters, range) {
  const pool = await getPool();
  const request = pool.request();
  addInputs(request, filters, { cur: range });
  const result = await request.query(`
    WITH TopSellers AS (
      SELECT TOP 20 NULLIF(LTRIM(RTRIM(v.[Vendedor])), '') vendedor, SUM(v.[Valor Total]) faturamento
      FROM dbo.Vendas v LEFT JOIN dbo.Clientes c ON c.[ID Cliente]=v.[ID Cliente]
      WHERE ${orderConditions('cur','v','c',true)}
        AND NULLIF(LTRIM(RTRIM(v.[Vendedor])), '') IS NOT NULL
      GROUP BY NULLIF(LTRIM(RTRIM(v.[Vendedor])), '')
      ORDER BY SUM(v.[Valor Total]) DESC
    ),
    TopSuppliers AS (
      SELECT TOP 12 NULLIF(LTRIM(RTRIM(p.[Fornecedor])), '') fornecedor, SUM(vp.[Valor]) faturamento
      FROM dbo.Vendas v LEFT JOIN dbo.Clientes c ON c.[ID Cliente]=v.[ID Cliente]
      INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda]=v.[ID Pedido de Venda]
      INNER JOIN dbo.Produtos p ON p.[ID Produto]=vp.[ID Produto]
      WHERE ${orderConditions('cur','v','c',false)}
        AND ${productConditions('p')}
        AND NULLIF(LTRIM(RTRIM(p.[Fornecedor])), '') IS NOT NULL
      GROUP BY NULLIF(LTRIM(RTRIM(p.[Fornecedor])), '')
      ORDER BY SUM(vp.[Valor]) DESC
    ),
    Portfolio AS (
      SELECT NULLIF(LTRIM(RTRIM(c.[Vendedor])), '') vendedor, COUNT(DISTINCT c.[ID Cliente]) carteira
      FROM dbo.Clientes c WHERE ${clientConditions('c')}
      GROUP BY NULLIF(LTRIM(RTRIM(c.[Vendedor])), '')
    ),
    Pos AS (
      SELECT NULLIF(LTRIM(RTRIM(v.[Vendedor])), '') vendedor,
        NULLIF(LTRIM(RTRIM(p.[Fornecedor])), '') fornecedor,
        COUNT(DISTINCT v.[ID Cliente]) clientes
      FROM dbo.Vendas v LEFT JOIN dbo.Clientes c ON c.[ID Cliente]=v.[ID Cliente]
      INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda]=v.[ID Pedido de Venda]
      INNER JOIN dbo.Produtos p ON p.[ID Produto]=vp.[ID Produto]
      WHERE ${orderConditions('cur','v','c',false)}
        AND ${productConditions('p')}
      GROUP BY NULLIF(LTRIM(RTRIM(v.[Vendedor])), ''), NULLIF(LTRIM(RTRIM(p.[Fornecedor])), '')
    )
    SELECT s.vendedor, f.fornecedor, COALESCE(pos.clientes,0) clientes, COALESCE(po.carteira,0) carteira
    FROM TopSellers s CROSS JOIN TopSuppliers f
    LEFT JOIN Pos pos ON pos.vendedor=s.vendedor AND pos.fornecedor=f.fornecedor
    LEFT JOIN Portfolio po ON po.vendedor=s.vendedor
    ORDER BY s.faturamento DESC, f.faturamento DESC;
  `);
  const cells = result.recordset.map(r => ({
    vendedor: r.vendedor,
    fornecedor: r.fornecedor,
    clientes: Number(r.clientes || 0),
    carteira: Number(r.carteira || 0),
    percentual: Number(r.carteira || 0) ? (Number(r.clientes || 0) / Number(r.carteira)) * 100 : 0,
  }));
  return {
    vendedores: [...new Set(cells.map(c => c.vendedor))],
    fornecedores: [...new Set(cells.map(c => c.fornecedor))],
    cells,
  };
}

async function querySeller360(filters, range, seller) {
  if (!seller) throw Object.assign(new Error('Informe o vendedor para abrir o Vendedor 360.'), { status: 400 });
  const scoped = { ...filters, vendedor: seller };
  const [summary, evolution, portfolio, risk, suppliers, mix, recovered, newClients] = await Promise.all([
    querySummary(scoped, range),
    queryEvolution(scoped, range, 'dia'),
    queryPortfolio(scoped, range, 50, 1),
    queryRisk(scoped, range, 30),
    querySuppliers(scoped, range, 20),
    queryMix(scoped, range, 30),
    queryRecovered(scoped, range, 30),
    queryNewClients(scoped, range, 30),
  ]);
  const sortedGrowth = [...portfolio.rows].filter(r => r.faturamentoAnterior > 0 || r.faturamento > 0).sort((a, b) => b.crescimento - a.crescimento);
  return {
    vendedor: seller,
    summary,
    evolution,
    portfolio,
    risk,
    suppliers,
    mix,
    recovered,
    newClients,
    clientesCrescimento: sortedGrowth.slice(0, 8),
    clientesQueda: sortedGrowth.slice(-8).reverse(),
  };
}

async function queryAttention(filters, range) {
  const [risks, sellers, gaps, recovered, mix] = await Promise.all([
    queryRisk(filters, range, 40),
    querySellers(filters, range),
    querySuppliers(filters, range, 12),
    queryRecovered(filters, range, 50),
    queryMix(filters, range, 50),
  ]);
  const insights = [];
  const highRisk = risks.filter(r => r.risco === 'alto');
  if (highRisk.length) insights.push({
    tipo: 'risco', nivel: 'critico',
    titulo: `${highRisk.length} cliente${highRisk.length === 1 ? '' : 's'} em alto risco`,
    detalhe: 'Queda de compra, recompra atrasada ou redução relevante de mix.',
    quantidade: highRisk.length,
  });
  const delayed = risks.filter(r => r.intervaloMedio && r.diasSemComprar > Math.max(r.intervaloMedio * 1.8, 30));
  if (delayed.length) insights.push({
    tipo: 'recompra', nivel: 'atencao',
    titulo: `${delayed.length} cliente${delayed.length === 1 ? '' : 's'} com recompra atrasada`,
    detalhe: 'O intervalo atual passou do padrão histórico de compra.',
    quantidade: delayed.length,
  });
  const fallingSellers = sellers.filter(s => s.crescimento <= -10);
  if (fallingSellers.length) insights.push({
    tipo: 'vendedores', nivel: 'atencao',
    titulo: `${fallingSellers.length} vendedor${fallingSellers.length === 1 ? '' : 'es'} com queda acima de 10%`,
    detalhe: fallingSellers.slice(0, 4).map(s => s.vendedor).join(', '),
    quantidade: fallingSellers.length,
  });
  const supplierGap = [...gaps].sort((a, b) => b.clientesNaoPositivados - a.clientesNaoPositivados)[0];
  if (supplierGap?.clientesNaoPositivados > 0) insights.push({
    tipo: 'fornecedor', nivel: 'oportunidade',
    titulo: `${supplierGap.fornecedor}: ${supplierGap.clientesNaoPositivados} clientes ainda não positivados`,
    detalhe: `Penetração atual de ${supplierGap.penetracao.toFixed(1)}% na carteira filtrada.`,
    quantidade: supplierGap.clientesNaoPositivados,
  });
  const mixOpp = mix.oportunidades.length;
  if (mixOpp) insights.push({
    tipo: 'mix', nivel: 'oportunidade',
    titulo: `${mixOpp} cliente${mixOpp === 1 ? '' : 's'} abaixo da média de grupos do próprio segmento`,
    detalhe: 'Oportunidade calculada por comparação com clientes semelhantes.',
    quantidade: mixOpp,
  });
  if (recovered.total) insights.push({
    tipo: 'recuperados', nivel: 'positivo',
    titulo: `${recovered.total} cliente${recovered.total === 1 ? '' : 's'} recuperado${recovered.total === 1 ? '' : 's'} no período`,
    detalhe: `Receita após reativação: ${recovered.receitaRecuperada.toFixed(2)}.`,
    quantidade: recovered.total,
  });
  return insights;
}

async function queryComparison(filters, range, a, b) {
  if (!a || !b || a === b) throw Object.assign(new Error('Selecione dois vendedores diferentes para comparar.'), { status: 400 });
  const [left, right] = await Promise.all([
    querySeller360(filters, range, a),
    querySeller360(filters, range, b),
  ]);
  return { a: left, b: right };
}

async function diagnostics() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT DB_NAME() banco, GETDATE() dataServidor,
      (SELECT COUNT_BIG(*) FROM dbo.Vendas) vendas,
      (SELECT COUNT_BIG(*) FROM dbo.VendasProdutos) vendasProdutos,
      (SELECT COUNT_BIG(*) FROM dbo.Clientes) clientes,
      (SELECT COUNT_BIG(*) FROM dbo.Produtos) produtos;
  `);
  return { ok: true, source: 'SQL Server · Power BI', ...result.recordset[0] };
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido.' });

    const recurso = text(req.query.recurso || 'resumo', 60);
    const range = resolveRange(req.query);
    const filters = filtersFrom(req.query);
    const limit = positiveInt(req.query.limite, 80, 300);
    const page = positiveInt(req.query.pagina, 1, 10000);
    const key = cacheKey(recurso, req.query);

    const factory = async () => {
      switch (recurso) {
        case 'filtros': return queryFilters();
        case 'resumo': return querySummary(filters, range);
        case 'vendedores':
        case 'rankings': return querySellers(filters, range);
        case 'evolucao': return queryEvolution(filters, range, ['dia', 'semana', 'mes'].includes(req.query.granularidade) ? req.query.granularidade : 'dia');
        case 'carteira': return queryPortfolio(filters, range, limit, page);
        case 'clientes-risco': return queryRisk(filters, range, limit);
        case 'clientes-recuperados': return queryRecovered(filters, range, limit);
        case 'clientes-novos': return queryNewClients(filters, range, limit);
        case 'fornecedores':
        case 'gap-fornecedor': return querySuppliers(filters, range, limit);
        case 'mix': return queryMix(filters, range, limit);
        case 'heatmap': return queryHeatmap(filters, range);
        case 'vendedor-360': return querySeller360(filters, range, text(req.query.vendedor || filters.vendedor));
        case 'comparacao': return queryComparison(filters, range, text(req.query.vendedorA), text(req.query.vendedorB));
        case 'atencao': return queryAttention(filters, range);
        case 'diagnostico': return diagnostics();
        default:
          throw Object.assign(new Error(`Recurso desconhecido: ${recurso}`), { status: 404 });
      }
    };

    const ttl = recurso === 'filtros' ? FILTER_CACHE_MS : CACHE_MS;
    const data = await withCache(key, ttl, factory);
    return res.status(200).json({
      ok: true,
      recurso,
      atualizadoEm: new Date().toISOString(),
      filtros: filters,
      periodo: range,
      data,
    });
  } catch (error) {
    console.error('[performance-comercial]', error);
    return res.status(error.status || 500).json({
      ok: false,
      erro: error.message || 'Falha ao consultar Performance Comercial.',
      codigo: 'PERFORMANCE_COMERCIAL_ERROR',
    });
  }
}
