import {
  ensureDailySnapshot,
  resolveActiveSeller,
  productMatchesSuppliers,
  parseSeller,
  dateMs,
  orderDateMs,
} from '../lib/daily-commercial-snapshot.js';

const text = (value) => String(value ?? '').trim();
const activeStatus = (value) => {
  const raw = text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('pt-BR');
  return !raw || raw.startsWith('ATIV');
};

function periodOf(order, currentStartMs, currentEndMs, previousStartMs, previousEndMs) {
  const ms = orderDateMs(order);
  if (!Number.isFinite(ms)) return null;
  if (ms >= currentStartMs && ms < currentEndMs) return 'current';
  if (ms >= previousStartMs && ms < previousEndMs) return 'previous';
  return null;
}

function productScope(snapshot, productId, productIdsSet, supplierIdsSet) {
  if (productIdsSet.size) return productIdsSet.has(Number(productId));
  return productMatchesSuppliers(snapshot, Number(productId), supplierIdsSet);
}

function setSize(rows, selector) {
  const set = new Set();
  for (const row of rows) {
    const value = selector(row);
    if (value !== null && value !== undefined && value !== '') set.add(String(value));
  }
  return set.size;
}

function summarizeRows(rows) {
  return {
    revenue: rows.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0),
    kg: rows.reduce((sum, row) => sum + (Number(row.kg) || 0), 0),
    pieces: rows.reduce((sum, row) => sum + (Number(row.pieces) || 0), 0),
    customers: setSize(rows, (row) => row.clientId),
    orders: setSize(rows, (row) => row.orderId),
    products: setSize(rows, (row) => row.productId),
    sellers: setSize(rows, (row) => row.seller),
  };
}

export async function campaignContextFromSnapshot() {
  const snapshot = await ensureDailySnapshot();
  const products = (snapshot.products || [])
    .filter((p) => activeStatus(p.st))
    .map((p) => ({
      id: Number(p.p),
      name: text(p.n),
      unit: text(p.u),
      factor: Number(p.f) || 0,
      master: Number(p.m) || 0,
      groupName: text(p.g),
      subgroupName: text(p.sg),
      supplierId: Number(p.si) || null,
      supplierName: text(p.sn),
      manufacturer: text(p.ma),
      status: text(p.st),
    }));

  const representatives = (snapshot.activeSellers || []).map((row) => ({
    name: text(row.s),
    portfolioClients: Number(row.t) || 0,
    activeClients: Number(row.a) || 0,
    lastOrderDate: row.lp || null,
  }));

  return { snapshot, products, representatives };
}

