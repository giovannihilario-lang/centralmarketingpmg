import { forEachRegionalFact, orderDateMs } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';
import { cacheKeyFor, withResponseCache } from '../src/lib/response-cache.js';

const CACHE_MS = 5 * 60_000;

// dbo.Clientes.[Zona] tem ~500 valores (uma cidade/bairro por cliente).
// Estas são as únicas bases/polos que batem 1:1 ou por agrupamento direto de
// cidades vizinhas com nomes reais confirmados no snapshot — nada aqui é
// inventado, cada zona listada existe literalmente nos dados.
const HUB_ZONAS = {
  'Bauru': ['BAURU'],
  'Campinas': ['CAMPINAS'],
  'Guarulhos': ['GUARULHOS1', 'GUARULHOS2'],
  'Ribeirão Preto': ['RIBEIRÃO PRETO'],
  'Taubaté': ['TAUBATÉ'],
  'Avaré': ['AVARÉ'],
  'Litoral Norte': ['SÃO SEBASTIÃO', 'UBATUBA', 'CARAGUATATUBA', 'ILHA BELA SUL', 'ILHA BELA NORTE / CENTRO', 'ILHA COMPRIDA'],
};
const ZONA_TO_HUB = new Map();
for (const [hub, zonas] of Object.entries(HUB_ZONAS)) for (const z of zonas) ZONA_TO_HUB.set(z, hub);

export default async function handler(req, res) {
  try {
    const data = await withResponseCache(cacheKeyFor('base-entrega-mensal', req.query), CACHE_MS, async () => {
      const map = new Map();
      await forEachRegionalFact(req.query, ({ line, order, client }) => {
        const hub = ZONA_TO_HUB.get(String(client?.z || '').trim());
        if (!hub) return;
        const ms = orderDateMs(order);
        if (!Number.isFinite(ms)) return;
        const d = new Date(ms);
        const ano = d.getUTCFullYear();
        const mes = d.getUTCMonth() + 1;
        const key = `${ano}-${mes}-${hub}`;
        const current = map.get(key) || { ano, mes, hub, pedidos: new Set(), clientes: new Set() };
        current.pedidos.add(String(line.o));
        if (order?.c != null) current.clientes.add(Number(order.c));
        map.set(key, current);
      });
      return [...map.values()]
        .sort((a, b) => a.ano - b.ano || a.mes - b.mes || a.hub.localeCompare(b.hub))
        .map((r) => ({ ano: r.ano, mes: r.mes, hub: r.hub, pedidos: r.pedidos.size, clientes: r.clientes.size }));
    });
    res.setHeader('X-PMG-Data-Source', 'DAILY-SNAPSHOT');
    return res.status(200).json(data);
  } catch (err) { return erroApi(res, err); }
}
