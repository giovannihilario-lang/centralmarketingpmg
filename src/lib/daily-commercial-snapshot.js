import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzip, gunzip } from 'node:zlib';
import { promisify } from 'node:util';
import { Worker, isMainThread } from 'node:worker_threads';
import { getPool, resetPool } from './db.js';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.resolve(__dirname, '../../data/pmg-comercial-diario-v1.json.gz');
const SNAPSHOT_VERSION = 1;
const SNAPSHOT_TIMEZONE = String(process.env.PMG_SNAPSHOT_TIMEZONE || 'America/Sao_Paulo').trim();
const SNAPSHOT_NOT_BEFORE = String(process.env.PMG_SNAPSHOT_NOT_BEFORE || '').trim();
const SNAPSHOT_SQL_TIMEOUT_MS = Math.max(120000, Number(process.env.PMG_SNAPSHOT_SQL_TIMEOUT_MS) || 10 * 60 * 1000);

const state = {
  status: 'idle',
  day: null,
  updatedAt: null,
  startedAt: null,
  source: null,
  stale: false,
  error: null,
  counts: {},
  snapshot: null,
  lastAttemptDay: null,
  lastAttemptAt: null,
  deferredUntil: null,
  phase: 'idle',
  progress: 0,
  message: 'Aguardando sincronização.',
};

let diskLoaded = false;
let syncPromise = null;

const text = (value) => String(value ?? '').trim();
const upper = (value) => text(value).toLocaleUpperCase('pt-BR');

export function snapshotDay(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SNAPSHOT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function localClock(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: SNAPSHOT_TIMEZONE,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value || '00';
  return `${get('hour')}:${get('minute')}`;
}

function beforeConfiguredWindow() {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(SNAPSHOT_NOT_BEFORE)) return false;
  return localClock() < SNAPSHOT_NOT_BEFORE;
}

function publicStatus() {
  return {
    ok: state.status !== 'error' || Boolean(state.snapshot),
    ready: Boolean(state.snapshot),
    status: state.status,
    day: state.day,
    today: snapshotDay(),
    updatedAt: state.updatedAt,
    startedAt: state.startedAt,
    source: state.source,
    stale: state.stale,
    syncing: Boolean(syncPromise) || state.status === 'loading',
    counts: state.counts,
    error: state.error,
    timezone: SNAPSHOT_TIMEZONE,
    notBefore: SNAPSHOT_NOT_BEFORE || null,
    deferredUntil: state.deferredUntil,
    lastAttemptDay: state.lastAttemptDay,
    lastAttemptAt: state.lastAttemptAt,
    sqlTimeoutMs: SNAPSHOT_SQL_TIMEOUT_MS,
    phase: state.phase,
    progress: state.progress,
    message: state.message,
    version: SNAPSHOT_VERSION,
  };
}

export function getDailySnapshotStatus() {
  return publicStatus();
}

function setSnapshotProgress(phase, progress, message) {
  state.phase = phase;
  state.progress = Math.max(0, Math.min(100, Number(progress) || 0));
  state.message = String(message || '');
}


function buildIndexes(snapshot) {
  const ordersById = new Map();
  for (const order of snapshot.orders || []) ordersById.set(String(order.o), order);

  const regionalOrdersById = new Map();
  for (const order of snapshot.regionalOrders || []) regionalOrdersById.set(String(order.o), order);

  const productsById = new Map();
  for (const product of snapshot.products || []) productsById.set(Number(product.p), product);

  const regionalProductsById = new Map();
  for (const product of snapshot.regionalProducts || []) regionalProductsById.set(Number(product.p), product);

  const regionalClientsById = new Map();
  for (const client of snapshot.regionalClients || []) regionalClientsById.set(Number(client.c), client);

  const activeClientsById = new Map();
  for (const client of snapshot.activeClients || []) activeClientsById.set(Number(client.c), client);

  const supplierIdsByProduct = new Map();
  for (const row of snapshot.productSuppliers || []) {
    const productId = Number(row.p);
    const supplierId = Number(row.s);
    if (!Number.isFinite(productId) || !Number.isFinite(supplierId)) continue;
    if (!supplierIdsByProduct.has(productId)) supplierIdsByProduct.set(productId, new Set());
    supplierIdsByProduct.get(productId).add(supplierId);
  }

  const activeSellerByCode = new Map();
  const activeSellerByNameKey = new Map();
  const activeSellerExact = new Set();
  for (const seller of snapshot.activeSellers || []) {
    const parsed = parseSeller(seller.s);
    activeSellerExact.add(text(seller.s));
    if (parsed.code != null && !activeSellerByCode.has(parsed.code)) activeSellerByCode.set(parsed.code, text(seller.s));
    if (parsed.nameKey && !activeSellerByNameKey.has(parsed.nameKey)) activeSellerByNameKey.set(parsed.nameKey, text(seller.s));
  }

  Object.defineProperty(snapshot, '_idx', {
    value: {
      ordersById,
      regionalOrdersById,
      productsById,
      regionalProductsById,
      regionalClientsById,
      activeClientsById,
      supplierIdsByProduct,
      activeSellerByCode,
      activeSellerByNameKey,
      activeSellerExact,
    },
    enumerable: false,
    configurable: true,
  });
  return snapshot;
}

