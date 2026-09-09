import { forEachRegionalFact, orderDateMs } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';
import { cacheKeyFor, withResponseCache } from '../src/lib/response-cache.js';

const CACHE_MS = 5 * 60_000;

export default async function handler(req, res) {
  try {
    const data = await withResponseCache(cacheKeyFor('heatmap-uf-mes', req.query), CACHE_MS, async () => {
      const map = new Map();
      await forEachRegionalFact(req.query, ({ line, order, client }) => {
        if (!client.uf) return;
        const ms = orderDateMs(order);
        if (!Number.isFinite(ms)) return;
        const d = new Date(ms);
        const ano = d.getUTCFullYear();
        const mes = d.getUTCMonth() + 1;
        const uf = String(client.uf).trim().toLocaleUpperCase('pt-BR');
        const key = `${uf}|${ano}|${mes}`;
        const current = map.get(key) || { uf, ano, mes, valor: 0 };
        current.valor += Number(line.v) || 0;
        map.set(key, current);
      });
      return [...map.values()].sort((a, b) => a.uf.localeCompare(b.uf, 'pt-BR') || a.ano - b.ano || a.mes - b.mes);
    });
    res.setHeader('X-PMG-Data-Source', 'DAILY-SNAPSHOT');
    return res.status(200).json(data);
  } catch (err) { return erroApi(res, err); }
}