export async function performanceRecordsets({
  currentStart,
  currentEnd,
  previousStart,
  previousEnd,
  previousEquivalentEnd,
  productIds = [],
  supplierIds = [],
  sellers = [],
  activationProductIds = [],
  activationTriggerProductIds = [],
  activationFirstPurchaseMode = 'campaign_trigger',
}) {
  const snapshot = await ensureDailySnapshot();
  const productIdsSet = new Set(productIds.map(Number));
  const supplierIdsSet = new Set(supplierIds.map(Number));
  const selectedSellers = new Set(sellers.map(text));
  const activationIds = new Set(activationProductIds.map(Number));
  const triggerIds = new Set(activationTriggerProductIds.map(Number));
  const currentStartMs = dateMs(currentStart);
  const currentEndMs = dateMs(currentEnd);
  const previousStartMs = dateMs(previousStart);
  const previousEndMs = dateMs(previousEnd);
  const previousEquivalentEndMs = dateMs(previousEquivalentEnd || previousEnd);

  const scopeBase = [];
  const campaignBase = [];

  for (const line of snapshot.lines || []) {
    if (!productScope(snapshot, line.p, productIdsSet, supplierIdsSet)) continue;
    const order = snapshot._idx.ordersById.get(String(line.o));
    if (!order || !text(order.s)) continue;
    const period = periodOf(order, currentStartMs, currentEndMs, previousStartMs, previousEndMs);
    if (!period) continue;

    const rawSeller = text(order.s);
    const scopeRow = {
      period,
      seller: rawSeller,
      clientId: Number(order.c),
      orderId: String(line.o),
      orderDate: order.d || null,
      productId: Number(line.p),
      pieces: Number(line.pc) || 0,
      kg: Number(line.kg) || 0,
      revenue: Number(line.v) || 0,
    };
    scopeBase.push(scopeRow);

    const matchedSeller = resolveActiveSeller(snapshot, rawSeller);
    if (!matchedSeller) continue;
    if (selectedSellers.size && !selectedSellers.has(matchedSeller)) continue;
    campaignBase.push({ ...scopeRow, seller: matchedSeller, sellerAlias: rawSeller });
  }

  const lineGroups = new Map();
  for (const row of campaignBase) {
    const key = `${row.period}\u0000${row.seller}\u0000${row.clientId}\u0000${row.productId}`;
    if (!lineGroups.has(key)) lineGroups.set(key, { period: row.period, seller: row.seller, clientId: row.clientId, productId: row.productId, orderIds: new Set(), pieces: 0, kg: 0, revenue: 0 });
    const g = lineGroups.get(key);
    g.orderIds.add(row.orderId);
    g.pieces += row.pieces;
    g.kg += row.kg;
    g.revenue += row.revenue;
  }
  const lines = [...lineGroups.values()].map((g) => ({
    period: g.period,
    seller: g.seller,
    clientId: g.clientId,
    productId: g.productId,
    orders: g.orderIds.size,
    pieces: g.pieces,
    kg: g.kg,
    revenue: g.revenue,
  }));

  const orderSellerGroups = new Map();
  for (const row of campaignBase) {
    const key = `${row.period}\u0000${row.seller}`;
    if (!orderSellerGroups.has(key)) orderSellerGroups.set(key, { period: row.period, seller: row.seller, orders: new Set() });
    orderSellerGroups.get(key).orders.add(row.orderId);
  }
  const ordersBySeller = [...orderSellerGroups.values()].map((g) => ({ period: g.period, seller: g.seller, orders: g.orders.size }));

  const collectiveSource = selectedSellers.size ? campaignBase : scopeBase;
  const collectiveSummary = ['current', 'previous'].map((period) => {
    const selected = collectiveSource.filter((row) => row.period === period);
    return selected.length ? { period, ...summarizeRows(selected) } : null;
  }).filter(Boolean);

  const equivalentRows = collectiveSource.filter((row) => row.period === 'previous' && orderDateMs({ d: row.orderDate }) < previousEquivalentEndMs);
  const equivalent = summarizeRows(equivalentRows);

  const recordsets = [
    lines,
    ordersBySeller,
    collectiveSummary,
    [{
      revenue: equivalent.revenue,
      kg: equivalent.kg,
      pieces: equivalent.pieces,
      customers: equivalent.customers,
      orders: equivalent.orders,
      products: equivalent.products,
    }],
  ];

  if (activationIds.size) {
    const orderLineGroups = new Map();
    for (const row of campaignBase) {
      if (!activationIds.has(Number(row.productId))) continue;
      const key = `${row.period}\u0000${row.seller}\u0000${row.clientId}\u0000${row.orderId}\u0000${row.productId}`;
      if (!orderLineGroups.has(key)) orderLineGroups.set(key, { ...row });
      else {
        const g = orderLineGroups.get(key);
        if (new Date(row.orderDate || 0) < new Date(g.orderDate || 0)) g.orderDate = row.orderDate;
        g.pieces += row.pieces;
        g.kg += row.kg;
        g.revenue += row.revenue;
      }
    }
    recordsets.push([...orderLineGroups.values()].map(({ sellerAlias, ...row }) => row));
  }

  if (activationFirstPurchaseMode === 'historical_trigger' && triggerIds.size) {
    const clients = new Set();
    for (const line of snapshot.lines || []) {
      if (!triggerIds.has(Number(line.p))) continue;
      const order = snapshot._idx.ordersById.get(String(line.o));
      if (!order || !Number.isFinite(Number(order.c))) continue;
      if (orderDateMs(order) < currentStartMs) clients.add(Number(order.c));
    }
    recordsets.push([...clients].map((clientId) => ({ clientId })));
  }

  return { recordsets, snapshot };
}