function normalizeLoaded(parsed) {
  if (!parsed || parsed.version !== SNAPSHOT_VERSION || !parsed.data) return null;
  const snapshot = buildIndexes(parsed.data);
  state.snapshot = snapshot;
  state.day = parsed.day || null;
  state.updatedAt = parsed.updatedAt || null;
  state.source = 'disk';
  state.stale = state.day !== snapshotDay();
  state.status = 'ready';
  state.error = null;
  state.counts = parsed.counts || computeCounts(snapshot);
  setSnapshotProgress('ready', 100, state.stale ? 'Último snapshot local carregado.' : 'Snapshot comercial do dia pronto.');
  return snapshot;
}

async function loadDiskSnapshot({ forceReload = false } = {}) {
  if (diskLoaded && !forceReload) return state.snapshot;
  diskLoaded = true;
  try {
    const compressed = await fs.readFile(SNAPSHOT_PATH);
    const raw = await gunzipAsync(compressed);
    return normalizeLoaded(JSON.parse(raw.toString('utf8')));
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn('[snapshot-diario] falha ao ler cache:', error?.message || error);
    return null;
  }
}

function computeCounts(snapshot) {
  return {
    pedidos: snapshot.orders?.length || 0,
    pedidosRegionais: snapshot.regionalOrders?.length || 0,
    itensVenda: snapshot.lines?.length || 0,
    produtos: snapshot.products?.length || 0,
    produtosRegionais: snapshot.regionalProducts?.length || 0,
    clientesRegionais: snapshot.regionalClients?.length || 0,
    clientesAtivos: snapshot.activeClients?.length || 0,
    representantesAtivos: snapshot.activeSellers?.length || 0,
    vinculosProdutoFornecedor: snapshot.productSuppliers?.length || 0,
  };
}

async function writeSnapshot(snapshot, day, updatedAt) {
  const payload = {
    version: SNAPSHOT_VERSION,
    day,
    updatedAt,
    timezone: SNAPSHOT_TIMEZONE,
    counts: computeCounts(snapshot),
    data: snapshot,
  };
  await fs.mkdir(path.dirname(SNAPSHOT_PATH), { recursive: true });
  const tmp = `${SNAPSHOT_PATH}.tmp`;
  const compressed = await gzipAsync(Buffer.from(JSON.stringify(payload), 'utf8'), { level: 6 });
  await fs.writeFile(tmp, compressed);
  try {
    await fs.rename(tmp, SNAPSHOT_PATH);
  } catch (error) {
    if (!['EEXIST', 'EPERM'].includes(error?.code)) throw error;
    await fs.rm(SNAPSHOT_PATH, { force: true });
    await fs.rename(tmp, SNAPSHOT_PATH);
  }
}

function quoteSqlIdentifier(name) {
  return `[${String(name).replaceAll(']', ']]')}]`;
}

