import { forEachRegionalFact, orderDateMs, getDailySnapshot } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';
import { cacheKeyFor, withResponseCache } from '../src/lib/response-cache.js';

const CACHE_MS = 5 * 60_000;

// Antes deste ajuste, este endpoint consultava o SQL Server ao vivo
// (dbo.Vendas/dbo.Clientes/dbo.VendasProdutos/dbo.Produtos) com uma consulta
// pesada o bastante pra estourar o timeout de 120s do pool em produção. O
// índice que resolveria isso (dbo.Vendas.Data) exige permissão de DDL que o
// login da aplicação não tem, de propósito (só leitura) — e ninguém do time
// tinha acesso ao Azure pra pedir pra outra pessoa criar o índice. A saída:
// esse endpoint é o único do Planejamento Estratégico/Dashboard Regional que
// não usava o snapshot comercial diário já compartilhado pelos outros
// (kpis.js, agregado-cidades.js etc.) — ele já tem tudo que precisamos
// (cliente, pedido, data, valor) e já é rápido e cacheado.

function monthIndex(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return year * 12 + (month - 1);
}

function monthBoundaryMs(index) {
  return Date.UTC(Math.floor(index / 12), index % 12, 1);
}

function toMonthKey(index) {
  const year = Math.floor(index / 12);
  const month = (index % 12) + 1;
  return `${year}-${String(month).padStart(2, '0')}`;
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Método não permitido.' });

  const periodDe = String(req.query.p_de || '').trim();
  const periodAte = String(req.query.p_ate || periodDe || '').trim();
  const customerId = String(req.query.p_cliente || '').trim() || null;
  const city = String(req.query.p_cidade || '').trim() || null;
  const uf = String(req.query.p_uf || '').trim().toUpperCase() || null;
  const group = String(req.query.p_grupo || '').trim() || null;
  const supplier = String(req.query.p_fornecedor || '').trim() || null;

  const startIndex = monthIndex(periodDe);
  const endIndex = monthIndex(periodAte);
  if (startIndex == null || endIndex == null || endIndex < startIndex) {
    return res.status(400).json({ message: 'Informe p_de (e opcionalmente p_ate) no formato YYYY-MM.' });
  }
  const span = endIndex - startIndex + 1;
  const previousStartIndex = startIndex - span;
  const currentStartMs = monthBoundaryMs(startIndex);
  const currentEndMs = monthBoundaryMs(endIndex + 1);
  const previousStartMs = monthBoundaryMs(previousStartIndex);
  const period = periodDe === periodAte ? periodDe : `${periodDe}..${periodAte}`;

  try {
    const cacheKey = cacheKeyFor('estrategia-clientes', req.query);
    const payload = await withResponseCache(cacheKey, CACHE_MS, async () => {
      // Varre o intervalo inteiro (anterior + atual) de uma vez só; o
      // bucket (atual/anterior) de cada linha é decidido aqui, não pelo
      // filtro de data do forEachRegionalFact.
      const scanQuery = { ...req.query, p_de: toMonthKey(previousStartIndex), p_ate: toMonthKey(endIndex) };
      const perClient = new Map();

      await forEachRegionalFact(scanQuery, ({ line, order, client }) => {
        if (customerId && String(order.c) !== customerId) return;
        const ms = orderDateMs(order);
        if (!Number.isFinite(ms)) return;
        let bucket = null;
        if (ms >= currentStartMs && ms < currentEndMs) bucket = 'current';
        else if (ms >= previousStartMs && ms < currentStartMs) bucket = 'previous';
        if (!bucket) return;

        const id = order.c;
        let entry = perClient.get(id);
        if (!entry) {
          entry = { client, current: { revenue: 0, kg: 0, orders: new Set() }, previous: { revenue: 0, kg: 0, orders: new Set() } };
          perClient.set(id, entry);
        }
        const target = entry[bucket];
        target.revenue += Number(line.v) || 0;
        target.kg += Number(line.kg) || 0;
        target.orders.add(order.o);
      });

      const snapshot = await getDailySnapshot();
      const activeClientsById = snapshot._idx.activeClientsById;

      let currentCustomers = 0, previousCustomers = 0;
      let currentRevenueTotal = 0, previousRevenueTotal = 0;
      let currentKgTotal = 0, previousKgTotal = 0;
      let currentOrdersTotal = 0, previousOrdersTotal = 0;
      const signals = [];

      for (const [id, entry] of perClient) {
        const currentOrders = entry.current.orders.size;
        const previousOrders = entry.previous.orders.size;
        const currentRevenue = entry.current.revenue;
        const previousRevenue = entry.previous.revenue;

        if (currentOrders > 0) {
          currentCustomers += 1;
          currentRevenueTotal += currentRevenue;
          currentKgTotal += entry.current.kg;
          currentOrdersTotal += currentOrders;
        }
        if (previousOrders > 0) {
          previousCustomers += 1;
          previousRevenueTotal += previousRevenue;
          previousKgTotal += entry.previous.kg;
          previousOrdersTotal += previousOrders;
        }

        const reactivation = previousRevenue >= 5000 && currentRevenue === 0;
        const decline = !reactivation && previousRevenue >= 5000 && currentRevenue > 0 && currentRevenue < previousRevenue * 0.60;
        if (!reactivation && !decline) continue;

        const active = activeClientsById.get(id);
        signals.push({
          customer_id: String(id),
          customer_name: active?.nf || active?.n || `Cliente ${id}`,
          city: active?.ci || entry.client?.ci || null,
          uf: active?.uf || entry.client?.uf || null,
          seller: active?.s || null,
          current_revenue: currentRevenue,
          previous_revenue: previousRevenue,
          current_orders: currentOrders,
          previous_orders: previousOrders,
          signal_type: reactivation ? 'reativacao' : 'queda',
        });
      }

      signals.sort((a, b) => (b.previous_revenue - b.current_revenue) - (a.previous_revenue - a.current_revenue));
      const rows = signals.slice(0, 80);

      const opportunities = rows.slice(0, 40).map(row => {
        const previousRevenue = number(row.previous_revenue);
        const currentRevenue = number(row.current_revenue);
        const decline = previousRevenue > 0 ? ((currentRevenue / previousRevenue) - 1) * 100 : null;
        const reactivation = row.signal_type === 'reativacao';
        const customerName = String(row.customer_name || `Cliente ${row.customer_id}`);
        return {
          type: row.signal_type,
          customerId: String(row.customer_id),
          customerName,
          city: row.city || null,
          uf: row.uf || null,
          seller: row.seller || null,
          currentRevenue,
          previousRevenue,
          currentOrders: number(row.current_orders),
          previousOrders: number(row.previous_orders),
          declinePct: decline,
          score: reactivation ? 86 : Math.min(82, 55 + Math.abs(decline || 0) / 3),
          title: reactivation ? `Reativar ${customerName}` : `Recuperar queda de ${customerName}`,
          description: reactivation
            ? 'Cliente faturou no mês anterior e ainda não realizou compra no período atual. Sinal de reativação, não previsão de receita.'
            : `Faturamento caiu ${Math.abs(decline || 0).toFixed(1)}% contra o mês anterior. Sinal baseado em comportamento histórico.`,
        };
      });

      return {
        ok: true,
        source: 'Snapshot comercial diário (mesma base do Dashboard Regional)',
        period,
        filters: { customerId, city, uf, group, supplier },
        summary: {
          currentCustomers,
          previousCustomers,
        },
        currentKpis: {
          total_valor: currentRevenueTotal,
          total_kg: currentKgTotal,
          n_pedidos: currentOrdersTotal,
          ticket_medio: currentOrdersTotal ? currentRevenueTotal / currentOrdersTotal : 0,
          n_clientes: currentCustomers,
        },
        previousKpis: {
          total_valor: previousRevenueTotal,
          total_kg: previousKgTotal,
          n_pedidos: previousOrdersTotal,
          ticket_medio: previousOrdersTotal ? previousRevenueTotal / previousOrdersTotal : 0,
          n_clientes: previousCustomers,
        },
        opportunities,
        rules: {
          reactivation: 'faturamento anterior >= R$ 5.000 e faturamento atual = R$ 0',
          decline: 'faturamento anterior >= R$ 5.000 e queda superior a 40%',
          positivity: 'cliente único com pelo menos uma venda no período e no escopo filtrado',
        },
      };
    });
    return res.json(payload);
  } catch (error) {
    return erroApi(res, error);
  }
}