export async function consistencyRecordsets({ currentStart, currentEnd, previousStart, previousEnd, supplierIds = [], productIds = [], sellers = [] }) {
  const snapshot = await ensureDailySnapshot();
  const supplierIdsSet = new Set(supplierIds.map(Number));
  const productIdsSet = new Set(productIds.map(Number));
  const sellersSet = new Set(sellers.map(text));
  const c0 = dateMs(currentStart), c1 = dateMs(currentEnd), p0 = dateMs(previousStart), p1 = dateMs(previousEnd);
  const activeExact = snapshot._idx.activeSellerExact;
  const base = [];

  for (const line of snapshot.lines || []) {
    if (!productMatchesSuppliers(snapshot, line.p, supplierIdsSet)) continue;
    const order = snapshot._idx.ordersById.get(String(line.o));
    const product = snapshot._idx.productsById.get(Number(line.p));
    if (!order || !product) continue;
    const period = periodOf(order, c0, c1, p0, p1);
    if (!period) continue;
    base.push({
      period,
      seller: text(order.s),
      activeSeller: activeExact.has(text(order.s)),
      clientId: Number(order.c),
      orderId: String(line.o),
      saleType: text(order.t) || '(vazio)',
      saleForm: text(order.f) || '(vazio)',
      productId: Number(line.p),
      supplierId: Number(product.si) || null,
      productStatus: text(product.st),
      kg: Number(line.kg) || 0,
      pieces: Number(line.pc) || 0,
      revenue: Number(line.v) || 0,
    });
  }

  const modes = [
    ['FORNECEDOR_BRUTO', (r) => true],
    ['FORNECEDOR_VENDEDORES_ATIVOS', (r) => r.activeSeller],
    ['PRODUTOS_ATIVOS_VENDEDORES_ATIVOS', (r) => r.activeSeller && activeStatus(r.productStatus)],
    ['ESCOPO_EFETIVO_CAMPANHA', (r) => r.activeSeller && (!productIdsSet.size || productIdsSet.has(r.productId)) && (!sellersSet.size || sellersSet.has(r.seller))],
  ];
  const totals = [];
  for (const [mode, predicate] of modes) {
    for (const period of ['current', 'previous']) {
      const rows = base.filter((r) => r.period === period && predicate(r));
      if (!rows.length) continue;
      totals.push({ mode, period, ...summarizeRows(rows) });
    }
  }

  const catalog = [];
  for (const supplierId of supplierIdsSet) {
    const productIdsForSupplier = new Set();
    for (const pair of snapshot.productSuppliers || []) if (Number(pair.s) === supplierId) productIdsForSupplier.add(Number(pair.p));
    const products = [...productIdsForSupplier].map((id) => snapshot._idx.productsById.get(id)).filter(Boolean);
    catalog.push({
      supplierId,
      supplierName: products.map((p) => text(p.sn)).filter(Boolean).sort((a, b) => b.localeCompare(a, 'pt-BR'))[0] || '',
      totalProducts: productIdsForSupplier.size,
      activeProducts: products.filter((p) => activeStatus(p.st)).length,
      inactiveProducts: products.filter((p) => !activeStatus(p.st)).length,
    });
  }

  const statusMap = new Map();
  for (const row of base.filter((r) => r.activeSeller)) {
    const status = text(row.productStatus) || '(vazio)';
    const key = `${row.period}\u0000${status}`;
    if (!statusMap.has(key)) statusMap.set(key, { period: row.period, productStatus: status, productIds: new Set(), kg: 0, revenue: 0 });
    const g = statusMap.get(key);
    g.productIds.add(row.productId); g.kg += row.kg; g.revenue += row.revenue;
  }
  const statusBreakdown = [...statusMap.values()].map((g) => ({ period: g.period, productStatus: g.productStatus, products: g.productIds.size, kg: g.kg, revenue: g.revenue }))
    .sort((a, b) => a.period.localeCompare(b.period) || b.kg - a.kg);

  const saleMap = new Map();
  for (const row of base.filter((r) => r.activeSeller)) {
    const key = `${row.period}\u0000${row.saleType}\u0000${row.saleForm}`;
    if (!saleMap.has(key)) saleMap.set(key, { period: row.period, saleType: row.saleType, saleForm: row.saleForm, kg: 0, revenue: 0, orders: new Set() });
    const g = saleMap.get(key); g.kg += row.kg; g.revenue += row.revenue; g.orders.add(row.orderId);
  }
  const saleBreakdown = [...saleMap.values()].map((g) => ({ period: g.period, saleType: g.saleType, saleForm: g.saleForm, kg: g.kg, revenue: g.revenue, orders: g.orders.size }))
    .sort((a, b) => a.period.localeCompare(b.period) || b.kg - a.kg).slice(0, 60);

  return { recordsets: [totals, catalog, statusBreakdown, saleBreakdown], snapshot };
}