function normalizeSqlColumnName(name) {
  return String(name || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('pt-BR')
    .replace(/[^A-Z0-9]/g, '');
}

async function resolveClientDocumentSql(pool) {
  // O nome do documento varia entre versões/visões do ERP. Não deixamos uma
  // coluna opcional derrubar o snapshot inteiro. Detectamos o schema real e,
  // se não houver documento, retornamos NULL mantendo Regional/Campanhas ativos.
  try {
    const metadata = await pool.request().query(`
      SELECT c.name
      FROM sys.columns c
      WHERE c.object_id = OBJECT_ID('dbo.Clientes')
      ORDER BY c.column_id;
    `);
    const columns = (metadata.recordset || []).map((row) => String(row.name || '')).filter(Boolean);
    const byNormalized = new Map(columns.map((name) => [normalizeSqlColumnName(name), name]));
    const exactPriority = ['CNPJCPF', 'CPFCNPJ', 'CGCCPF', 'CPFCGC', 'DOCUMENTO'];
    const combined = exactPriority.map((key) => byNormalized.get(key)).find(Boolean);

    const toText = (column) => `NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), c.${quoteSqlIdentifier(column)}))), '')`;
    if (combined) return toText(combined);

    const cnpj = byNormalized.get('CNPJ') || byNormalized.get('CGC');
    const cpf = byNormalized.get('CPF') || byNormalized.get('CIC');
    if (cnpj && cpf) return `COALESCE(${toText(cnpj)}, ${toText(cpf)})`;
    if (cnpj) return toText(cnpj);
    if (cpf) return toText(cpf);
  } catch (error) {
    console.warn('[snapshot-diario] não foi possível detectar a coluna de documento em dbo.Clientes:', error?.message || error);
  }
  return 'CAST(NULL AS nvarchar(200))';
}

async function querySnapshotFromSql(onProgress = () => {}) {
  onProgress('connect', 5, 'Conectando ao Azure SQL…');
  const pool = await getPool();
  onProgress('schema', 9, 'Conexão pronta. Conferindo o schema comercial…');
  const clientDocumentSql = await resolveClientDocumentSql(pool);
  onProgress('query', 12, 'Lendo vendas, produtos, clientes e representantes do Azure SQL…');
  const request = pool.request();
  request.timeout = SNAPSHOT_SQL_TIMEOUT_MS;
  const result = await request.query(`
    SET NOCOUNT ON;

    -- Regra de pedido usada por Campanhas: em empate de data, prefere vendedor preenchido.
    ;WITH VendasRank AS (
      SELECT
        v.[ID Pedido de Venda] AS orderId,
        v.[Data] AS orderDate,
        v.[ID Cliente] AS clientId,
        NULLIF(LTRIM(RTRIM(v.[Vendedor])), '') AS seller,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), v.[Tipo]))), '') AS saleType,
        NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(200), v.[Forma de Venda]))), '') AS saleForm,
        ISNULL(v.[Valor Total], 0) AS wholeOrderValue,
        ROW_NUMBER() OVER (
          PARTITION BY v.[ID Pedido de Venda]
          ORDER BY
            CASE WHEN v.[Data] IS NULL THEN 1 ELSE 0 END,
            v.[Data] DESC,
            CASE WHEN NULLIF(LTRIM(RTRIM(v.[Vendedor])), '') IS NULL THEN 1 ELSE 0 END,
            v.[ID Cliente] DESC
        ) AS rn
      FROM dbo.Vendas v
      WHERE v.[ID Pedido de Venda] IS NOT NULL
    )
    SELECT orderId, orderDate, clientId, seller, saleType, saleForm, wholeOrderValue
    FROM VendasRank
    WHERE rn = 1;

    -- Regra histórica do Dashboard Regional, preservada separadamente.
    ;WITH VendasRegionalRank AS (
      SELECT
        v.[ID Pedido de Venda] AS orderId,
        v.[Data] AS orderDate,
        v.[ID Cliente] AS clientId,
        ROW_NUMBER() OVER (
          PARTITION BY v.[ID Pedido de Venda]
          ORDER BY CASE WHEN v.[Data] IS NULL THEN 1 ELSE 0 END, v.[Data] DESC, v.[ID Cliente] DESC
        ) AS rn
      FROM dbo.Vendas v
      WHERE v.[ID Pedido de Venda] IS NOT NULL
    )
    SELECT orderId, orderDate, clientId
    FROM VendasRegionalRank
    WHERE rn = 1;

    -- Itens de venda permanecem intactos. Nenhum agregado é feito no snapshot.
    SELECT
      vp.[ID Pedido de Venda] AS orderId,
      vp.[ID Produto] AS productId,
      ISNULL(vp.[Qtde PC], 0) AS pieces,
      ISNULL(vp.[Qtde Kg], 0) AS kg,
      ISNULL(vp.[Valor], 0) AS revenue
    FROM dbo.VendasProdutos vp
    WHERE vp.[ID Pedido de Venda] IS NOT NULL AND vp.[ID Produto] IS NOT NULL;

    -- Produto usado por Campanhas: prioriza cadastro ativo.
    ;WITH ProdutosRank AS (
      SELECT
        p.[ID Produto] AS productId,
        NULLIF(LTRIM(RTRIM(p.[Produto])), '') AS productName,
        NULLIF(LTRIM(RTRIM(p.[Unidade])), '') AS unit,
        p.[Fator Unidade] AS factor,
        p.[Master] AS master,
        NULLIF(LTRIM(RTRIM(p.[Grupo])), '') AS groupName,
        NULLIF(LTRIM(RTRIM(p.[Sub-grupo])), '') AS subgroupName,
        p.[ID Fornecedor] AS supplierId,
        NULLIF(LTRIM(RTRIM(p.[Fornecedor])), '') AS supplierName,
        NULLIF(LTRIM(RTRIM(p.[Fabricante])), '') AS manufacturer,
        NULLIF(LTRIM(RTRIM(p.[Status])), '') AS status,
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
    SELECT productId, productName, unit, factor, master, groupName, subgroupName, supplierId, supplierName, manufacturer, status
    FROM ProdutosRank
    WHERE rn = 1;

    -- Produto usado pelo Regional: replica exatamente a regra de completude do CTE antigo.
    ;WITH ProdutosRegionalRank AS (
      SELECT
        p.[ID Produto] AS productId,
        NULLIF(LTRIM(RTRIM(p.[Produto])), '') AS productName,
        NULLIF(LTRIM(RTRIM(p.[Grupo])), '') AS groupName,
        NULLIF(LTRIM(RTRIM(p.[Sub-grupo])), '') AS subgroupName,
        NULLIF(LTRIM(RTRIM(p.[Fornecedor])), '') AS supplierName,
        ROW_NUMBER() OVER (
          PARTITION BY p.[ID Produto]
          ORDER BY
            (CASE WHEN NULLIF(LTRIM(RTRIM(p.[Produto])), '') IS NULL THEN 0 ELSE 1 END +
             CASE WHEN NULLIF(LTRIM(RTRIM(p.[Grupo])), '') IS NULL THEN 0 ELSE 1 END +
             CASE WHEN NULLIF(LTRIM(RTRIM(p.[Sub-grupo])), '') IS NULL THEN 0 ELSE 1 END +
             CASE WHEN NULLIF(LTRIM(RTRIM(p.[Fornecedor])), '') IS NULL THEN 0 ELSE 1 END) DESC,
            p.[Produto], p.[Fornecedor], p.[Grupo], p.[Sub-grupo]
        ) AS rn
      FROM dbo.Produtos p
      WHERE p.[ID Produto] IS NOT NULL
    )
    SELECT productId, productName, groupName, subgroupName, supplierName
    FROM ProdutosRegionalRank
    WHERE rn = 1;

    ;WITH ClientesRank AS (
      SELECT
        c.[ID Cliente] AS clientId,
        NULLIF(LTRIM(RTRIM(c.[Cidade])), '') AS city,
        NULLIF(UPPER(LTRIM(RTRIM(c.[UF]))), '') AS uf,
        NULLIF(LTRIM(RTRIM(c.[Zona])), '') AS zone,
        NULLIF(LTRIM(RTRIM(c.[Segmento])), '') AS segment,
        ROW_NUMBER() OVER (
          PARTITION BY c.[ID Cliente]
          ORDER BY
            (CASE WHEN NULLIF(LTRIM(RTRIM(c.[Cidade])), '') IS NULL THEN 0 ELSE 1 END +
             CASE WHEN NULLIF(LTRIM(RTRIM(c.[UF])), '') IS NULL THEN 0 ELSE 1 END +
             CASE WHEN NULLIF(LTRIM(RTRIM(c.[Zona])), '') IS NULL THEN 0 ELSE 1 END +
             CASE WHEN NULLIF(LTRIM(RTRIM(c.[Segmento])), '') IS NULL THEN 0 ELSE 1 END) DESC,
            c.[Cidade], c.[UF], c.[Zona], c.[Segmento]
        ) AS rn
      FROM dbo.Clientes c
      WHERE c.[ID Cliente] IS NOT NULL
    )
    SELECT clientId, city, uf, zone, segment
    FROM ClientesRank
    WHERE rn = 1;

    ;WITH ActiveClientRank AS (
      SELECT
        c.[ID Cliente] AS clientId,
        NULLIF(LTRIM(RTRIM(c.[Cliente])), '') AS clientName,
        NULLIF(LTRIM(RTRIM(c.[Nome Fantasia])), '') AS tradeName,
        ${clientDocumentSql} AS document,
        NULLIF(LTRIM(RTRIM(c.[Vendedor])), '') AS seller,
        NULLIF(LTRIM(RTRIM(c.[Cidade])), '') AS city,
        NULLIF(UPPER(LTRIM(RTRIM(c.[UF]))), '') AS uf,
        NULLIF(LTRIM(RTRIM(c.[Status])), '') AS status,
        c.[Data Último Pedido] AS lastOrderDate,
        ROW_NUMBER() OVER (
          PARTITION BY c.[ID Cliente]
          ORDER BY c.[Data Último Pedido] DESC,
            CASE WHEN NULLIF(LTRIM(RTRIM(c.[Nome Fantasia])), '') IS NULL THEN 1 ELSE 0 END,
            CASE WHEN NULLIF(LTRIM(RTRIM(c.[Cliente])), '') IS NULL THEN 1 ELSE 0 END,
            LTRIM(RTRIM(ISNULL(c.[Vendedor], '')))
        ) AS rn
      FROM dbo.Clientes c
      WHERE c.[ID Cliente] IS NOT NULL
        AND UPPER(LTRIM(RTRIM(ISNULL(c.[Status], '')))) LIKE 'ATIV%'
    )
    SELECT clientId, clientName, tradeName, document, seller, city, uf, status, lastOrderDate
    FROM ActiveClientRank
    WHERE rn = 1;

    SELECT
      LTRIM(RTRIM(c.[Vendedor])) AS seller,
      COUNT(DISTINCT c.[ID Cliente]) AS portfolioClients,
      COUNT(DISTINCT CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(c.[Status], '')))) LIKE 'ATIV%' THEN c.[ID Cliente] END) AS activeClients,
      MAX(c.[Data Último Pedido]) AS lastOrderDate
    FROM dbo.Clientes c
    WHERE NULLIF(LTRIM(RTRIM(c.[Vendedor])), '') IS NOT NULL
    GROUP BY LTRIM(RTRIM(c.[Vendedor]))
    HAVING COUNT(DISTINCT CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(c.[Status], '')))) LIKE 'ATIV%' THEN c.[ID Cliente] END) > 0
    ORDER BY LTRIM(RTRIM(c.[Vendedor]));

    SELECT DISTINCT p.[ID Produto] AS productId, p.[ID Fornecedor] AS supplierId
    FROM dbo.Produtos p
    WHERE p.[ID Produto] IS NOT NULL AND p.[ID Fornecedor] IS NOT NULL;
  `);

  onProgress('transform', 72, 'Consulta concluída. Organizando os dados comerciais…');

  const [
    ordersRaw = [], regionalOrdersRaw = [], linesRaw = [], productsRaw = [], regionalProductsRaw = [],
    regionalClientsRaw = [], activeClientsRaw = [], activeSellersRaw = [], productSuppliersRaw = [],
  ] = result.recordsets || [];

  const snapshot = {
    orders: ordersRaw.map((row) => ({
      o: String(row.orderId),
      d: row.orderDate ? new Date(row.orderDate).toISOString() : null,
      c: Number(row.clientId) || null,
      s: text(row.seller),
      t: text(row.saleType),
      f: text(row.saleForm),
      v: Number(row.wholeOrderValue) || 0,
    })),
    regionalOrders: regionalOrdersRaw.map((row) => ({
      o: String(row.orderId),
      d: row.orderDate ? new Date(row.orderDate).toISOString() : null,
      c: Number(row.clientId) || null,
    })),
    lines: linesRaw.map((row) => ({
      o: String(row.orderId),
      p: Number(row.productId),
      pc: Number(row.pieces) || 0,
      kg: Number(row.kg) || 0,
      v: Number(row.revenue) || 0,
    })).filter((row) => row.o && Number.isFinite(row.p)),
    products: productsRaw.map((row) => ({
      p: Number(row.productId),
      n: text(row.productName),
      u: text(row.unit),
      f: Number(row.factor) || 0,
      m: Number(row.master) || 0,
      g: text(row.groupName),
      sg: text(row.subgroupName),
      si: Number(row.supplierId) || null,
      sn: text(row.supplierName),
      ma: text(row.manufacturer),
      st: text(row.status),
    })).filter((row) => Number.isFinite(row.p)),
    regionalProducts: regionalProductsRaw.map((row) => ({
      p: Number(row.productId),
      n: text(row.productName),
      g: text(row.groupName),
      sg: text(row.subgroupName),
      sn: text(row.supplierName),
    })).filter((row) => Number.isFinite(row.p)),
    regionalClients: regionalClientsRaw.map((row) => ({
      c: Number(row.clientId),
      ci: text(row.city),
      uf: upper(row.uf),
      z: text(row.zone),
      se: text(row.segment),
    })).filter((row) => Number.isFinite(row.c)),
    activeClients: activeClientsRaw.map((row) => ({
      c: Number(row.clientId),
      n: text(row.clientName),
      nf: text(row.tradeName),
      doc: text(row.document),
      s: text(row.seller),
      ci: text(row.city),
      uf: upper(row.uf),
      st: text(row.status),
      lp: row.lastOrderDate ? new Date(row.lastOrderDate).toISOString() : null,
    })).filter((row) => Number.isFinite(row.c)),
    activeSellers: activeSellersRaw.map((row) => ({
      s: text(row.seller),
      a: Number(row.activeClients) || 0,
      t: Number(row.portfolioClients) || 0,
      lp: row.lastOrderDate ? new Date(row.lastOrderDate).toISOString() : null,
    })).filter((row) => row.s),
    productSuppliers: productSuppliersRaw.map((row) => ({
      p: Number(row.productId),
      s: Number(row.supplierId),
    })).filter((row) => Number.isFinite(row.p) && Number.isFinite(row.s)),
  };

  onProgress('transform', 82, 'Dados organizados. Preparando o snapshot local…');
  return snapshot;
}

async function buildSnapshotFile(day, onProgress = () => {}) {
  try {
    const snapshot = await querySnapshotFromSql(onProgress);
    await resetPool();
    const updatedAt = new Date().toISOString();
    onProgress('compress', 88, 'Compactando o snapshot comercial…');
    await writeSnapshot(snapshot, day, updatedAt);
    const counts = computeCounts(snapshot);
    onProgress('done', 100, `Snapshot ${day} salvo com ${counts.pedidos} pedidos e ${counts.itensVenda} itens.`);
    return { day, updatedAt, counts };
  } catch (error) {
    try { await resetPool(); } catch {}
    throw error;
  }
}

export async function runSnapshotWorkerJob({ day = snapshotDay(), onProgress = () => {} } = {}) {
  return buildSnapshotFile(day, onProgress);
}

function runSnapshotBuildWorker(day) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./daily-commercial-snapshot-worker.js', import.meta.url), {
      workerData: { day },
    });

    let settled = false;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      fn(value);
    };

    worker.on('message', (message = {}) => {
      if (message.type === 'progress') {
        setSnapshotProgress(message.phase, message.progress, message.message);
        return;
      }
      if (message.type === 'done') {
        finish(resolve, message.result || {});
        return;
      }
      if (message.type === 'error') {
        const error = new Error(message.error?.message || 'Falha na sincronização diária.');
        error.code = message.error?.code || 'PMG_DAILY_SNAPSHOT_WORKER_ERROR';
        error.stack = message.error?.stack || error.stack;
        finish(reject, error);
      }
    });

    worker.on('error', (error) => finish(reject, error));
    worker.on('exit', (code) => {
      if (!settled) {
        const error = new Error(`O processo de sincronização diária encerrou sem concluir (código ${code}).`);
        error.code = 'PMG_DAILY_SNAPSHOT_WORKER_EXIT';
        finish(reject, error);
      }
    });
  });
}

