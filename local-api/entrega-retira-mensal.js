import { ensureDailySnapshot, orderDateMs } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';
import { cacheKeyFor, withResponseCache } from '../src/lib/response-cache.js';

const CACHE_MS = 5 * 60_000;
const HIGH_TICKET_THRESHOLD = 900;

function parseRange(query) {
  let start = null, end = null;
  const de = /^(\d{4})-(\d{2})$/.exec(String(query.p_de || ''));
  if (de) start = Date.UTC(Number(de[1]), Number(de[2]) - 1, 1);
  const ate = /^(\d{4})-(\d{2})$/.exec(String(query.p_ate || ''));
  if (ate) end = Date.UTC(Number(ate[1]), Number(ate[2]), 1);
  return { start, end };
}

// Ticket médio e itens por pedido, mensal, por modalidade (Entrega/Retira).
// dbo.Vendas.[Tipo] só existe na seção `orders` do snapshot (não em
// `regionalOrders`, usada pelas demais rotas), então esta consulta lê o
// snapshot direto em vez de usar forEachRegionalFact.
export default async function handler(req, res) {
  try {
    const data = await withResponseCache(cacheKeyFor('entrega-retira-mensal', req.query), CACHE_MS, async () => {
      const snapshot = await ensureDailySnapshot();
      const { start, end } = parseRange(req.query);

      const itemsByOrder = new Map();
      for (const line of snapshot.lines || []) {
        itemsByOrder.set(line.o, (itemsByOrder.get(line.o) || 0) + 1);
      }

      const map = new Map();
      for (const order of snapshot.orders || []) {
        const tipo = order.t === 'Retira' ? 'Retira' : order.t === 'Entrega' ? 'Entrega' : null;
        if (!tipo) continue;
        const ms = orderDateMs(order);
        if (!Number.isFinite(ms)) continue;
        if (start !== null && ms < start) continue;
        if (end !== null && ms >= end) continue;

        const d = new Date(ms);
        const ano = d.getUTCFullYear();
        const mes = d.getUTCMonth() + 1;
        const key = `${ano}-${mes}-${tipo}`;
        const current = map.get(key) || {
          ano, mes, tipo, pedidos: 0, valor: 0, itens: 0, pedidosAltoTicket: 0, itensAltoTicket: 0,
        };
        const valor = Number(order.v) || 0;
        const itens = itemsByOrder.get(order.o) || 0;
        current.pedidos += 1;
        current.valor += valor;
        current.itens += itens;
        if (valor >= HIGH_TICKET_THRESHOLD) {
          current.pedidosAltoTicket += 1;
          current.itensAltoTicket += itens;
        }
        map.set(key, current);
      }

      return [...map.values()]
        .sort((a, b) => a.ano - b.ano || a.mes - b.mes || a.tipo.localeCompare(b.tipo))
        .map((r) => ({
          ano: r.ano,
          mes: r.mes,
          tipo: r.tipo,
          pedidos: r.pedidos,
          valor: r.valor,
          ticketMedio: r.pedidos ? r.valor / r.pedidos : 0,
          itensPorPedido: r.pedidos ? r.itens / r.pedidos : 0,
          pedidosAltoTicket: r.pedidosAltoTicket,
          itensPorPedidoAltoTicket: r.pedidosAltoTicket ? r.itensAltoTicket / r.pedidosAltoTicket : 0,
        }));
    });
    res.setHeader('X-PMG-Data-Source', 'DAILY-SNAPSHOT');
    return res.status(200).json(data);
  } catch (err) { return erroApi(res, err); }
}