export async function firstPurchaseBenefitRecordsets({ currentStart, currentEnd, sellers = [], triggerProductIds = [], benefitProductIds = [], historicalTrigger = false }) {
  const snapshot = await ensureDailySnapshot();
  const sellersSet = new Set(sellers.map(text));
  const allIds = new Set([...triggerProductIds, ...benefitProductIds].map(Number));
  const triggerIds = new Set(triggerProductIds.map(Number));
  const c0 = dateMs(currentStart), c1 = dateMs(currentEnd);

  const clients = (snapshot.activeClients || [])
    .filter((c) => !sellersSet.size || sellersSet.has(text(c.s)))
    .map((c) => ({ clientId: Number(c.c), clientName: text(c.n), tradeName: text(c.nf), document: text(c.doc), seller: text(c.s), city: text(c.ci), uf: text(c.uf), status: text(c.st) }));

  const lines = [];
  const prior = new Map();
  for (const line of snapshot.lines || []) {
    const productId = Number(line.p);
    if (!allIds.has(productId) && !(historicalTrigger && triggerIds.has(productId))) continue;
    const order = snapshot._idx.ordersById.get(String(line.o));
    if (!order || !Number.isFinite(Number(order.c))) continue;
    const ms = orderDateMs(order);
    if (historicalTrigger && triggerIds.has(productId) && Number.isFinite(ms) && ms < c0) {
      const current = prior.get(Number(order.c));
      if (!current || ms < current.ms) prior.set(Number(order.c), { ms, date: order.d || null });
    }
    if (!allIds.has(productId) || !Number.isFinite(ms) || ms < c0 || ms >= c1) continue;
    const product = snapshot._idx.productsById.get(productId);
    if (!product) continue;
    lines.push({
      clientId: Number(order.c), orderId: String(line.o), orderDate: order.d || null, seller: text(order.s),
      productId, productName: text(product.n), pieces: Number(line.pc) || 0, kg: Number(line.kg) || 0, revenue: Number(line.v) || 0,
    });
  }

  const groupedBenefitLines = new Map();
  for (const row of lines) {
    const key = `${row.clientId}\u0000${row.orderId}\u0000${row.productId}`;
    if (!groupedBenefitLines.has(key)) groupedBenefitLines.set(key, { ...row });
    else {
      const current = groupedBenefitLines.get(key);
      current.pieces += row.pieces;
      current.kg += row.kg;
      current.revenue += row.revenue;
    }
  }
  lines.length = 0;
  lines.push(...groupedBenefitLines.values());
  lines.sort((a, b) => a.clientId - b.clientId || new Date(a.orderDate || 0) - new Date(b.orderDate || 0) || String(a.orderId).localeCompare(String(b.orderId), 'pt-BR', { numeric: true }) || a.productId - b.productId);
  const priorRows = [...prior.entries()].map(([clientId, value]) => ({ clientId, firstPriorDate: value.date }));
  const products = [...allIds].map((id) => ({ productId: id, productName: text(snapshot._idx.productsById.get(id)?.n) })).sort((a, b) => a.productId - b.productId);
  return { recordsets: [clients, lines, priorRows, products], snapshot };
}