async function synchronize() {
  const today = snapshotDay();
  state.status = 'loading';
  state.startedAt = new Date().toISOString();
  state.lastAttemptDay = today;
  state.lastAttemptAt = state.startedAt;
  state.deferredUntil = null;
  state.error = null;
  setSnapshotProgress('start', 2, 'Iniciando a sincronização comercial diária…');

  try {
    // A consulta pesada, transformação e compactação rodam em uma Worker Thread.
    // Assim o Express continua respondendo /api/status enquanto milhões de linhas
    // do Azure são processadas. O worker grava o arquivo por troca atômica.
    const result = isMainThread
      ? await runSnapshotBuildWorker(today)
      : await buildSnapshotFile(today, (phase, progress, message) => setSnapshotProgress(phase, progress, message));

    setSnapshotProgress('load', 96, 'Snapshot salvo. Carregando os índices locais…');
    const snapshot = await loadDiskSnapshot({ forceReload: true });
    if (!snapshot || state.day !== today) {
      const error = new Error('O snapshot foi gerado, mas não pôde ser carregado pelo servidor local.');
      error.code = 'PMG_DAILY_SNAPSHOT_RELOAD_FAILED';
      throw error;
    }

    state.updatedAt = result?.updatedAt || state.updatedAt;
    state.source = 'sql-worker';
    state.stale = false;
    state.status = 'ready';
    state.counts = result?.counts || computeCounts(snapshot);
    setSnapshotProgress('ready', 100, 'Snapshot comercial do dia pronto.');
    console.log(`[snapshot-diario] ${today} pronto: ${state.counts.pedidos} pedidos, ${state.counts.itensVenda} itens.`);
    return snapshot;
  } catch (error) {
    state.error = { message: error?.message || String(error), code: error?.code || null, at: new Date().toISOString() };
    if (state.snapshot) {
      state.status = 'ready';
      state.stale = true;
      setSnapshotProgress('ready', 100, 'Usando o último snapshot válido; a atualização de hoje falhou.');
      console.warn('[snapshot-diario] atualização falhou; mantendo último snapshot válido:', error?.message || error);
      return state.snapshot;
    }
    state.status = 'error';
    setSnapshotProgress('error', 0, state.error.message);
    throw error;
  }
}

