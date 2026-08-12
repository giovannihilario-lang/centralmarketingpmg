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
const BENEFIT_CACHE_TTL_MS = 2 * 60 * 1000;
const performanceCache = new Map();
const benefitCache = new Map();

function stablePerformanceKey({ currentStart, currentEnd, previousStart, previousEnd, productIds, supplierIds, sellers, activationProductIds = [], activationTriggerProductIds = [], activationFirstPurchaseMode = 'campaign_trigger' }) {
  return JSON.stringify({
    currentStart:String(currentStart),
    currentEnd:String(currentEnd),
    previousStart:String(previousStart),
    previousEnd:String(previousEnd),
    productIds:[...productIds].sort((a,b) => a-b),
    supplierIds:[...supplierIds].sort((a,b) => a-b),
    sellers:[...sellers].sort((a,b) => a.localeCompare(b, 'pt-BR')),
    activationProductIds:[...activationProductIds].sort((a,b) => a-b),
    activationTriggerProductIds:[...activationTriggerProductIds].sort((a,b) => a-b),
    activationFirstPurchaseMode,
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
    version: '5.12.0',
  };
}

async function loadDiskCache() {
  if (diskLoaded) return;
  diskLoaded = true;
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed?.version !== CACHE_VERSION || !parsed?.context) return;
    state.context = sanitizeContext(parsed.context);
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

function sanitizeContext(context = {}) {
  const productMap = new Map();
  for (const raw of Array.isArray(context.products) ? context.products : []) {
    const id = Number(raw?.id);
    if (!Number.isFinite(id)) continue;
    const candidate = { ...raw, id };
    const current = productMap.get(id);
    const score = (item) =>
      (norm(item?.status).includes('ativ') ? 8 : 0) +
      (text(item?.name) ? 4 : 0) +
      (Number.isFinite(Number(item?.supplierId)) ? 2 : 0) +
      (text(item?.supplierName) ? 1 : 0);
    if (!current || score(candidate) > score(current)) productMap.set(id, candidate);
  }

  const products = [...productMap.values()].sort((a, b) =>
    Number(a.supplierId || 0) - Number(b.supplierId || 0) ||
    text(a.group).localeCompare(text(b.group), 'pt-BR') ||
    text(a.subgroup).localeCompare(text(b.subgroup), 'pt-BR') ||
    text(a.name).localeCompare(text(b.name), 'pt-BR')
  );

  const repMap = new Map();
  for (const raw of Array.isArray(context.representatives) ? context.representatives : []) {
    const name = text(raw?.name);
    if (!name) continue;
    const key = norm(name);
    const current = repMap.get(key);
    if (!current || Number(raw?.activeClients || 0) > Number(current?.activeClients || 0)) {
      repMap.set(key, { ...raw, name });
    }
  }
  const representatives = [...repMap.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  return {
    suppliers: deriveSuppliers(products),
    products,
    representatives,
  };
}

async function queryContext() {
  const pool = await getPool();
  const result = await pool.request().query(`
    WITH ProdutosRank AS (
      SELECT
        p.*,
        ROW_NUMBER() OVER (
          PARTITION BY p.[ID Produto]
          ORDER BY
            CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(p.[Status], '')))) LIKE 'ATIV%' THEN 0 ELSE 1 END,
            CASE WHEN NULLIF(LTRIM(RTRIM(p.[Produto])), '') IS NOT NULL THEN 0 ELSE 1 END,
            CASE WHEN p.[ID Fornecedor] IS NOT NULL THEN 0 ELSE 1 END,
            LTRIM(RTRIM(ISNULL(p.[Fornecedor], ''))),
            LTRIM(RTRIM(ISNULL(p.[Produto], '')))
        ) AS rn
      FROM dbo.Produtos p
      WHERE p.[ID Produto] IS NOT NULL
    )
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
    FROM ProdutosRank p
    WHERE p.rn = 1
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
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

function isoDate(value) {
  if (typeof value === 'string') return text(value).slice(0, 10);
  return new Date(value).toISOString().slice(0, 10);
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


function customCampaignPeriods(startRaw, endRaw, asOfRaw = null) {
  const start = parseDate(startRaw, 'campaignStart');
  const nominalCurrentLast = parseDate(endRaw, 'campaignEnd');

  if (nominalCurrentLast < start) {
    const error = new Error('A data final da campanha não pode ser anterior à data inicial.');
    error.code = 'PERIODO_INVALIDO';
    throw error;
  }

  const requestedAsOf = asOfRaw ? parseDate(asOfRaw, 'asOfDate') : localTodayAsUtcDate();
  if (requestedAsOf < start) {
    const error = new Error('A campanha ainda não iniciou; não há apuração disponível.');
    error.code = 'CAMPANHA_NAO_INICIADA';
    throw error;
  }

  const durationDays = Math.floor((nominalCurrentLast - start) / 86400000) + 1;
  const nominalPreviousLast = addUtcDays(start, -1);
  const nominalPreviousStart = addUtcDays(start, -durationDays);
  const effectiveCurrentLast = requestedAsOf < nominalCurrentLast ? requestedAsOf : nominalCurrentLast;
  const elapsedDays = Math.floor((effectiveCurrentLast - start) / 86400000) + 1;

  return {
    mode:'custom',
    currentStart:start,
    currentEnd:addUtcDays(effectiveCurrentLast, 1),
    currentLast:effectiveCurrentLast,
    previousStart:nominalPreviousStart,
    previousEnd:addUtcDays(nominalPreviousLast, 1),
    previousLast:nominalPreviousLast,
    previousEquivalentEnd:addUtcDays(nominalPreviousStart, Math.min(elapsedDays, durationDays)),

    nominalCurrentStart:start,
    nominalCurrentLast,
    nominalPreviousStart,
    nominalPreviousLast,

    asOfDate:effectiveCurrentLast,
    partial:effectiveCurrentLast < nominalCurrentLast,
    elapsedDays,
    durationDays,
    remainingDays:Math.max(0, durationDays - elapsedDays),
    comparisonPolicy:effectiveCurrentLast < nominalCurrentLast
      ? 'ATUAL_PARCIAL_VS_ANTERIOR_COMPLETO_PERIODO_LIVRE'
      : 'PERIODO_LIVRE_VS_ANTERIOR_MESMA_DURACAO',
  };
}

function resolveCampaignPeriods(payload = {}) {
  const mode = payload.periodMode === 'custom' ? 'custom' : 'six_mondays';
  if (mode === 'custom') {
    if (!payload.campaignEnd) {
      const error = new Error('Informe a data final da campanha no período livre.');
      error.code = 'PERIODO_INVALIDO';
      throw error;
    }
    return customCampaignPeriods(payload.campaignStart, payload.campaignEnd, payload.asOfDate);
  }

  const periods = fixedSixMondayPeriods(payload.campaignStart, payload.asOfDate);
  const durationDays = 36;
  return {
    ...periods,
    mode:'six_mondays',
    durationDays,
    remainingDays:Math.max(0, durationDays - periods.elapsedDays),
    previousEquivalentEnd:addUtcDays(periods.previousStart, Math.min(periods.elapsedDays, durationDays)),
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
  const campaignPeriods = payload.campaignStart ? resolveCampaignPeriods(payload) : null;
  const currentStart = campaignPeriods?.currentStart || parseDate(payload.currentStart, 'currentStart');
  const currentEnd = campaignPeriods?.currentEnd || parseDate(payload.currentEnd, 'currentEnd');
  const previousStart = campaignPeriods?.previousStart || parseDate(payload.previousStart, 'previousStart');
  const previousEnd = campaignPeriods?.previousEnd || parseDate(payload.previousEnd, 'previousEnd');
  const productIds = uniqueIntegers(payload.productIds);
  const supplierIds = uniqueIntegers(payload.supplierIds);
  const sellers = uniqueTexts(payload.sellers);
  const activationProductIds = payload.orderActivationEnabled ? uniqueIntegers(payload.activationProductIds) : [];
  const activationTriggerProductIds = payload.orderActivationEnabled ? uniqueIntegers(payload.activationTriggerProductIds) : [];
  const activationFirstPurchaseMode = text(payload.activationFirstPurchaseMode) === 'historical_trigger' ? 'historical_trigger' : 'campaign_trigger';

  if (!productIds.length && !supplierIds.length) {
    const error = new Error('Selecione pelo menos um código de fornecedor ou produto participante.');
    error.code = 'ESCOPO_AUSENTE';
    throw error;
  }

  prunePerformanceCache();
  const cacheKey = stablePerformanceKey({
    currentStart, currentEnd, previousStart, previousEnd, productIds, supplierIds, sellers,
    activationProductIds, activationTriggerProductIds, activationFirstPurchaseMode,
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
  request.input('currentStart', sql.VarChar(10), isoDate(currentStart));
  request.input('currentEnd', sql.VarChar(10), isoDate(currentEnd));
  request.input('previousStart', sql.VarChar(10), isoDate(previousStart));
  request.input('previousEnd', sql.VarChar(10), isoDate(previousEnd));
  request.input('previousEquivalentEnd', sql.VarChar(10), isoDate(campaignPeriods?.previousEquivalentEnd || previousEnd));

  const scopeFilters = [];

  if (productIds.length) {
    scopeFilters.push(`vp.[ID Produto] IN (${productIds.join(',')})`);
  } else {
    // EXISTS evita multiplicar VendasProdutos se dbo.Produtos tiver mais de uma
    // linha cadastral para o mesmo ID Produto.
    scopeFilters.push(`EXISTS (
      SELECT 1
      FROM dbo.Produtos pScope
      WHERE pScope.[ID Produto] = vp.[ID Produto]
        AND pScope.[ID Fornecedor] IN (${supplierIds.join(',')})
    )`);
  }

  const explicitSellerParams = sellers.length
    ? addTextParams(request, 'seller', sellers)
    : '';

  const result = await request.query(`
    SET NOCOUNT ON;

    ;WITH ActiveSellerRaw AS (
      SELECT DISTINCT
        s.rawSeller AS seller,
        s.sellerCode,
        s.sellerNameKey
      FROM dbo.Clientes c
      CROSS APPLY (
        SELECT
          LTRIM(RTRIM(c.[Vendedor])) AS rawSeller,
          CHARINDEX('-', REVERSE(LTRIM(RTRIM(c.[Vendedor])))) AS dashPos
      ) s0
      CROSS APPLY (
        SELECT TRY_CONVERT(int, CASE WHEN s0.dashPos > 1 THEN RIGHT(s0.rawSeller, s0.dashPos - 1) END) AS sellerCode
      ) sc
      CROSS APPLY (
        SELECT
          s0.rawSeller,
          sc.sellerCode,
          UPPER(REPLACE(LTRIM(RTRIM(CASE
            WHEN sc.sellerCode IS NOT NULL THEN LEFT(s0.rawSeller, LEN(s0.rawSeller) - s0.dashPos)
            ELSE s0.rawSeller
          END)), ' ', '')) AS sellerNameKey
      ) s
      WHERE NULLIF(s.rawSeller, '') IS NOT NULL
        AND UPPER(LTRIM(RTRIM(ISNULL(c.[Status], '')))) LIKE 'ATIV%'
    ),
    ActiveSellerRank AS (
      SELECT *, ROW_NUMBER() OVER (
        PARTITION BY COALESCE(CONVERT(varchar(20), sellerCode), CONCAT('NAME:', sellerNameKey))
        ORDER BY CASE WHEN sellerCode IS NULL THEN 1 ELSE 0 END, seller
      ) AS rn
      FROM ActiveSellerRaw
    )
    SELECT seller, sellerCode, sellerNameKey
    INTO #ActiveSellers
    FROM ActiveSellerRank
    WHERE rn = 1;

    -- Base comercial completa do escopo. O histórico não é cortado pelo
    -- status atual do representante. Vendas são reduzidas a uma linha por pedido
    -- e o escopo por fornecedor usa EXISTS, evitando multiplicação cadastral.
    ;WITH VendasRank AS (
      SELECT
        v.[ID Pedido de Venda], v.[Data], v.[ID Cliente], v.[Vendedor],
        ROW_NUMBER() OVER (
          PARTITION BY v.[ID Pedido de Venda]
          ORDER BY
            CASE WHEN v.[Data] IS NULL THEN 1 ELSE 0 END,
            v.[Data] DESC,
            CASE WHEN NULLIF(LTRIM(RTRIM(v.[Vendedor])), '') IS NULL THEN 1 ELSE 0 END,
            v.[ID Cliente] DESC
        ) AS rn
      FROM dbo.Vendas v
    ),
    VendasUnicas AS (
      SELECT [ID Pedido de Venda], [Data], [ID Cliente], [Vendedor]
      FROM VendasRank
      WHERE rn = 1
    )
    SELECT
      CASE WHEN v.[Data] >= CONVERT(date, @currentStart, 23) AND v.[Data] < CONVERT(date, @currentEnd, 23) THEN 'current' ELSE 'previous' END AS period,
      sellerKey.rawSeller AS seller,
      sellerKey.sellerCode,
      sellerKey.sellerNameKey,
      v.[ID Cliente] AS clientId,
      v.[ID Pedido de Venda] AS orderId,
      v.[Data] AS orderDate,
      vp.[ID Produto] AS productId,
      ISNULL(vp.[Qtde PC], 0) AS pieces,
      ISNULL(vp.[Qtde Kg], 0) AS kg,
      ISNULL(vp.[Valor], 0) AS revenue
    INTO #ScopeBase
    FROM VendasUnicas v
    INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
    CROSS APPLY (
      SELECT
        LTRIM(RTRIM(v.[Vendedor])) AS rawSeller,
        CHARINDEX('-', REVERSE(LTRIM(RTRIM(v.[Vendedor])))) AS dashPos
    ) sellerRaw
    CROSS APPLY (
      SELECT TRY_CONVERT(int, CASE WHEN sellerRaw.dashPos > 1 THEN RIGHT(sellerRaw.rawSeller, sellerRaw.dashPos - 1) END) AS sellerCode
    ) sellerCodePart
    CROSS APPLY (
      SELECT
        sellerRaw.rawSeller,
        sellerCodePart.sellerCode,
        UPPER(REPLACE(LTRIM(RTRIM(CASE
          WHEN sellerCodePart.sellerCode IS NOT NULL THEN LEFT(sellerRaw.rawSeller, LEN(sellerRaw.rawSeller) - sellerRaw.dashPos)
          ELSE sellerRaw.rawSeller
        END)), ' ', '')) AS sellerNameKey
    ) sellerKey
    WHERE NULLIF(sellerKey.rawSeller, '') IS NOT NULL
      AND (
        (v.[Data] >= CONVERT(date, @currentStart, 23) AND v.[Data] < CONVERT(date, @currentEnd, 23))
        OR (v.[Data] >= CONVERT(date, @previousStart, 23) AND v.[Data] < CONVERT(date, @previousEnd, 23))
      )
      AND ${scopeFilters.join(' AND ')};

    -- Base individual do ranking. O representante histórico é conciliado
    -- pelo ID final (quando existe) e, como fallback, pelo nome normalizado sem o sufixo.
    SELECT
      b.period,
      matchedSeller.seller AS seller,
      b.seller AS sellerAlias,
      b.clientId,
      b.orderId,
      b.orderDate,
      b.productId,
      b.pieces,
      b.kg,
      b.revenue
    INTO #CampaignBase
    FROM #ScopeBase b
    CROSS APPLY (
      SELECT TOP (1) a.seller
      FROM #ActiveSellers a
      WHERE
        (b.sellerCode IS NOT NULL AND a.sellerCode = b.sellerCode)
        OR (b.sellerCode IS NULL AND a.sellerNameKey = b.sellerNameKey)
        OR (a.sellerCode IS NULL AND a.sellerNameKey = b.sellerNameKey)
      ORDER BY
        CASE WHEN b.sellerCode IS NOT NULL AND a.sellerCode = b.sellerCode THEN 0 ELSE 1 END,
        a.seller
    ) matchedSeller
    ${sellers.length ? `WHERE matchedSeller.seller IN (${explicitSellerParams})` : ''};

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

    -- KPIs e metas coletivas:
    -- campanha aberta = escopo comercial total;
    -- campanha específica = apenas os representantes escolhidos.
    SELECT
      period,
      SUM(revenue) AS revenue,
      SUM(kg) AS kg,
      SUM(pieces) AS pieces,
      COUNT(DISTINCT clientId) AS customers,
      COUNT(DISTINCT orderId) AS orders,
      COUNT(DISTINCT productId) AS products,
      COUNT(DISTINCT seller) AS sellers
    FROM ${sellers.length ? '#CampaignBase' : '#ScopeBase'}
    GROUP BY period;

    -- Ritmo equivalente: mesma quantidade de dias já decorridos, mas dentro
    -- do período anterior. Não altera metas/ranking; serve para leitura parcial.
    SELECT
      SUM(revenue) AS revenue,
      SUM(kg) AS kg,
      SUM(pieces) AS pieces,
      COUNT(DISTINCT clientId) AS customers,
      COUNT(DISTINCT orderId) AS orders,
      COUNT(DISTINCT productId) AS products
    FROM ${sellers.length ? '#CampaignBase' : '#ScopeBase'}
    WHERE period = 'previous'
      AND orderDate < CONVERT(date, @previousEquivalentEnd, 23);

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

    ${activationFirstPurchaseMode === 'historical_trigger' && activationTriggerProductIds.length ? `
    SELECT DISTINCT v.[ID Cliente] AS clientId
    FROM dbo.VendasProdutos vp
    INNER JOIN dbo.Vendas v ON v.[ID Pedido de Venda] = vp.[ID Pedido de Venda]
    WHERE vp.[ID Produto] IN (${activationTriggerProductIds.join(',')})
      AND v.[ID Cliente] IS NOT NULL
      AND v.[Data] < CONVERT(date, @currentStart, 23);
    ` : ''}

    DROP TABLE #CampaignBase;
    DROP TABLE #ScopeBase;
    DROP TABLE #ActiveSellers;
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

  const collectiveSummary = (result.recordsets?.[2] || []).map((row) => ({
    period:text(row.period),
    revenue:Number(row.revenue) || 0,
    kg:Number(row.kg) || 0,
    pieces:Number(row.pieces) || 0,
    customers:Number(row.customers) || 0,
    orders:Number(row.orders) || 0,
    products:Number(row.products) || 0,
    sellers:Number(row.sellers) || 0,
  }));

  const equivalentPreviousSummaryRaw = result.recordsets?.[3]?.[0] || {};
  const equivalentPreviousSummary = {
    revenue:Number(equivalentPreviousSummaryRaw.revenue) || 0,
    kg:Number(equivalentPreviousSummaryRaw.kg) || 0,
    pieces:Number(equivalentPreviousSummaryRaw.pieces) || 0,
    customers:Number(equivalentPreviousSummaryRaw.customers) || 0,
    orders:Number(equivalentPreviousSummaryRaw.orders) || 0,
    products:Number(equivalentPreviousSummaryRaw.products) || 0,
  };

  let extraRecordsetIndex = 4;
  const orderLines = activationProductIds.length
    ? (result.recordsets?.[extraRecordsetIndex++] || []).map((row) => ({
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

  const historicalTriggerClientIds = activationFirstPurchaseMode === 'historical_trigger' && activationTriggerProductIds.length
    ? (result.recordsets?.[extraRecordsetIndex++] || []).map((row) => Number(row.clientId)).filter(Number.isFinite)
    : [];

  const provenance = {
    endpoint: '/api/campanhas-data?recurso=apuracao',
    handler: 'local-api/campanhas-data.js → queryPerformance()',
    source: 'SQL Server',
    database: 'powerbi',
    dateReference: 'dbo.Vendas.[Data]',
    dateBoundaryMode: 'YYYY-MM-DD convertido para DATE no SQL',
    tables: [
      { name:'dbo.Vendas', role:'pedido, vendedor, cliente e data', columns:['ID Pedido de Venda','ID Cliente','Vendedor','Data','Tipo','Forma de Venda','Valor Total'] },
      { name:'dbo.VendasProdutos', role:'valores e quantidades dos produtos participantes', columns:['ID Pedido de Venda','ID Produto','Qtde PC','Qtde Kg','Valor'] },
      { name:'dbo.Clientes', role:'define quem aparece no ranking quando a campanha é aberta; não corta a base coletiva histórica', columns:['Vendedor','Status'] },
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
      collectiveMode:sellers.length ? 'REPRESENTANTES_ESPECIFICOS' : 'ESCOPO_COMERCIAL_TOTAL',
      rankingMode:sellers.length ? 'REPRESENTANTES_ESPECIFICOS' : 'REPRESENTANTES_ATIVOS_ATUAIS',
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
      activeSeller:"Ranking usa representantes atuais de dbo.Clientes com Status ATIV%; histórico é conciliado por ID do vendedor ou nome normalizado",
      sellerHistory:'ID numérico no final de dbo.Vendas.[Vendedor]; fallback por nome normalizado sem sufixo quando o histórico não possui ID',
      saleType:'SEM FILTRO EXPLÍCITO em dbo.Vendas.[Tipo]',
      saleForm:'SEM FILTRO EXPLÍCITO em dbo.Vendas.[Forma de Venda]',
      returnsAndCancellations:'SEM REGRA EXPLÍCITA adicional para devoluções/cancelamentos nesta versão',
    },
    warnings: [
      'Faturamento usa o valor das linhas participantes em dbo.VendasProdutos.[Valor], não dbo.Vendas.[Valor Total] do pedido inteiro.',
      'A data usada é dbo.Vendas.[Data], com YYYY-MM-DD convertido diretamente para DATE no SQL, sem deslocamento de horário/timezone.',
      'Se outro relatório usa faturamento, nota fiscal ou entrega, os números podem divergir.',
      'O histórico individual é conciliado por ID numérico no final do campo Vendedor; se não houver ID no registro histórico, usa nome normalizado sem sufixo.',
      'Tipo, forma de venda, devoluções e cancelamentos ainda não possuem filtro corporativo explícito nesta consulta. Audite um vendedor para ver quais registros entraram.',
    ],
  };

  const response = {
    ok: true,
    source: 'SQL Server · Power BI',
    dateReference: 'dbo.Vendas.[Data]',
    rankingActiveSellersOnly: sellers.length === 0,
    collectiveScope: sellers.length ? 'REPRESENTANTES_ESPECIFICOS' : 'ESCOPO_COMERCIAL_TOTAL',
    periodPolicy: campaignPeriods?.mode === 'custom' ? 'PERIODO_LIVRE' : 'SEIS_SEGUNDAS_FIXAS',
    comparisonPolicy: campaignPeriods?.comparisonPolicy || 'PERIODO_CONFIGURADO_VS_REFERENCIA_ANTERIOR',
    provenance,
    partial: Boolean(campaignPeriods?.partial),
    asOfDate: campaignPeriods?.asOfDate || null,
    elapsedDays: campaignPeriods?.elapsedDays || null,
    totalDays: campaignPeriods?.durationDays || null,
    remainingDays: campaignPeriods?.remainingDays || 0,
    periodMode: campaignPeriods?.mode || 'six_mondays',
    previousEquivalentEndExclusive: campaignPeriods?.previousEquivalentEnd || previousEnd,
    equivalentPreviousSummary,
    periodsUsed: {
      currentStart,
      currentEndExclusive: currentEnd,
      currentLastInclusive: campaignPeriods?.currentLast || addUtcDays(currentEnd, -1),
      previousStart,
      previousEndExclusive: previousEnd,
      previousLastInclusive: campaignPeriods?.previousLast || addUtcDays(previousEnd, -1),
    },
    nominalPeriods: campaignPeriods ? {
      currentStart: campaignPeriods.nominalCurrentStart,
      currentLastInclusive: campaignPeriods.nominalCurrentLast,
      previousStart: campaignPeriods.nominalPreviousStart,
      previousLastInclusive: campaignPeriods.nominalPreviousLast,
    } : null,
    lines,
    ordersBySeller,
    collectiveSummary,
    orderLines,
    historicalTriggerClientIds,
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



async function queryConsistencyDiagnostic(payload = {}) {
  const startedAt = Date.now();
  const periods = payload.campaignStart
    ? resolveCampaignPeriods(payload)
    : null;

  const currentStart = periods?.currentStart || parseDate(payload.currentStart, 'currentStart');
  const currentEnd = periods?.currentEnd || parseDate(payload.currentEnd, 'currentEnd');
  const previousStart = periods?.previousStart || parseDate(payload.previousStart, 'previousStart');
  const previousEnd = periods?.previousEnd || parseDate(payload.previousEnd, 'previousEnd');

  const supplierIds = uniqueIntegers(payload.supplierIds);
  const productIds = uniqueIntegers(payload.productIds);
  const sellers = uniqueTexts(payload.sellers);

  if (!supplierIds.length) {
    const error = new Error('O diagnóstico de consistência precisa de pelo menos um código de fornecedor.');
    error.code = 'FORNECEDOR_AUSENTE';
    throw error;
  }

  const pool = await getPool();
  const request = pool.request();
  request.input('currentStart', sql.VarChar(10), isoDate(currentStart));
  request.input('currentEnd', sql.VarChar(10), isoDate(currentEnd));
  request.input('previousStart', sql.VarChar(10), isoDate(previousStart));
  request.input('previousEnd', sql.VarChar(10), isoDate(previousEnd));

  const specificSellerFilter = sellers.length
    ? `AND LTRIM(RTRIM(b.seller)) IN (${addTextParams(request, 'diagSeller', sellers)})`
    : '';

  const selectedProductFilter = productIds.length
    ? `AND b.productId IN (${productIds.join(',')})`
    : '';

  const result = await request.query(`
    SET NOCOUNT ON;

    WITH ActiveSellers AS (
      SELECT DISTINCT LTRIM(RTRIM(c.[Vendedor])) AS seller
      FROM dbo.Clientes c
      WHERE NULLIF(LTRIM(RTRIM(c.[Vendedor])), '') IS NOT NULL
        AND UPPER(LTRIM(RTRIM(ISNULL(c.[Status], '')))) LIKE 'ATIV%'
    ),
    Base AS (
      SELECT
        CASE
          WHEN v.[Data] >= CONVERT(date, @currentStart, 23)
           AND v.[Data] < CONVERT(date, @currentEnd, 23)
          THEN 'current' ELSE 'previous'
        END AS period,
        LTRIM(RTRIM(v.[Vendedor])) AS seller,
        CASE WHEN a.seller IS NULL THEN 0 ELSE 1 END AS activeSeller,
        v.[ID Cliente] AS clientId,
        v.[ID Pedido de Venda] AS orderId,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), v.[Tipo]))), '') AS saleType,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), v.[Forma de Venda]))), '') AS saleForm,
        vp.[ID Produto] AS productId,
        p.[ID Fornecedor] AS supplierId,
        NULLIF(LTRIM(RTRIM(ISNULL(p.[Status], ''))), '') AS productStatus,
        ISNULL(vp.[Qtde Kg], 0) AS kg,
        ISNULL(vp.[Qtde PC], 0) AS pieces,
        ISNULL(vp.[Valor], 0) AS revenue
      FROM dbo.Vendas v
      INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
      INNER JOIN dbo.Produtos p ON p.[ID Produto] = vp.[ID Produto]
      LEFT JOIN ActiveSellers a ON a.seller = LTRIM(RTRIM(v.[Vendedor]))
      WHERE p.[ID Fornecedor] IN (${supplierIds.join(',')})
        AND (
          (v.[Data] >= CONVERT(date, @currentStart, 23) AND v.[Data] < CONVERT(date, @currentEnd, 23))
          OR
          (v.[Data] >= CONVERT(date, @previousStart, 23) AND v.[Data] < CONVERT(date, @previousEnd, 23))
        )
    ),
    Modes AS (
      SELECT 'FORNECEDOR_BRUTO' AS mode, * FROM Base

      UNION ALL
      SELECT 'FORNECEDOR_VENDEDORES_ATIVOS' AS mode, *
      FROM Base b WHERE b.activeSeller = 1

      UNION ALL
      SELECT 'PRODUTOS_ATIVOS_VENDEDORES_ATIVOS' AS mode, *
      FROM Base b
      WHERE b.activeSeller = 1
        AND (
          b.productStatus IS NULL
          OR UPPER(LTRIM(RTRIM(b.productStatus))) LIKE 'ATIV%'
        )

      UNION ALL
      SELECT 'ESCOPO_EFETIVO_CAMPANHA' AS mode, *
      FROM Base b
      WHERE b.activeSeller = 1
        ${selectedProductFilter}
        ${specificSellerFilter}
    )
    SELECT
      mode,
      period,
      SUM(kg) AS kg,
      SUM(pieces) AS pieces,
      SUM(revenue) AS revenue,
      COUNT(DISTINCT clientId) AS customers,
      COUNT(DISTINCT orderId) AS orders,
      COUNT(DISTINCT productId) AS products,
      COUNT(DISTINCT seller) AS sellers
    FROM Modes
    GROUP BY mode, period
    ORDER BY mode, period;

    SELECT
      p.[ID Fornecedor] AS supplierId,
      MAX(LTRIM(RTRIM(p.[Fornecedor]))) AS supplierName,
      COUNT(DISTINCT p.[ID Produto]) AS totalProducts,
      COUNT(DISTINCT CASE
        WHEN NULLIF(LTRIM(RTRIM(ISNULL(p.[Status], ''))), '') IS NULL
          OR UPPER(LTRIM(RTRIM(ISNULL(p.[Status], '')))) LIKE 'ATIV%'
        THEN p.[ID Produto]
      END) AS activeProducts,
      COUNT(DISTINCT CASE
        WHEN NULLIF(LTRIM(RTRIM(ISNULL(p.[Status], ''))), '') IS NOT NULL
          AND UPPER(LTRIM(RTRIM(ISNULL(p.[Status], '')))) NOT LIKE 'ATIV%'
        THEN p.[ID Produto]
      END) AS inactiveProducts
    FROM dbo.Produtos p
    WHERE p.[ID Fornecedor] IN (${supplierIds.join(',')})
    GROUP BY p.[ID Fornecedor]
    ORDER BY p.[ID Fornecedor];

    WITH ActiveSellers AS (
      SELECT DISTINCT LTRIM(RTRIM(c.[Vendedor])) AS seller
      FROM dbo.Clientes c
      WHERE NULLIF(LTRIM(RTRIM(c.[Vendedor])), '') IS NOT NULL
        AND UPPER(LTRIM(RTRIM(ISNULL(c.[Status], '')))) LIKE 'ATIV%'
    )
    SELECT
      CASE
        WHEN v.[Data] >= CONVERT(date, @currentStart, 23)
         AND v.[Data] < CONVERT(date, @currentEnd, 23)
        THEN 'current' ELSE 'previous'
      END AS period,
      COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(p.[Status], ''))), ''), '(vazio)') AS productStatus,
      COUNT(DISTINCT vp.[ID Produto]) AS products,
      SUM(ISNULL(vp.[Qtde Kg], 0)) AS kg,
      SUM(ISNULL(vp.[Valor], 0)) AS revenue
    FROM dbo.Vendas v
    INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
    INNER JOIN dbo.Produtos p ON p.[ID Produto] = vp.[ID Produto]
    INNER JOIN ActiveSellers a ON a.seller = LTRIM(RTRIM(v.[Vendedor]))
    WHERE p.[ID Fornecedor] IN (${supplierIds.join(',')})
      AND (
        (v.[Data] >= CONVERT(date, @currentStart, 23) AND v.[Data] < CONVERT(date, @currentEnd, 23))
        OR
        (v.[Data] >= CONVERT(date, @previousStart, 23) AND v.[Data] < CONVERT(date, @previousEnd, 23))
      )
    GROUP BY
      CASE
        WHEN v.[Data] >= CONVERT(date, @currentStart, 23)
         AND v.[Data] < CONVERT(date, @currentEnd, 23)
        THEN 'current' ELSE 'previous'
      END,
      COALESCE(NULLIF(LTRIM(RTRIM(ISNULL(p.[Status], ''))), ''), '(vazio)')
    ORDER BY period, kg DESC;

    WITH ActiveSellers AS (
      SELECT DISTINCT LTRIM(RTRIM(c.[Vendedor])) AS seller
      FROM dbo.Clientes c
      WHERE NULLIF(LTRIM(RTRIM(c.[Vendedor])), '') IS NOT NULL
        AND UPPER(LTRIM(RTRIM(ISNULL(c.[Status], '')))) LIKE 'ATIV%'
    )
    SELECT TOP (60)
      CASE
        WHEN v.[Data] >= CONVERT(date, @currentStart, 23)
         AND v.[Data] < CONVERT(date, @currentEnd, 23)
        THEN 'current' ELSE 'previous'
      END AS period,
      COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), v.[Tipo]))), ''), '(vazio)') AS saleType,
      COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), v.[Forma de Venda]))), ''), '(vazio)') AS saleForm,
      SUM(ISNULL(vp.[Qtde Kg], 0)) AS kg,
      SUM(ISNULL(vp.[Valor], 0)) AS revenue,
      COUNT(DISTINCT v.[ID Pedido de Venda]) AS orders
    FROM dbo.Vendas v
    INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
    INNER JOIN dbo.Produtos p ON p.[ID Produto] = vp.[ID Produto]
    INNER JOIN ActiveSellers a ON a.seller = LTRIM(RTRIM(v.[Vendedor]))
    WHERE p.[ID Fornecedor] IN (${supplierIds.join(',')})
      AND (
        (v.[Data] >= CONVERT(date, @currentStart, 23) AND v.[Data] < CONVERT(date, @currentEnd, 23))
        OR
        (v.[Data] >= CONVERT(date, @previousStart, 23) AND v.[Data] < CONVERT(date, @previousEnd, 23))
      )
    GROUP BY
      CASE
        WHEN v.[Data] >= CONVERT(date, @currentStart, 23)
         AND v.[Data] < CONVERT(date, @currentEnd, 23)
        THEN 'current' ELSE 'previous'
      END,
      COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), v.[Tipo]))), ''), '(vazio)'),
      COALESCE(NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), v.[Forma de Venda]))), ''), '(vazio)')
    ORDER BY period, kg DESC;
  `);

  const totals = (result.recordsets?.[0] || []).map((row) => ({
    mode:text(row.mode),
    period:text(row.period),
    kg:Number(row.kg) || 0,
    pieces:Number(row.pieces) || 0,
    revenue:Number(row.revenue) || 0,
    customers:Number(row.customers) || 0,
    orders:Number(row.orders) || 0,
    products:Number(row.products) || 0,
    sellers:Number(row.sellers) || 0,
  }));

  const catalog = (result.recordsets?.[1] || []).map((row) => ({
    supplierId:Number(row.supplierId),
    supplierName:text(row.supplierName),
    totalProducts:Number(row.totalProducts) || 0,
    activeProducts:Number(row.activeProducts) || 0,
    inactiveProducts:Number(row.inactiveProducts) || 0,
  }));

  const statusBreakdown = (result.recordsets?.[2] || []).map((row) => ({
    period:text(row.period),
    productStatus:text(row.productStatus),
    products:Number(row.products) || 0,
    kg:Number(row.kg) || 0,
    revenue:Number(row.revenue) || 0,
  }));

  const saleBreakdown = (result.recordsets?.[3] || []).map((row) => ({
    period:text(row.period),
    saleType:text(row.saleType),
    saleForm:text(row.saleForm),
    kg:Number(row.kg) || 0,
    revenue:Number(row.revenue) || 0,
    orders:Number(row.orders) || 0,
  }));

  const get = (mode, period) => totals.find((row) => row.mode === mode && row.period === period) || {
    kg:0, pieces:0, revenue:0, customers:0, orders:0, products:0, sellers:0,
  };

  const causes = [];
  const grossCurrent = get('FORNECEDOR_BRUTO', 'current');
  const activeCurrent = get('FORNECEDOR_VENDEDORES_ATIVOS', 'current');
  const activeProductsCurrent = get('PRODUTOS_ATIVOS_VENDEDORES_ATIVOS', 'current');
  const effectiveCurrent = get('ESCOPO_EFETIVO_CAMPANHA', 'current');
  const pctLoss = (full, part) => full ? ((full - part) / Math.abs(full)) * 100 : 0;

  if (productIds.length && effectiveCurrent.kg + 0.001 < activeCurrent.kg) {
    causes.push({
      code:'PRODUCT_SCOPE_CUT',
      severity:'high',
      message:`A lista de ${productIds.length} produto(s) usada pela campanha deixa de fora ${pctLoss(activeCurrent.kg, effectiveCurrent.kg).toFixed(1)}% do KG que existe no fornecedor entre os vendedores ativos.`,
    });
  }

  const catalogTotal = catalog.reduce((sum, row) => sum + row.totalProducts, 0);
  const catalogActive = catalog.reduce((sum, row) => sum + row.activeProducts, 0);
  if (catalogTotal > catalogActive) {
    causes.push({
      code:'INACTIVE_PRODUCTS_EXIST',
      severity:'medium',
      message:`Há ${catalogTotal} produtos cadastrados no(s) fornecedor(es), mas só ${catalogActive} estão ativos hoje. Produtos inativos podem ter vendas históricas e precisam permanecer numa apuração por fornecedor.`,
    });
  }

  if (grossCurrent.kg > 0 && activeCurrent.kg + 0.001 < grossCurrent.kg) {
    const loss = pctLoss(grossCurrent.kg, activeCurrent.kg);
    causes.push({
      code:'ACTIVE_SELLER_FILTER_CURRENT',
      severity:loss >= 10 ? 'high' : 'medium',
      message:`O filtro de representantes ativos reduz o KG atual em ${loss.toFixed(1)}% contra o fornecedor bruto.`,
    });
  }

  const grossPrevious = get('FORNECEDOR_BRUTO', 'previous');
  const activePrevious = get('FORNECEDOR_VENDEDORES_ATIVOS', 'previous');
  if (grossPrevious.kg > 0 && activePrevious.kg + 0.001 < grossPrevious.kg) {
    const loss = pctLoss(grossPrevious.kg, activePrevious.kg);
    causes.push({
      code:'ACTIVE_SELLER_FILTER_PREVIOUS',
      severity:loss >= 10 ? 'high' : 'medium',
      message:`A carteira ativa de hoje reduz o KG do período anterior em ${loss.toFixed(1)}%. Essa base não pode ser usada para crescimento coletivo histórico.`,
    });
  }

  if (activeCurrent.kg > 0 && activeProductsCurrent.kg + 0.001 < activeCurrent.kg) {
    causes.push({
      code:'PRODUCT_STATUS_FILTER_RISK',
      severity:'high',
      message:`Se fossem considerados apenas produtos hoje ativos, o KG atual cairia ${pctLoss(activeCurrent.kg, activeProductsCurrent.kg).toFixed(1)}%.`,
    });
  }

  return {
    ok:true,
    source:'SQL Server · Power BI',
    endpoint:'/api/campanhas-data?recurso=diagnostico-consistencia',
    handler:'local-api/campanhas-data.js → queryConsistencyDiagnostic()',
    supplierIds,
    productIds,
    sellers,
    periodsUsed:{
      currentStart:isoDate(currentStart),
      currentEndExclusive:isoDate(currentEnd),
      currentLastInclusive:isoDate(addUtcDays(currentEnd, -1)),
      previousStart:isoDate(previousStart),
      previousEndExclusive:isoDate(previousEnd),
      previousLastInclusive:isoDate(addUtcDays(previousEnd, -1)),
    },
    dateBoundaryMode:'YYYY-MM-DD convertido para DATE no SQL',
    modes:{
      FORNECEDOR_BRUTO:'Todas as linhas do fornecedor, sem filtro de representante ativo.',
      FORNECEDOR_VENDEDORES_ATIVOS:'Fornecedor inteiro, somente vendedores que possuem carteira ativa hoje.',
      PRODUTOS_ATIVOS_VENDEDORES_ATIVOS:'Fornecedor, vendedores ativos e somente produtos cujo status atual é ativo/vazio.',
      ESCOPO_EFETIVO_CAMPANHA:productIds.length
        ? 'Exatamente a lista de produtos usada pela campanha, com vendedor ativo.'
        : 'Fornecedor inteiro, com vendedor ativo.',
    },
    totals,
    catalog,
    statusBreakdown,
    saleBreakdown,
    causes,
    durationMs:Date.now() - startedAt,
  };
}


function benefitMeasure(lines, ids, measure) {
  const relevant = lines.filter((line) => ids.has(Number(line.productId)));
  if (measure === 'pieces') return relevant.reduce((sum, line) => sum + Number(line.pieces || 0), 0);
  return new Set(relevant.map((line) => Number(line.productId))).size;
}

function benefitDiscount({ discountType, discountValue, benefitRevenue, benefitPieces }) {
  const value = Number(discountValue) || 0;
  if (discountType === 'percent') return Math.max(0, Number(benefitRevenue || 0) * value / 100);
  if (discountType === 'fixed_per_piece') return Math.max(0, Number(benefitPieces || 0) * value);
  if (discountType === 'fixed') return Math.max(0, value);
  return 0;
}

async function queryFirstPurchaseBenefit(payload = {}) {
  const startedAt = Date.now();
  const periods = resolveCampaignPeriods(payload);
  const currentStart = periods.currentStart;
  const currentEnd = periods.currentEnd;

  const sellers = uniqueTexts(payload.sellers);
  const triggerProductIds = uniqueIntegers(payload.triggerProductIds);
  const benefitProductIds = uniqueIntegers(payload.benefitProductIds);
  const allProductIds = [...new Set([...triggerProductIds, ...benefitProductIds])];
  const firstPurchaseMode = ['historical_trigger','campaign_trigger'].includes(text(payload.firstPurchaseMode))
    ? text(payload.firstPurchaseMode)
    : 'campaign_trigger';
  const triggerMeasure = text(payload.triggerMeasure) === 'pieces' ? 'pieces' : 'distinct_products';
  const benefitMeasureMode = text(payload.benefitMeasure) === 'pieces' ? 'pieces' : 'distinct_products';
  const triggerMin = Math.max(1, Number(payload.triggerMin) || 1);
  const benefitMin = Math.max(1, Number(payload.benefitMin) || 1);
  const discountType = ['pending','percent','fixed_per_piece','fixed'].includes(text(payload.discountType))
    ? text(payload.discountType)
    : 'pending';
  const discountValue = Math.max(0, Number(payload.discountValue) || 0);

  if (!triggerProductIds.length || !benefitProductIds.length) {
    const error = new Error('Configure os produtos ativadores e os produtos que recebem desconto.');
    error.code = 'BENEFICIO_PRODUTOS_AUSENTES';
    throw error;
  }

  const cacheKey = JSON.stringify({
    currentStart:isoDate(currentStart),
    currentEnd:isoDate(currentEnd),
    sellers:[...sellers].sort(),
    triggerProductIds:[...triggerProductIds].sort((a,b)=>a-b),
    benefitProductIds:[...benefitProductIds].sort((a,b)=>a-b),
    firstPurchaseMode, triggerMeasure, benefitMeasureMode, triggerMin, benefitMin,
    discountType, discountValue,
    ruleName:text(payload.ruleName),
    triggerCategoryName:text(payload.triggerCategoryName),
    benefitCategoryName:text(payload.benefitCategoryName),
  });

  const cached = benefitCache.get(cacheKey);
  if (!payload.forceRefresh && cached && Date.now() - cached.createdAt <= BENEFIT_CACHE_TTL_MS) {
    return {
      ...cached.value,
      durationMs:Date.now() - startedAt,
      cache:{ hit:true, ageMs:Date.now()-cached.createdAt, ttlMs:BENEFIT_CACHE_TTL_MS },
    };
  }

  for (const [key, entry] of benefitCache.entries()) {
    if (!entry || Date.now() - entry.createdAt > BENEFIT_CACHE_TTL_MS) benefitCache.delete(key);
  }

  const pool = await getPool();
  const request = pool.request();
  request.input('currentStart', sql.VarChar(10), isoDate(currentStart));
  request.input('currentEnd', sql.VarChar(10), isoDate(currentEnd));

  const clientSellerFilter = sellers.length
    ? `AND LTRIM(RTRIM(c.[Vendedor])) IN (${addTextParams(request, 'benefitClientSeller', sellers)})`
    : '';
  const result = await request.query(`
    SET NOCOUNT ON;

    SELECT
      c.[ID Cliente] AS clientId,
      LTRIM(RTRIM(ISNULL(c.[Cliente], ''))) AS clientName,
      LTRIM(RTRIM(ISNULL(c.[Nome Fantasia], ''))) AS tradeName,
      LTRIM(RTRIM(ISNULL(c.[CNPJ/CPF], ''))) AS document,
      LTRIM(RTRIM(ISNULL(c.[Vendedor], ''))) AS seller,
      LTRIM(RTRIM(ISNULL(c.[Cidade], ''))) AS city,
      LTRIM(RTRIM(ISNULL(c.[UF], ''))) AS uf,
      LTRIM(RTRIM(ISNULL(c.[Status], ''))) AS status
    FROM dbo.Clientes c
    WHERE c.[ID Cliente] IS NOT NULL
      AND UPPER(LTRIM(RTRIM(ISNULL(c.[Status], '')))) LIKE 'ATIV%'
      ${clientSellerFilter};

    WITH VendasRank AS (
      SELECT
        v.[ID Pedido de Venda],
        v.[Data],
        v.[ID Cliente],
        v.[Vendedor],
        ROW_NUMBER() OVER (
          PARTITION BY v.[ID Pedido de Venda]
          ORDER BY
            CASE WHEN v.[Data] IS NULL THEN 1 ELSE 0 END,
            v.[Data] DESC,
            CASE WHEN NULLIF(LTRIM(RTRIM(v.[Vendedor])), '') IS NULL THEN 1 ELSE 0 END,
            v.[ID Cliente] DESC
        ) AS rn
      FROM dbo.Vendas v
      WHERE v.[Data] >= CONVERT(date, @currentStart, 23)
        AND v.[Data] < CONVERT(date, @currentEnd, 23)
    ),
    VendasUnicas AS (
      SELECT [ID Pedido de Venda], [Data], [ID Cliente], [Vendedor]
      FROM VendasRank
      WHERE rn = 1
    ),
    ProdutosRank AS (
      SELECT
        p.[ID Produto], p.[Produto],
        ROW_NUMBER() OVER (
          PARTITION BY p.[ID Produto]
          ORDER BY
            CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(p.[Status], '')))) LIKE 'ATIV%' THEN 0 ELSE 1 END,
            CASE WHEN NULLIF(LTRIM(RTRIM(p.[Produto])), '') IS NOT NULL THEN 0 ELSE 1 END,
            LTRIM(RTRIM(ISNULL(p.[Produto], '')))
        ) AS rn
      FROM dbo.Produtos p
      WHERE p.[ID Produto] IN (${allProductIds.join(',')})
    ),
    ProdutosUnicos AS (
      SELECT [ID Produto], [Produto]
      FROM ProdutosRank
      WHERE rn = 1
    )
    SELECT
      v.[ID Cliente] AS clientId,
      v.[ID Pedido de Venda] AS orderId,
      v.[Data] AS orderDate,
      LTRIM(RTRIM(v.[Vendedor])) AS seller,
      vp.[ID Produto] AS productId,
      p.[Produto] AS productName,
      SUM(ISNULL(vp.[Qtde PC], 0)) AS pieces,
      SUM(ISNULL(vp.[Qtde Kg], 0)) AS kg,
      SUM(ISNULL(vp.[Valor], 0)) AS revenue
    FROM VendasUnicas v
    INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
    INNER JOIN ProdutosUnicos p ON p.[ID Produto] = vp.[ID Produto]
    WHERE v.[ID Cliente] IS NOT NULL
      AND vp.[ID Produto] IN (${allProductIds.join(',')})
    GROUP BY
      v.[ID Cliente], v.[ID Pedido de Venda], v.[Data], LTRIM(RTRIM(v.[Vendedor])),
      vp.[ID Produto], p.[Produto]
    ORDER BY v.[ID Cliente], v.[Data], v.[ID Pedido de Venda], vp.[ID Produto];

    ${firstPurchaseMode === 'historical_trigger' ? `
    WITH TriggerOrders AS (
      SELECT DISTINCT vp.[ID Pedido de Venda] AS orderId
      FROM dbo.VendasProdutos vp
      WHERE vp.[ID Produto] IN (${triggerProductIds.join(',')})
    ),
    PriorVendasRank AS (
      SELECT
        v.[ID Pedido de Venda],
        v.[Data],
        v.[ID Cliente],
        ROW_NUMBER() OVER (
          PARTITION BY v.[ID Pedido de Venda]
          ORDER BY
            CASE WHEN v.[Data] IS NULL THEN 1 ELSE 0 END,
            v.[Data] DESC,
            v.[ID Cliente] DESC
        ) AS rn
      FROM TriggerOrders t
      INNER JOIN dbo.Vendas v ON v.[ID Pedido de Venda] = t.orderId
      WHERE v.[Data] < CONVERT(date, @currentStart, 23)
    )
    SELECT
      v.[ID Cliente] AS clientId,
      MIN(v.[Data]) AS firstPriorDate
    FROM PriorVendasRank v
    WHERE v.rn = 1
      AND v.[ID Cliente] IS NOT NULL
    GROUP BY v.[ID Cliente];
    ` : `
    SELECT CAST(NULL AS int) AS clientId, CAST(NULL AS datetime2) AS firstPriorDate WHERE 1 = 0;
    `}

    WITH ProdutosRank AS (
      SELECT
        p.[ID Produto], p.[Produto],
        ROW_NUMBER() OVER (
          PARTITION BY p.[ID Produto]
          ORDER BY
            CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(p.[Status], '')))) LIKE 'ATIV%' THEN 0 ELSE 1 END,
            CASE WHEN NULLIF(LTRIM(RTRIM(p.[Produto])), '') IS NOT NULL THEN 0 ELSE 1 END,
            LTRIM(RTRIM(ISNULL(p.[Produto], '')))
        ) AS rn
      FROM dbo.Produtos p
      WHERE p.[ID Produto] IN (${allProductIds.join(',')})
    )
    SELECT [ID Produto] AS productId, LTRIM(RTRIM(ISNULL([Produto], ''))) AS productName
    FROM ProdutosRank
    WHERE rn = 1
    ORDER BY [ID Produto];
  `);

  const clientMap = new Map();
  for (const row of result.recordsets?.[0] || []) {
    const id = Number(row.clientId);
    if (!Number.isFinite(id) || clientMap.has(id)) continue;
    clientMap.set(id, {
      clientId:id,
      clientName:text(row.clientName),
      tradeName:text(row.tradeName),
      document:text(row.document),
      seller:text(row.seller),
      city:text(row.city),
      uf:text(row.uf),
    });
  }

  const lines = (result.recordsets?.[1] || []).map((row) => ({
    clientId:Number(row.clientId),
    orderId:String(row.orderId),
    orderDate:row.orderDate || null,
    seller:text(row.seller),
    productId:Number(row.productId),
    productName:text(row.productName),
    pieces:Number(row.pieces) || 0,
    kg:Number(row.kg) || 0,
    revenue:Number(row.revenue) || 0,
  }));

  const priorMap = new Map(
    (result.recordsets?.[2] || [])
      .filter((row) => row.clientId != null)
      .map((row) => [Number(row.clientId), row.firstPriorDate || null])
  );

  const productMap = new Map(
    (result.recordsets?.[3] || []).map((row) => [Number(row.productId), text(row.productName)])
  );

  const triggerIds = new Set(triggerProductIds);
  const benefitIds = new Set(benefitProductIds);
  const ordersByClient = new Map();

  for (const line of lines) {
    if (!ordersByClient.has(line.clientId)) ordersByClient.set(line.clientId, new Map());
    const orders = ordersByClient.get(line.clientId);
    if (!orders.has(line.orderId)) orders.set(line.orderId, {
      orderId:line.orderId,
      orderDate:line.orderDate,
      seller:line.seller,
      lines:[],
    });
    orders.get(line.orderId).lines.push(line);
  }

  const clients = [];
  for (const client of clientMap.values()) {
    const priorDate = priorMap.get(client.clientId) || null;
    const orderMap = ordersByClient.get(client.clientId) || new Map();
    const orders = [...orderMap.values()].sort((a,b) => {
      const dateCompare = new Date(a.orderDate || 0).getTime() - new Date(b.orderDate || 0).getTime();
      if (dateCompare) return dateCompare;
      return String(a.orderId).localeCompare(String(b.orderId), 'pt-BR', { numeric:true });
    });

    let firstTriggerOrder = null;
    for (const order of orders) {
      const triggerValue = benefitMeasure(order.lines, triggerIds, triggerMeasure);
      if (triggerValue >= triggerMin) {
        firstTriggerOrder = { ...order, triggerValue };
        break;
      }
    }

    let status = 'AVAILABLE';
    let reason = firstPurchaseMode === 'historical_trigger'
      ? 'Cliente ativo sem compra anterior do produto ativador; benefício disponível.'
      : 'Cliente ainda não comprou o produto ativador nesta campanha; benefício disponível.';
    let firstTriggerDate = null;
    let firstOrderId = '';
    let triggerLines = [];
    let benefitLines = [];
    let benefitPieces = 0;
    let benefitKg = 0;
    let benefitRevenue = 0;
    let estimatedDiscount = 0;

    if (firstPurchaseMode === 'historical_trigger' && priorDate) {
      status = 'INELIGIBLE_PRIOR_PURCHASE';
      firstTriggerDate = priorDate;
      reason = 'Cliente já comprou o produto ativador antes do início da campanha e não possui direito ao benefício de primeira compra.';
    } else if (firstTriggerOrder) {
      firstTriggerDate = firstTriggerOrder.orderDate;
      firstOrderId = firstTriggerOrder.orderId;
      triggerLines = firstTriggerOrder.lines.filter((line) => triggerIds.has(Number(line.productId)));
      benefitLines = firstTriggerOrder.lines.filter((line) => benefitIds.has(Number(line.productId)));
      const benefitValue = benefitMeasure(firstTriggerOrder.lines, benefitIds, benefitMeasureMode);

      benefitPieces = benefitLines.reduce((sum,line) => sum + Number(line.pieces || 0), 0);
      benefitKg = benefitLines.reduce((sum,line) => sum + Number(line.kg || 0), 0);
      benefitRevenue = benefitLines.reduce((sum,line) => sum + Number(line.revenue || 0), 0);

      if (benefitValue >= benefitMin) {
        status = 'USED';
        estimatedDiscount = benefitDiscount({ discountType, discountValue, benefitRevenue, benefitPieces });
        reason = 'Primeira compra do produto ativador contém produtos beneficiados; benefício registrado como utilizado.';
      } else {
        status = 'CONSUMED_WITHOUT_BENEFIT';
        reason = 'A primeira compra do produto ativador não continha o mínimo de produtos beneficiados. Como o benefício vale somente na primeira compra, ele fica consumido sem desconto aplicado.';
      }
    }

    clients.push({
      ...client,
      status,
      reason,
      firstTriggerDate,
      firstOrderId,
      firstOrderSeller:firstTriggerOrder?.seller || '',
      triggerLines,
      benefitLines,
      benefitPieces,
      benefitKg,
      benefitRevenue,
      estimatedDiscount,
    });
  }

  const summary = {
    totalClients:clients.length,
    available:clients.filter((row) => row.status === 'AVAILABLE').length,
    used:clients.filter((row) => row.status === 'USED').length,
    ineligiblePrior:clients.filter((row) => row.status === 'INELIGIBLE_PRIOR_PURCHASE').length,
    consumedWithoutBenefit:clients.filter((row) => row.status === 'CONSUMED_WITHOUT_BENEFIT').length,
    estimatedDiscountUsed:clients.reduce((sum,row) => sum + Number(row.estimatedDiscount || 0), 0),
  };

  const configuration = {
    name:text(payload.ruleName) || 'Benefício de primeira compra',
    firstPurchaseMode,
    triggerMeasure,
    triggerMin,
    benefitMeasure:benefitMeasureMode,
    benefitMin,
    discountType,
    discountValue,
    triggerCategoryName:text(payload.triggerCategoryName) || 'Produto ativador',
    benefitCategoryName:text(payload.benefitCategoryName) || 'Produtos beneficiados',
    triggerProducts:triggerProductIds.map((id) => ({ id, name:productMap.get(id) || `Produto ${id}` })),
    benefitProducts:benefitProductIds.map((id) => ({ id, name:productMap.get(id) || `Produto ${id}` })),
  };

  const response = {
    ok:true,
    source:'SQL Server · Power BI',
    endpoint:'/api/campanhas-data?recurso=beneficio-primeira-compra',
    handler:'local-api/campanhas-data.js → queryFirstPurchaseBenefit()',
    dateReference:'dbo.Vendas.[Data]',
    periodsUsed:{
      currentStart:isoDate(currentStart),
      currentEndExclusive:isoDate(currentEnd),
      currentLastInclusive:isoDate(addUtcDays(currentEnd, -1)),
    },
    configuration,
    summary,
    clients:clients.sort((a,b) =>
      a.status.localeCompare(b.status) ||
      String(a.seller).localeCompare(String(b.seller), 'pt-BR') ||
      String(a.tradeName || a.clientName).localeCompare(String(b.tradeName || b.clientName), 'pt-BR')
    ),
    warnings:[
      'A lista-base considera clientes cujo dbo.Clientes.[Status] começa por ATIV.',
      firstPurchaseMode === 'historical_trigger'
        ? 'Direito disponível significa que não foi localizada compra anterior dos produtos ativadores antes do início da campanha.'
        : 'Direito disponível significa que o cliente ainda não comprou o ativador dentro da campanha.',
      'O benefício é consumido na primeira compra do ativador. Se esse pedido não tiver produto beneficiado, o relatório marca “1ª compra sem item beneficiado”.',
      'Tipo/Forma de Venda, devoluções e cancelamentos seguem sem regra corporativa adicional nesta versão; a leitura usa as mesmas tabelas comerciais do módulo de campanhas.',
      'A compra histórica do produto ativador é vinculada ao cliente, independentemente de qual vendedor registrou o pedido no passado; a seleção de representantes usa a carteira atual de dbo.Clientes.',
      'O desconto é calculado apenas para conferência. Esta rota não altera preços nem pedidos no ERP.',
    ],
    durationMs:Date.now()-startedAt,
    cache:{ hit:false, ageMs:0, ttlMs:BENEFIT_CACHE_TTL_MS },
  };

  benefitCache.set(cacheKey, { createdAt:Date.now(), value:response });
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
    ? resolveCampaignPeriods(payload)
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
  request.input('currentStart', sql.VarChar(10), isoDate(currentStart));
  request.input('currentEnd', sql.VarChar(10), isoDate(currentEnd));
  request.input('previousStart', sql.VarChar(10), isoDate(previousStart));
  request.input('previousEnd', sql.VarChar(10), isoDate(previousEnd));

  const scopeFilter = productIds.length
    ? `vp.[ID Produto] IN (${productIds.join(',')})`
    : `EXISTS (
        SELECT 1
        FROM dbo.Produtos pScope
        WHERE pScope.[ID Produto] = vp.[ID Produto]
          AND pScope.[ID Fornecedor] IN (${supplierIds.join(',')})
      )`;

  const result = await request.query(`
    SET NOCOUNT ON;

    DECLARE @sellerAuditTrim nvarchar(200) = LTRIM(RTRIM(@sellerAudit));
    DECLARE @sellerAuditDash int = CHARINDEX('-', REVERSE(@sellerAuditTrim));
    DECLARE @sellerAuditCode int = TRY_CONVERT(int, CASE WHEN @sellerAuditDash > 1 THEN RIGHT(@sellerAuditTrim, @sellerAuditDash - 1) END);
    DECLARE @sellerAuditNameKey nvarchar(200) = UPPER(REPLACE(LTRIM(RTRIM(CASE
      WHEN @sellerAuditCode IS NOT NULL THEN LEFT(@sellerAuditTrim, LEN(@sellerAuditTrim) - @sellerAuditDash)
      ELSE @sellerAuditTrim
    END)), ' ', ''));

    WITH VendasRank AS (
      SELECT
        v.[ID Pedido de Venda], v.[Data], v.[ID Cliente], v.[Vendedor],
        v.[Tipo], v.[Forma de Venda], v.[Valor Total],
        ROW_NUMBER() OVER (
          PARTITION BY v.[ID Pedido de Venda]
          ORDER BY
            CASE WHEN v.[Data] IS NULL THEN 1 ELSE 0 END,
            v.[Data] DESC,
            CASE WHEN NULLIF(LTRIM(RTRIM(v.[Vendedor])), '') IS NULL THEN 1 ELSE 0 END,
            v.[ID Cliente] DESC
        ) AS rn
      FROM dbo.Vendas v
    ),
    VendasUnicas AS (
      SELECT [ID Pedido de Venda], [Data], [ID Cliente], [Vendedor], [Tipo], [Forma de Venda], [Valor Total]
      FROM VendasRank
      WHERE rn = 1
    ),
    ProdutosRank AS (
      SELECT
        p.[ID Produto], p.[Produto], p.[ID Fornecedor], p.[Fornecedor], p.[Status],
        ROW_NUMBER() OVER (
          PARTITION BY p.[ID Produto]
          ORDER BY
            CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(p.[Status], '')))) LIKE 'ATIV%' THEN 0 ELSE 1 END,
            CASE WHEN NULLIF(LTRIM(RTRIM(p.[Produto])), '') IS NOT NULL THEN 0 ELSE 1 END,
            CASE WHEN p.[ID Fornecedor] IS NOT NULL THEN 0 ELSE 1 END,
            LTRIM(RTRIM(ISNULL(p.[Fornecedor], ''))),
            LTRIM(RTRIM(ISNULL(p.[Produto], '')))
        ) AS rn
      FROM dbo.Produtos p
    ),
    ProdutosUnicos AS (
      SELECT [ID Produto], [Produto], [ID Fornecedor], [Fornecedor]
      FROM ProdutosRank
      WHERE rn = 1
    )
    SELECT TOP (1500)
      CASE WHEN v.[Data] >= CONVERT(date, @currentStart, 23) AND v.[Data] < CONVERT(date, @currentEnd, 23) THEN 'current' ELSE 'previous' END AS period,
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
    FROM VendasUnicas v
    INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
    INNER JOIN ProdutosUnicos p ON p.[ID Produto] = vp.[ID Produto]
    CROSS APPLY (
      SELECT
        LTRIM(RTRIM(v.[Vendedor])) AS rawSeller,
        CHARINDEX('-', REVERSE(LTRIM(RTRIM(v.[Vendedor])))) AS dashPos
    ) sellerRaw
    CROSS APPLY (
      SELECT TRY_CONVERT(int, CASE WHEN sellerRaw.dashPos > 1 THEN RIGHT(sellerRaw.rawSeller, sellerRaw.dashPos - 1) END) AS sellerCode
    ) sellerCodePart
    CROSS APPLY (
      SELECT UPPER(REPLACE(LTRIM(RTRIM(CASE
        WHEN sellerCodePart.sellerCode IS NOT NULL THEN LEFT(sellerRaw.rawSeller, LEN(sellerRaw.rawSeller) - sellerRaw.dashPos)
        ELSE sellerRaw.rawSeller
      END)), ' ', '')) AS sellerNameKey
    ) sellerNamePart
    WHERE (
        (@sellerAuditCode IS NOT NULL AND sellerCodePart.sellerCode = @sellerAuditCode)
        OR (sellerCodePart.sellerCode IS NULL AND sellerNamePart.sellerNameKey = @sellerAuditNameKey)
        OR (@sellerAuditCode IS NULL AND sellerNamePart.sellerNameKey = @sellerAuditNameKey)
      )
      AND (
        (v.[Data] >= CONVERT(date, @currentStart, 23) AND v.[Data] < CONVERT(date, @currentEnd, 23))
        OR (v.[Data] >= CONVERT(date, @previousStart, 23) AND v.[Data] < CONVERT(date, @previousEnd, 23))
      )
      AND ${scopeFilter}
    GROUP BY
      CASE WHEN v.[Data] >= CONVERT(date, @currentStart, 23) AND v.[Data] < CONVERT(date, @currentEnd, 23) THEN 'current' ELSE 'previous' END,
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
  const sellerAliases = distinctValues('seller');

  return {
    ok:true,
    source:'SQL Server · Power BI',
    endpoint:'/api/campanhas-data?recurso=auditoria-vendedor',
    handler:'local-api/campanhas-data.js → querySellerAudit()',
    seller,
    sellerAliases,
    sellerMatchPolicy:'ID final do vendedor; fallback por nome normalizado sem sufixo',
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
      'O vendedor auditado é conciliado pelo ID numérico no final do campo Vendedor quando disponível; se o histórico não tiver ID, o sistema usa o nome normalizado sem o sufixo.',
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
    CAMPANHA_NAO_INICIADA: 'A apuração ficará disponível a partir da data inicial da campanha.',
    VENDEDOR_AUSENTE: 'Escolha um representante para abrir a auditoria.',
    FORNECEDOR_AUSENTE: 'Selecione ao menos um fornecedor para executar o diagnóstico de consistência.',
    BENEFICIO_PRODUTOS_AUSENTES: 'Configure a categoria Fortunata/ativadora e os produtos que recebem desconto.',
  };
  return {
    erro: error?.message || 'Falha inesperada na API local de campanhas.',
    codigo: code,
    origem: 'local-api/campanhas-data',
    versao: '5.12.0',
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
        version: '5.12.0',
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

    if (resource === 'beneficio-primeira-compra') {
      if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST para o relatório de benefícios.', codigo: 'METODO_INVALIDO' });
      return res.status(200).json(await queryFirstPurchaseBenefit(req.body || {}));
    }

    if (resource === 'diagnostico-consistencia') {
      if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST para diagnóstico.', codigo: 'METODO_INVALIDO' });
      return res.status(200).json(await queryConsistencyDiagnostic(req.body || {}));
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