export async function sellerAuditRecordsets({ seller, currentStart, currentEnd, previousStart, previousEnd, productIds = [], supplierIds = [] }) {
  const snapshot = await ensureDailySnapshot();
  const target = parseSeller(seller);
  const productIdsSet = new Set(productIds.map(Number));
  const supplierIdsSet = new Set(supplierIds.map(Number));
  const c0 = dateMs(currentStart), c1 = dateMs(currentEnd), p0 = dateMs(previousStart), p1 = dateMs(previousEnd);

  function matchesSeller(raw) {
    const parsed = parseSeller(raw);
    if (target.code != null && parsed.code === target.code) return true;
    return Boolean(target.nameKey && parsed.nameKey && target.nameKey === parsed.nameKey);
  }

  const rows = [];
  const parityRows = [];
  for (const line of snapshot.lines || []) {
    const order = snapshot._idx.ordersById.get(String(line.o));
    if (!order || !matchesSeller(order.s)) continue;
    const period = periodOf(order, c0, c1, p0, p1);
    if (!period) continue;
    const inScope = productScope(snapshot, line.p, productIdsSet, supplierIdsSet);
    parityRows.push({
      period, orderId: String(line.o), clientId: Number(order.c), pieces: Number(line.pc) || 0, kg: Number(line.kg) || 0, revenue: Number(line.v) || 0, inScope,
    });
    if (!inScope) continue;
    const product = snapshot._idx.productsById.get(Number(line.p));
    if (!product) continue;
    rows.push({
      period,
      seller: text(order.s),
      orderId: String(line.o),
      orderDate: order.d || null,
      clientId: Number(order.c),
      saleType: text(order.t) || null,
      saleForm: text(order.f) || null,
      wholeOrderValue: Number(order.v) || 0,
      productId: Number(line.p),
      productName: text(product.n),
      supplierId: Number(product.si) || null,
      supplierName: text(product.sn),
      pieces: Number(line.pc) || 0,
      kg: Number(line.kg) || 0,
      revenue: Number(line.v) || 0,
    });
  }

  const groupedAuditRows = new Map();
  for (const row of rows) {
    const key = `${row.period}\u0000${row.seller}\u0000${row.orderId}\u0000${row.clientId}\u0000${row.saleType || ''}\u0000${row.saleForm || ''}\u0000${row.wholeOrderValue}\u0000${row.productId}`;
    if (!groupedAuditRows.has(key)) groupedAuditRows.set(key, { ...row });
    else {
      const current = groupedAuditRows.get(key);
      current.pieces += row.pieces;
      current.kg += row.kg;
      current.revenue += row.revenue;
    }
  }
  rows.length = 0;
  rows.push(...groupedAuditRows.values());
  rows.sort((a, b) => b.period.localeCompare(a.period) || new Date(b.orderDate || 0) - new Date(a.orderDate || 0) || String(b.orderId).localeCompare(String(a.orderId), 'pt-BR', { numeric: true }) || a.productId - b.productId);
  const topRows = rows.slice(0, 1500);

  const parity = [];
  for (const period of ['current', 'previous']) {
    const selected = parityRows.filter((r) => r.period === period);
    if (!selected.length) continue;
    const campaign = selected.filter((r) => r.inScope);
    parity.push({
      period,
      sellerRevenueAllProducts: selected.reduce((s, r) => s + r.revenue, 0),
      sellerKgAllProducts: selected.reduce((s, r) => s + r.kg, 0),
      sellerPiecesAllProducts: selected.reduce((s, r) => s + r.pieces, 0),
      sellerOrdersAllProducts: setSize(selected, (r) => r.orderId),
      sellerCustomersAllProducts: setSize(selected, (r) => r.clientId),
      campaignRevenue: campaign.reduce((s, r) => s + r.revenue, 0),
      campaignKg: campaign.reduce((s, r) => s + r.kg, 0),
      campaignPieces: campaign.reduce((s, r) => s + r.pieces, 0),
      campaignOrders: setSize(campaign, (r) => r.orderId),
      campaignCustomers: setSize(campaign, (r) => r.clientId),
    });
  }
  return { recordsets: [topRows, parity], snapshot };
}