export async function ensureDailySnapshot({ force = false } = {}) {
  await loadDiskSnapshot();
  const today = snapshotDay();
  if (!force && state.snapshot && state.day === today) return state.snapshot;
  if (syncPromise) return syncPromise;

  if (!force && state.snapshot && beforeConfiguredWindow()) {
    state.stale = true;
    state.status = 'ready';
    state.deferredUntil = `${today} ${SNAPSHOT_NOT_BEFORE} (${SNAPSHOT_TIMEZONE})`;
    return state.snapshot;
  }

  // Uma falha não vira uma tempestade de reconexões ao Azure. Depois da
  // primeira tentativa do dia, somente o botão/endpoint de força tenta de novo.
  if (!force && state.lastAttemptDay === today) {
    if (state.snapshot) return state.snapshot;
    const error = new Error(state.error?.message || 'A sincronização comercial de hoje já falhou. Use a sincronização manual para tentar novamente.');
    error.code = state.error?.code || 'PMG_DAILY_SNAPSHOT_ALREADY_ATTEMPTED';
    throw error;
  }

  syncPromise = synchronize().finally(() => { syncPromise = null; });
  return syncPromise;
}

export function startDailySnapshot({ force = false } = {}) {
  // Dispara a preparação sem prender a requisição HTTP que iniciou o processo.
  // Erros ficam refletidos em getDailySnapshotStatus() e são tratados pelo fluxo
  // normal de fallback para o último snapshot válido.
  if (!syncPromise && state.status === 'idle') {
    state.status = 'loading';
    setSnapshotProgress('start', 1, 'Sincronização diária enfileirada…');
  }
  const pending = ensureDailySnapshot({ force });
  pending.catch((error) => {
    console.warn('[snapshot-diario] sincronização em segundo plano:', error?.message || error);
  });
  return publicStatus();
}

