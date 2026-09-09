import { forEachRegionalFact, orderDateMs } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';
import { cacheKeyFor, withResponseCache } from '../src/lib/response-cache.js';

const CACHE_MS = 5 * 60_000;

export default async function handler(req, res) {
  try {
    const data = await withResponseCache(cacheKeyFor('periodos-distintos', req.query), CACHE_MS, async () => {
      const map = new Map();
      await forEachRegionalFact(req.query, ({ order }) => {
        const ms = orderDateMs(order);
        if (!Number.isFinite(ms)) return;
        const d = new Date(ms);
        const ano = d.getUTCFullYear();
        const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
        map.set(`${ano}-${mes}`, { ano, mes });
      }, { ignore: ['p_de', 'p_ate'] });
      return [...map.values()].sort((a, b) => a.ano - b.ano || Number(a.mes) - Number(b.mes));
    });
    res.setHeader('X-PMG-Data-Source', 'DAILY-SNAPSHOT');
    return res.status(200).json(data);
  } catch (err) { return erroApi(res, err); }
}
