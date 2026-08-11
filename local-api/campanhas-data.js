/**
 * PMG Connect — Campanhas API local 5.0
 *
 * A página hospedada na Vercel usa esta rota local para acessar o SQL Server,
 * exatamente como o Dashboard Regional. O contexto comercial é carregado uma
 * única vez, mantido em memória e persistido em disco. Depois disso, pesquisa
 * de fornecedor, produto e representante acontece no navegador sem novas
 * consultas ao SQL.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, resetPool, sql, diagnosticoConfiguracaoSql } from '../src/lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.resolve(__dirname, '../data/campanhas-contexto-v5.json');
const CACHE_VERSION = 5;
const CONTEXT_TTL_MS = 6 * 60 * 60 * 1000;
const PERFORMANCE_CACHE_TTL_MS = 2 * 60 * 1000;
const performanceCache = new Map();

function stablePerformanceKey({ currentStart, currentEnd, previousStart, previousEnd, productIds, supplierIds, sellers, activationProductIds = [] }) {
  return JSON.stringify({
    currentStart:String(currentStart),
    currentEnd:String(currentEnd),
    previousStart:String(previousStart),
    previousEnd:String(previousEnd),
    productIds:[...productIds].sort((a,b) => a-b),
    supplierIds:[...supplierIds].sort((a,b) => a-b),
    sellers:[...sellers].sort((a,b) => a.localeCompare(b, 'pt-BR')),
    activationProductIds:[...activationProductIds].sort((a,b) => a-b),
  });
}

function prunePerformanceCache() {
  const now = Date.now();
  for (const [key, entry] of performanceCache.entries()) {
    if (!entry || now - entry.createdAt > PERFORMANCE_CACHE_TTL_MS) performanceCache.delete(key);
  }
}

const state = {
  status: 'idle',
  phase: 'idle',
  progress: 0,
  message: 'Aguardando preparação.',
  startedAt: null,
  updatedAt: null,
  context: null,
  fromDisk: false,
  stale: false,
  error: null,
};

let warmupPromise = null;
let diskLoaded = false;

const text = (value) => String(value ?? '').trim();
const norm = (value) => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const nowIso = () => new Date().toISOString();

function setProgress(phase, progress, message) {
  state.phase = phase;
  state.progress = progress;
  state.message = message;
}

function publicStatus() {
  return {
    ok: state.status !== 'error',
    ready: Boolean(state.context),
    status: state.status,
    phase: state.phase,
    progress: state.progress,
    message: state.message,
    startedAt: state.startedAt,
    updatedAt: state.updatedAt,
    fromDisk: state.fromDisk,
    stale: state.stale,
    counts: state.context ? {
      fornecedores: state.context.suppliers.length,
      produtos: state.context.products.length,
      representantes: state.context.representatives.length,
    } : { fornecedores: 0, produtos: 0, representantes: 0 },
    error: state.error,
    version: '5.5.0',
  };
}

async function loadDiskCache() {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.version !== CACHE_VERSION || !parsed?.context) return;
    state.context = parsed.context;
    state.updatedAt = parsed.updatedAt || null;
    state.fromDisk = true;
    state.stale = !state.updatedAt || Date.now() - new Date(state.updatedAt).getTime() > CONTEXT_TTL_MS;
    state.status = 'ready';
    state.phase = 'ready';
    state.progress = 100;
    state.message = state.stale ? 'Contexto local carregado; atualização em segundo plano.' : 'Contexto comercial pronto.';
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn('[campanhas-v5] cache:', error.message);
  }
}

async function saveDiskCache() {
  if (!state.context) return;
  await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
  const tmp = `${CACHE_PATH}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({
    version: CACHE_VERSION,
    updatedAt: state.updatedAt,
    context: state.context,
  }), 'utf8');
  try {
    await fs.rename(tmp, CACHE_PATH);
  } catch (error) {
    // No Windows, rename pode falhar quando o destino já existe.
    if (!['EEXIST', 'EPERM'].includes(error?.code)) throw error;
    await fs.rm(CACHE_PATH, { force: true });
    await fs.rename(tmp, CACHE_PATH);
  }
}

function mapProduct(row) {
  return {
    id: Number(row.id),
    name: text(row.name),
    unit: text(row.unit),
    factor: Number(row.factor) || 0,
    master: Number(row.master) || 0,
    group: text(row.groupName),
    subgroup: text(row.subgroupName),
    supplierId: Number(row.supplierId) || null,
    supplierName: text(row.supplierName),
    manufacturer: text(row.manufacturer),
    status: text(row.status),
  };
}

function deriveSuppliers(products) {
  const map = new Map();
  for (const product of products) {
    if (!product.supplierId && !product.supplierName) continue;
    const key = product.supplierId ? `id:${product.supplierId}` : `nome:${norm(product.supplierName)}`;
    if (!map.has(key)) map.set(key, {
      id: product.supplierId,
      code: product.supplierId,
      name: product.supplierName || `Fornecedor ${product.supplierId}`,
      nameFrequency: new Map(),
      totalProducts: 0,
      activeProducts: 0,
      groups: new Set(),
      subgroups: new Set(),
    });
    const item = map.get(key);
    if (product.supplierName) item.nameFrequency.set(product.supplierName, (item.nameFrequency.get(product.supplierName) || 0) + 1);
    item.totalProducts += 1;
    if (!product.status || norm(product.status).includes('ativ')) item.activeProducts += 1;
    if (product.group) item.groups.add(product.group);
    if (product.subgroup) item.subgroups.add(product.subgroup);
  }
  return [...map.values()].map((item) => {
    const preferredName = [...item.nameFrequency.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))[0]?.[0] || item.name;
    return {
      id: item.id,
      code: item.code,
      name: preferredName,
      totalProducts: item.totalProducts,
      activeProducts: item.activeProducts,
      groups: [...item.groups].sort((a, b) => a.localeCompare(b, 'pt-BR')),
      subgroups: [...item.subgroups].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    };
  }).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR') || Number(a.id || 0) - Number(b.id || 0));
}

async function queryContext() {
  const pool = await getPool();
  const result = await pool.request().query(`
    SELECT
      p.[ID Produto] AS id,
      p.[Produto] AS name,
      p.[Unidade] AS unit,
      p.[Fator Unidade] AS factor,
      p.[Master] AS master,
      p.[Grupo] AS groupName,
      p.[Sub-grupo] AS subgroupName,
      p.[ID Fornecedor] AS supplierId,
      LTRIM(RTRIM(p.[Fornecedor])) AS supplierName,
      p.[Fabricante] AS manufacturer,
      p.[Status] AS status
    FROM dbo.Produtos p
    WHERE p.[ID Produto] IS NOT NULL
      AND (
        NULLIF(LTRIM(RTRIM(ISNULL(p.[Status], ''))), '') IS NULL
        OR UPPER(LTRIM(RTRIM(p.[Status]))) LIKE 'ATIV%'
      );

    SELECT
      LTRIM(RTRIM(c.[Vendedor])) AS name,
      COUNT(DISTINCT c.[ID Cliente]) AS portfolioClients,
      COUNT(DISTINCT CASE
        WHEN UPPER(LTRIM(RTRIM(ISNULL(c.[Status], '')))) LIKE 'ATIV%'
        THEN c.[ID Cliente]
      END) AS activeClients,
      MAX(c.[Data Último Pedido]) AS lastOrderDate
    FROM dbo.Clientes c
    WHERE NULLIF(LTRIM(RTRIM(c.[Vendedor])), '') IS NOT NULL
    GROUP BY LTRIM(RTRIM(c.[Vendedor]))
    HAVING COUNT(DISTINCT CASE
      WHEN UPPER(LTRIM(RTRIM(ISNULL(c.[Status], '')))) LIKE 'ATIV%'
      THEN c.[ID Cliente]
    END) > 0
    ORDER BY LTRIM(RTRIM(c.[Vendedor]));
  `);

  const products = (result.recordsets?.[0] || [])
    .map(mapProduct)
    .filter((item) => Number.isFinite(item.id))
    .sort((a, b) => Number(a.supplierId || 0) - Number(b.supplierId || 0)
      || a.group.localeCompare(b.group, 'pt-BR')
      || a.subgroup.localeCompare(b.subgroup, 'pt-BR')
      || a.name.localeCompare(b.name, 'pt-BR'));
  const representatives = (result.recordsets?.[1] || []).map((row) => ({
    id: `sql:${text(row.name)}`,
    name: text(row.name),
    active: true,
    activeClients: Number(row.activeClients) || 0,
    portfolioClients: Number(row.portfolioClients) || 0,
    lastOrderDate: row.lastOrderDate || null,
    source: 'dbo.Clientes',
  })).filter((item) => item.name);

  return {
    suppliers: deriveSuppliers(products),
    products,
    representatives,
  };
}

async function prepareContext({ force = false } = {}) {
  await loadDiskCache();
  const fresh = state.context && state.updatedAt && Date.now() - new Date(state.updatedAt).getTime() < CONTEXT_TTL_MS;
  if (!force && fresh) return state.context;
  if (warmupPromise) return warmupPromise;

  state.status = 'loading';
  state.startedAt = nowIso();
  state.error = null;
  setProgress('connect', 8, 'Conectando ao SQL Server da PMG…');

  warmupPromise = (async () => {
    try {
      setProgress('query', 20, 'Carregando produtos e representantes ativos…');
      const context = await queryContext();
      setProgress('organize', 78, 'Organizando fornecedores, códigos, grupos e subgrupos…');
      state.context = context;
      state.updatedAt = nowIso();
      state.fromDisk = false;
      state.stale = false;
      setProgress('cache', 92, 'Salvando o contexto para os próximos acessos…');
      await saveDiskCache();
      state.status = 'ready';
      setProgress('ready', 100, 'Contexto comercial pronto. A navegação agora acontece localmente.');
      return context;
    } catch (error) {
      state.error = {
        message: error?.message || 'Falha ao preparar o contexto.',
        code: error?.code || error?.originalError?.code || 'CONTEXT_ERROR',
        at: nowIso(),
      };
      if (state.context) {
        state.status = 'ready';
        state.stale = true;
        setProgress('ready', 100, 'Usando o último contexto salvo. A atualização falhou.');
        return state.context;
      }
      state.status = 'error';
      setProgress('error', 0, state.error.message);
      throw error;
    } finally {
      warmupPromise = null;
    }
  })();
  return warmupPromise;
}

function parseDate(value, field) {
  const raw = text(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const error = new Error(`Data inválida em ${field}.`);
    error.code = 'DATA_INVALIDA';
    throw error;
  }
  const [year, month, day] = raw.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function addUtcDays(date, days) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function localTodayAsUtcDate() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function fixedSixMondayPeriods(startRaw, asOfRaw = null) {
  const start = parseDate(startRaw, 'campaignStart');
  if (start.getUTCDay() !== 1) {
    const error = new Error('A primeira data da campanha precisa ser uma segunda-feira.');
    error.code = 'PERIODO_INVALIDO';
    throw error;
  }

  // Regra PMG: a campanha e a referência são sempre definidas por seis segundas-feiras.
  // Ex.: campanha 22/06 -> 27/07; anterior 11/05 -> 15/06.
  const nominalCurrentLast = addUtcDays(start, 35);
  const nominalPreviousStart = addUtcDays(start, -42);
  const nominalPreviousLast = addUtcDays(start, -7);

  // Durante a campanha, o período atual pode ser parcial para não contar datas futuras.
  // A referência anterior NÃO é truncada: ela permanece o bloco completo de seis segundas.
  const requestedAsOf = asOfRaw ? parseDate(asOfRaw, 'asOfDate') : localTodayAsUtcDate();

  if (requestedAsOf < start) {
    const error = new Error('A campanha ainda não iniciou; não há apuração disponível.');
    error.code = 'CAMPANHA_NAO_INICIADA';
    throw error;
  }

  const effectiveCurrentLast = requestedAsOf < nominalCurrentLast ? requestedAsOf : nominalCurrentLast;
  const elapsedDays = Math.floor((effectiveCurrentLast - start) / 86400000) + 1;

  return {
    currentStart: start,
    currentEnd: addUtcDays(effectiveCurrentLast, 1),
    currentLast: effectiveCurrentLast,
    previousStart: nominalPreviousStart,
    previousEnd: addUtcDays(nominalPreviousLast, 1),
    previousLast: nominalPreviousLast,

    nominalCurrentStart: start,
    nominalCurrentLast,
    nominalPreviousStart,
    nominalPreviousLast,

    asOfDate: effectiveCurrentLast,
    partial: effectiveCurrentLast < nominalCurrentLast,
    elapsedDays,
    comparisonPolicy: effectiveCurrentLast < nominalCurrentLast
      ? 'ATUAL_PARCIAL_VS_ANTERIOR_COMPLETO_6_SEGUNDAS'
      : '6_SEGUNDAS_VS_6_SEGUNDAS',
  };
}

function uniqueIntegers(values, max = 20000) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite))].slice(0, max);
}

function uniqueTexts(values, max = 1000) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))].slice(0, max);
}

function addIntParams(request, prefix, values) {
  return values.map((value, index) => {
    const name = `${prefix}${index}`;
    request.input(name, sql.Int, value);
    return `@${name}`;
  }).join(',');
}

function addTextParams(request, prefix, values) {
  return values.map((value, index) => {
    const name = `${prefix}${index}`;
    request.input(name, sql.NVarChar(200), value);
    return `@${name}`;
  }).join(',');
}

async function queryPerformance(payload = {}) {
  const startedAt = Date.now();
  const fixedPeriods = payload.campaignStart ? fixedSixMondayPeriods(payload.campaignStart, payload.asOfDate) : null;
  const currentStart = fixedPeriods?.currentStart || parseDate(payload.currentStart, 'currentStart');
  const currentEnd = fixedPeriods?.currentEnd || parseDate(payload.currentEnd, 'currentEnd');
  const previousStart = fixedPeriods?.previousStart || parseDate(payload.previousStart, 'previousStart');
  const previousEnd = fixedPeriods?.previousEnd || parseDate(payload.previousEnd, 'previousEnd');
  const productIds = uniqueIntegers(payload.productIds);
  const supplierIds = uniqueIntegers(payload.supplierIds);
  const sellers = uniqueTexts(payload.sellers);
  const activationProductIds = payload.orderActivationEnabled ? uniqueIntegers(payload.activationProductIds) : [];

  if (!productIds.length && !supplierIds.length) {
    const error = new Error('Selecione pelo menos um código de fornecedor ou produto participante.');
    error.code = 'ESCOPO_AUSENTE';
    throw error;
  }

  prunePerformanceCache();
  const cacheKey = stablePerformanceKey({
    currentStart, currentEnd, previousStart, previousEnd, productIds, supplierIds, sellers, activationProductIds,
  });

  if (!payload.forceRefresh) {
    const cached = performanceCache.get(cacheKey);
    if (cached && Date.now() - cached.createdAt <= PERFORMANCE_CACHE_TTL_MS) {
      return {
        ...cached.value,
        durationMs:Date.now() - startedAt,
        cache:{
          hit:true,
          ageMs:Date.now() - cached.createdAt,
          ttlMs:PERFORMANCE_CACHE_TTL_MS,
        },
      };
    }
  }

  const pool = await getPool();
  const request = pool.request();
  request.input('currentStart', sql.DateTime2, currentStart);
  request.input('currentEnd', sql.DateTime2, currentEnd);
  request.input('previousStart', sql.DateTime2, previousStart);
  request.input('previousEnd', sql.DateTime2, previousEnd);

  const filters = [];
  const joins = [];

  // IDs já normalizados como inteiros; literais evitam o limite de 2.100 parâmetros.
  // Se há IDs de produto explícitos, não precisamos juntar dbo.Produtos na apuração.
  if (productIds.length) {
    filters.push(`vp.[ID Produto] IN (${productIds.join(',')})`);
  } else {
    joins.push(`INNER JOIN dbo.Produtos p ON p.[ID Produto] = vp.[ID Produto]`);
    filters.push(`p.[ID Fornecedor] IN (${supplierIds.join(',')})`);
  }

  if (sellers.length) {
    filters.push(`LTRIM(RTRIM(v.[Vendedor])) IN (${addTextParams(request, 'seller', sellers)})`);
  }

  const result = await request.query(`
    SET NOCOUNT ON;

    WITH ActiveSellers AS (
      SELECT DISTINCT LTRIM(RTRIM(c.[Vendedor])) AS seller
      FROM dbo.Clientes c
      WHERE NULLIF(LTRIM(RTRIM(c.[Vendedor])), '') IS NOT NULL
        AND UPPER(LTRIM(RTRIM(ISNULL(c.[Status], '')))) LIKE 'ATIV%'
    )
    SELECT
      CASE WHEN v.[Data] >= @currentStart AND v.[Data] < @currentEnd THEN 'current' ELSE 'previous' END AS period,
      LTRIM(RTRIM(v.[Vendedor])) AS seller,
      v.[ID Cliente] AS clientId,
      v.[ID Pedido de Venda] AS orderId,
      v.[Data] AS orderDate,
      vp.[ID Produto] AS productId,
      ISNULL(vp.[Qtde PC], 0) AS pieces,
      ISNULL(vp.[Qtde Kg], 0) AS kg,
      ISNULL(vp.[Valor], 0) AS revenue
    INTO #CampaignBase
    FROM dbo.Vendas v
    INNER JOIN ActiveSellers a ON a.seller = LTRIM(RTRIM(v.[Vendedor]))
    INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
    ${joins.join('\n    ')}
    WHERE NULLIF(LTRIM(RTRIM(v.[Vendedor])), '') IS NOT NULL
      AND (
        (v.[Data] >= @currentStart AND v.[Data] < @currentEnd)
        OR (v.[Data] >= @previousStart AND v.[Data] < @previousEnd)
      )
      AND ${filters.join(' AND ')};

    SELECT
      period,
      seller,
      clientId,
      productId,
      COUNT(DISTINCT orderId) AS orders,
      SUM(pieces) AS pieces,
      SUM(kg) AS kg,
      SUM(revenue) AS revenue
    FROM #CampaignBase
    GROUP BY period, seller, clientId, productId;

    SELECT
      period,
      seller,
      COUNT(DISTINCT orderId) AS orders
    FROM #CampaignBase
    GROUP BY period, seller;

    ${activationProductIds.length ? `
    SELECT
      period,
      seller,
      clientId,
      orderId,
      MIN(orderDate) AS orderDate,
      productId,
      SUM(pieces) AS pieces,
      SUM(kg) AS kg,
      SUM(revenue) AS revenue
    FROM #CampaignBase
    WHERE productId IN (${activationProductIds.join(',')})
    GROUP BY period, seller, clientId, orderId, productId;
    ` : ''}

    DROP TABLE #CampaignBase;
  `);

  const lines = (result.recordsets?.[0] || []).map((row) => ({
    period: row.period,
    seller: text(row.seller),
    clientId: Number(row.clientId),
    productId: Number(row.productId),
    orders: Number(row.orders) || 0,
    pieces: Number(row.pieces) || 0,
    kg: Number(row.kg) || 0,
    revenue: Number(row.revenue) || 0,
  }));

  const ordersBySeller = (result.recordsets?.[1] || []).map((row) => ({
    period: row.period,
    seller: text(row.seller),
    orders: Number(row.orders) || 0,
  }));

  const orderLines = activationProductIds.length
    ? (result.recordsets?.[2] || []).map((row) => ({
        period:row.period,
        seller:text(row.seller),
        clientId:Number(row.clientId),
        orderId:String(row.orderId),
        orderDate:row.orderDate || null,
        productId:Number(row.productId),
        pieces:Number(row.pieces) || 0,
        kg:Number(row.kg) || 0,
        revenue:Number(row.revenue) || 0,
      }))
    : [];

  const provenance = {
    endpoint: '/api/campanhas-data?recurso=apuracao',
    handler: 'local-api/campanhas-data.js → queryPerformance()',
    source: 'SQL Server',
    database: 'powerbi',
    dateReference: 'dbo.Vendas.[Data]',
    tables: [
      { name:'dbo.Vendas', role:'pedido, vendedor, cliente e data', columns:['ID Pedido de Venda','ID Cliente','Vendedor','Data','Tipo','Forma de Venda','Valor Total'] },
      { name:'dbo.VendasProdutos', role:'valores e quantidades dos produtos participantes', columns:['ID Pedido de Venda','ID Produto','Qtde PC','Qtde Kg','Valor'] },
      { name:'dbo.Clientes', role:'validação de representantes ativos', columns:['Vendedor','Status'] },
      ...(productIds.length ? [] : [{ name:'dbo.Produtos', role:'filtro por código de fornecedor', columns:['ID Produto','ID Fornecedor','Fornecedor'] }]),
    ],
    metrics: {
      revenue:'SUM(dbo.VendasProdutos.[Valor])',
      kg:'SUM(dbo.VendasProdutos.[Qtde Kg])',
      pieces:'SUM(dbo.VendasProdutos.[Qtde PC])',
      customers:'COUNT DISTINCT dbo.Vendas.[ID Cliente] após o filtro de produtos/fornecedor',
      orders:'COUNT DISTINCT dbo.Vendas.[ID Pedido de Venda] após o filtro de produtos/fornecedor',
      positivity:'clientes únicos atuais - clientes únicos anteriores',
    },
    scope: {
      mode: productIds.length ? 'LISTA_DE_PRODUTOS' : 'FORNECEDOR',
      productIds,
      supplierIds,
      sellers,
      productCount:productIds.length,
      supplierCount:supplierIds.length,
      sellerCount:sellers.length,
      note:productIds.length
        ? 'Há produtos explícitos na campanha; a apuração usa esses IDs como filtro efetivo. Os códigos de fornecedor não são reaplicados sobre as linhas.'
        : 'Não há lista explícita de produtos; a apuração filtra dbo.Produtos.[ID Fornecedor].',
    },
    filters: {
      activeSeller:"Representante precisa aparecer em dbo.Clientes com Status começando por 'ATIV'",
      saleType:'SEM FILTRO EXPLÍCITO em dbo.Vendas.[Tipo]',
      saleForm:'SEM FILTRO EXPLÍCITO em dbo.Vendas.[Forma de Venda]',
      returnsAndCancellations:'SEM REGRA EXPLÍCITA adicional para devoluções/cancelamentos nesta versão',
    },
    warnings: [
      'Faturamento usa o valor das linhas participantes em dbo.VendasProdutos.[Valor], não dbo.Vendas.[Valor Total] do pedido inteiro.',
      'A data usada é dbo.Vendas.[Data]. Se outro relatório usa faturamento, nota ou entrega, os números podem divergir.',
      'Tipo, forma de venda, devoluções e cancelamentos ainda não possuem filtro corporativo explícito nesta consulta. Audite um vendedor para ver quais registros entraram.',
    ],
  };

  const response = {
    ok: true,
    source: 'SQL Server · Power BI',
    dateReference: 'dbo.Vendas.[Data]',
    activeSellersOnly: true,
    periodPolicy: fixedPeriods?.partial ? 'SEIS_SEGUNDAS_FIXAS_ATUAL_PARCIAL_ANTERIOR_COMPLETO' : 'SEIS_SEGUNDAS_FIXAS',
    comparisonPolicy: fixedPeriods?.comparisonPolicy || '6_SEGUNDAS_VS_6_SEGUNDAS',
    provenance,
    partial: Boolean(fixedPeriods?.partial),
    asOfDate: fixedPeriods?.asOfDate || null,
    elapsedDays: fixedPeriods?.elapsedDays || null,
    periodsUsed: {
      currentStart,
      currentEndExclusive: currentEnd,
      currentLastInclusive: fixedPeriods?.currentLast || addUtcDays(currentEnd, -1),
      previousStart,
      previousEndExclusive: previousEnd,
      previousLastInclusive: fixedPeriods?.previousLast || addUtcDays(previousEnd, -1),
    },
    nominalPeriods: fixedPeriods ? {
      currentStart: fixedPeriods.nominalCurrentStart,
      currentLastInclusive: fixedPeriods.nominalCurrentLast,
      previousStart: fixedPeriods.nominalPreviousStart,
      previousLastInclusive: fixedPeriods.nominalPreviousLast,
    } : null,
    lines,
    ordersBySeller,
    orderLines,
    durationMs: Date.now() - startedAt,
    cache:{
      hit:false,
      ageMs:0,
      ttlMs:PERFORMANCE_CACHE_TTL_MS,
    },
  };

  performanceCache.set(cacheKey, {
    createdAt:Date.now(),
    value:response,
  });

  return response;
}


async function querySellerAudit(payload = {}) {
  const startedAt = Date.now();
  const seller = text(payload.seller);
  if (!seller) {
    const error = new Error('Informe o representante que será auditado.');
    error.code = 'VENDEDOR_AUSENTE';
    throw error;
  }

  const periods = payload.campaignStart
    ? fixedSixMondayPeriods(payload.campaignStart, payload.asOfDate)
    : null;
  const currentStart = periods?.currentStart || parseDate(payload.currentStart, 'currentStart');
  const currentEnd = periods?.currentEnd || parseDate(payload.currentEnd, 'currentEnd');
  const previousStart = periods?.previousStart || parseDate(payload.previousStart, 'previousStart');
  const previousEnd = periods?.previousEnd || parseDate(payload.previousEnd, 'previousEnd');

  const productIds = uniqueIntegers(payload.productIds);
  const supplierIds = uniqueIntegers(payload.supplierIds);
  if (!productIds.length && !supplierIds.length) {
    const error = new Error('A campanha não possui escopo de produtos/fornecedor para auditoria.');
    error.code = 'ESCOPO_AUSENTE';
    throw error;
  }

  const pool = await getPool();
  const request = pool.request();
  request.input('sellerAudit', sql.NVarChar(200), seller);
  request.input('currentStart', sql.DateTime2, currentStart);
  request.input('currentEnd', sql.DateTime2, currentEnd);
  request.input('previousStart', sql.DateTime2, previousStart);
  request.input('previousEnd', sql.DateTime2, previousEnd);

  const scopeFilter = productIds.length
    ? `vp.[ID Produto] IN (${productIds.join(',')})`
    : `p.[ID Fornecedor] IN (${supplierIds.join(',')})`;

  const result = await request.query(`
    SET NOCOUNT ON;

    WITH ActiveSellers AS (
      SELECT DISTINCT LTRIM(RTRIM(c.[Vendedor])) AS seller
      FROM dbo.Clientes c
      WHERE NULLIF(LTRIM(RTRIM(c.[Vendedor])), '') IS NOT NULL
        AND UPPER(LTRIM(RTRIM(ISNULL(c.[Status], '')))) LIKE 'ATIV%'
    )
    SELECT TOP (1500)
      CASE WHEN v.[Data] >= @currentStart AND v.[Data] < @currentEnd THEN 'current' ELSE 'previous' END AS period,
      LTRIM(RTRIM(v.[Vendedor])) AS seller,
      v.[ID Pedido de Venda] AS orderId,
      v.[Data] AS orderDate,
      v.[ID Cliente] AS clientId,
      NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), v.[Tipo]))), '') AS saleType,
      NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), v.[Forma de Venda]))), '') AS saleForm,
      ISNULL(v.[Valor Total], 0) AS wholeOrderValue,
      vp.[ID Produto] AS productId,
      p.[Produto] AS productName,
      p.[ID Fornecedor] AS supplierId,
      p.[Fornecedor] AS supplierName,
      SUM(ISNULL(vp.[Qtde PC], 0)) AS pieces,
      SUM(ISNULL(vp.[Qtde Kg], 0)) AS kg,
      SUM(ISNULL(vp.[Valor], 0)) AS revenue
    FROM dbo.Vendas v
    INNER JOIN ActiveSellers a ON a.seller = LTRIM(RTRIM(v.[Vendedor]))
    INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
    INNER JOIN dbo.Produtos p ON p.[ID Produto] = vp.[ID Produto]
    WHERE LTRIM(RTRIM(v.[Vendedor])) = @sellerAudit
      AND (
        (v.[Data] >= @currentStart AND v.[Data] < @currentEnd)
        OR (v.[Data] >= @previousStart AND v.[Data] < @previousEnd)
      )
      AND ${scopeFilter}
    GROUP BY
      CASE WHEN v.[Data] >= @currentStart AND v.[Data] < @currentEnd THEN 'current' ELSE 'previous' END,
      LTRIM(RTRIM(v.[Vendedor])),
      v.[ID Pedido de Venda], v.[Data], v.[ID Cliente], v.[Tipo], v.[Forma de Venda], v.[Valor Total],
      vp.[ID Produto], p.[Produto], p.[ID Fornecedor], p.[Fornecedor]
    ORDER BY period DESC, v.[Data] DESC, v.[ID Pedido de Venda] DESC, vp.[ID Produto];
  `);

  const rows = (result.recordset || []).map((row) => ({
    period:row.period,
    seller:text(row.seller),
    orderId:String(row.orderId),
    orderDate:row.orderDate || null,
    clientId:Number(row.clientId),
    saleType:text(row.saleType) || '(vazio)',
    saleForm:text(row.saleForm) || '(vazio)',
    wholeOrderValue:Number(row.wholeOrderValue) || 0,
    productId:Number(row.productId),
    productName:text(row.productName),
    supplierId:Number(row.supplierId) || null,
    supplierName:text(row.supplierName),
    pieces:Number(row.pieces) || 0,
    kg:Number(row.kg) || 0,
    revenue:Number(row.revenue) || 0,
  }));

  function summarize(period) {
    const selected = rows.filter((row) => row.period === period);
    return {
      revenue:selected.reduce((sum,row) => sum + row.revenue, 0),
      kg:selected.reduce((sum,row) => sum + row.kg, 0),
      pieces:selected.reduce((sum,row) => sum + row.pieces, 0),
      orders:new Set(selected.map((row) => row.orderId)).size,
      customers:new Set(selected.map((row) => String(row.clientId))).size,
      products:new Set(selected.map((row) => String(row.productId))).size,
    };
  }

  const distinctValues = (field) => [...new Set(rows.map((row) => row[field]).filter(Boolean))].sort((a,b) => String(a).localeCompare(String(b), 'pt-BR'));

  return {
    ok:true,
    source:'SQL Server · Power BI',
    endpoint:'/api/campanhas-data?recurso=auditoria-vendedor',
    handler:'local-api/campanhas-data.js → querySellerAudit()',
    seller,
    dateReference:'dbo.Vendas.[Data]',
    partial:Boolean(periods?.partial),
    comparisonPolicy:periods?.comparisonPolicy || '6_SEGUNDAS_VS_6_SEGUNDAS',
    periodsUsed:{
      currentStart,
      currentEndExclusive:currentEnd,
      currentLastInclusive:periods?.currentLast || addUtcDays(currentEnd, -1),
      previousStart,
      previousEndExclusive:previousEnd,
      previousLastInclusive:periods?.previousLast || addUtcDays(previousEnd, -1),
    },
    scope:{
      mode:productIds.length ? 'LISTA_DE_PRODUTOS' : 'FORNECEDOR',
      productIds,
      supplierIds,
    },
    summaries:{ current:summarize('current'), previous:summarize('previous') },
    saleTypes:distinctValues('saleType'),
    saleForms:distinctValues('saleForm'),
    rows,
    truncated:rows.length >= 1500,
    warnings:[
      'Cada linha representa um produto participante dentro de um pedido. O faturamento auditado soma dbo.VendasProdutos.[Valor].',
      'dbo.Vendas.[Valor Total] é exibido apenas como referência do pedido inteiro e não é usado no faturamento da campanha.',
      'Não há filtro explícito por Tipo/Forma de Venda nem regra adicional de cancelamento/devolução nesta versão.',
    ],
    durationMs:Date.now() - startedAt,
  };
}

function publicError(error) {
  const code = error?.code || error?.originalError?.code || 'CAMPANHAS_LOCAL_ERROR';
  const hints = {
    SQL_ENV_MISSING: 'Confira o arquivo .env da API local.',
    ELOGIN: 'Confira usuário, senha e permissão de acesso ao banco powerbi.',
    ETIMEOUT: 'O SQL Server demorou para responder. Tente preparar o contexto novamente.',
    ESCOPO_AUSENTE: 'Selecione fornecedores ou produtos participantes.',
    CAMPANHA_NAO_INICIADA: 'A apuração ficará disponível a partir da primeira segunda-feira da campanha.',
    VENDEDOR_AUSENTE: 'Escolha um representante para abrir a auditoria.',
  };
  return {
    erro: error?.message || 'Falha inesperada na API local de campanhas.',
    codigo: code,
    origem: 'local-api/campanhas-data',
    versao: '5.5.0',
    dica: hints[code] || 'Confira o terminal do servidor local.',
  };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const resource = text(req.query?.recurso || 'contexto-status');

  try {
    await loadDiskCache();
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (resource === 'contexto-status') return res.status(200).json(publicStatus());

    if (resource === 'contexto-preparar') {
      void prepareContext({ force: String(req.query?.force || '').toLowerCase() === 'true' })
        .catch((error) => console.warn('[campanhas-v5] preparação:', error.message));
      return res.status(202).json(publicStatus());
    }

    if (resource === 'contexto') {
      if (!state.context) return res.status(202).json(publicStatus());
      return res.status(200).json({ ...publicStatus(), context: state.context });
    }

    if (resource === 'diagnostico') {
      const pool = await getPool();
      const result = await pool.request().query('SELECT 1 AS ok, DB_NAME() AS banco, GETDATE() AS dataServidor;');
      return res.status(200).json({
        ok: true,
        version: '5.5.0',
        sql: result.recordset?.[0] || null,
        context: publicStatus(),
        configuration: diagnosticoConfiguracaoSql(),
      });
    }

    if (resource === 'apuracao') {
      if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST para apuração.', codigo: 'METODO_INVALIDO' });
      return res.status(200).json(await queryPerformance(req.body || {}));
    }

    if (resource === 'auditoria-vendedor') {
      if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST para auditoria do vendedor.', codigo: 'METODO_INVALIDO' });
      return res.status(200).json(await querySellerAudit(req.body || {}));
    }

    return res.status(404).json({ erro: `Recurso desconhecido: ${resource}`, codigo: 'RECURSO_DESCONHECIDO' });
  } catch (error) {
    console.error(`[campanhas-v5:${resource}]`, error);
    const data = publicError(error);
    return res.status(['SQL_ENV_MISSING', 'ETIMEOUT'].includes(data.codigo) ? 503 : 500).json(data);
  }
}

setTimeout(() => {
  void loadDiskCache().then(() => {
    if (state.context) {
      void prepareContext({ force: state.stale }).catch(() => {});
    } else {
      void prepareContext().catch(() => {});
    }
  });
}, 100);