export async function getDailySnapshot() {
  return ensureDailySnapshot();
}

export async function forceDailySnapshot() {
  return ensureDailySnapshot({ force: true });
}

export function parseSeller(value) {
  const raw = text(value);
  const match = /-\s*(\d+)\s*$/.exec(raw);
  const code = match ? Number(match[1]) : null;
  let base = code != null ? raw.slice(0, match.index) : raw;
  base = base.replace(/\(TLMK\)/ig, '').trim();
  const nameKey = base
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '')
    .toLocaleUpperCase('pt-BR');
  return { raw, code, nameKey };
}

export function resolveActiveSeller(snapshot, sellerValue) {
  const parsed = parseSeller(sellerValue);
  if (parsed.code != null && snapshot?._idx?.activeSellerByCode.has(parsed.code)) {
    return snapshot._idx.activeSellerByCode.get(parsed.code);
  }
  if (parsed.nameKey && snapshot?._idx?.activeSellerByNameKey.has(parsed.nameKey)) {
    return snapshot._idx.activeSellerByNameKey.get(parsed.nameKey);
  }
  return null;
}

export function productMatchesSuppliers(snapshot, productId, supplierIds) {
  if (!supplierIds?.size) return false;
  const ids = snapshot?._idx?.supplierIdsByProduct.get(Number(productId));
  if (!ids) return false;
  for (const id of ids) if (supplierIds.has(Number(id))) return true;
  return false;
}

export function orderDateMs(order) {
  return order?.d ? Date.parse(order.d) : NaN;
}

export function dateMs(value) {
  if (value instanceof Date) return Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
  const raw = text(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return NaN;
  return Date.parse(`${raw}T00:00:00.000Z`);
}

export function regionalFact(snapshot, line) {
  const order = snapshot._idx.regionalOrdersById.get(String(line.o));
  if (!order) return null;
  const client = snapshot._idx.regionalClientsById.get(Number(order.c));
  const product = snapshot._idx.regionalProductsById.get(Number(line.p));
  if (!client || !product) return null;
  return { line, order, client, product };
}

export function matchesRegionalFilters(fact, query = {}, { ignore = [] } = {}) {
  if (!fact) return false;
  const skip = new Set(ignore);
  const { line, order, client, product } = fact;

  if (query.p_cidade && !skip.has('p_cidade') && `${client.ci} / ${client.uf}` !== String(query.p_cidade)) return false;
  if (query.p_regiao && !skip.has('p_regiao') && client.z !== String(query.p_regiao)) return false;
  if (query.p_uf && !skip.has('p_uf') && upper(client.uf) !== upper(query.p_uf)) return false;
  if (query.p_segmento && !skip.has('p_segmento') && client.se !== String(query.p_segmento)) return false;
  if (query.p_grupo && !skip.has('p_grupo') && product.g !== String(query.p_grupo)) return false;
  if (query.p_subgrupo && !skip.has('p_subgrupo') && product.sg !== String(query.p_subgrupo)) return false;
  if (query.p_fornecedor && !skip.has('p_fornecedor') && product.sn !== String(query.p_fornecedor)) return false;

  if (query.p_produto && !skip.has('p_produto')) {
    const raw = String(query.p_produto).trim();
    if (/^\d+$/.test(raw) && Number(line.p) !== Number(raw)) return false;
  }

  const d = orderDateMs(order);
  if (query.p_de && !skip.has('p_de')) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(query.p_de));
    if (match) {
      const start = Date.UTC(Number(match[1]), Number(match[2]) - 1, 1);
      if (!Number.isFinite(d) || d < start) return false;
    }
  }
  if (query.p_ate && !skip.has('p_ate')) {
    const match = /^(\d{4})-(\d{2})$/.exec(String(query.p_ate));
    if (match) {
      const end = Date.UTC(Number(match[1]), Number(match[2]), 1);
      if (!Number.isFinite(d) || d >= end) return false;
    }
  }
  return true;
}

export async function forEachRegionalFact(query, callback, options = {}) {
  const snapshot = await ensureDailySnapshot();
  for (const line of snapshot.lines) {
    const fact = regionalFact(snapshot, line);
    if (!matchesRegionalFilters(fact, query, options)) continue;
    callback(fact, snapshot);
  }
  return snapshot;
}

export { SNAPSHOT_PATH, SNAPSHOT_TIMEZONE, SNAPSHOT_NOT_BEFORE, SNAPSHOT_SQL_TIMEOUT_MS };
