import { forEachRegionalFact } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';
import { cacheKeyFor, withResponseCache } from '../src/lib/response-cache.js';

const CACHE_MS = 5 * 60_000;

export default async function handler(req, res) {
  try {
    const data = await withResponseCache(cacheKeyFor('agregado-grupo-regiao', req.query), CACHE_MS, async () => {
      const map = new Map();
      await forEachRegionalFact(req.query, ({ line, client, product }) => {
        if (!product.g || !client.z) return;
        const key = `${product.g}\u0000${client.z}`;
        const current = map.get(key) || { grupo: product.g, regiao: client.z, valor: 0 };
        current.valor += Number(line.v) || 0;
        map.set(key, current);
      });
      return [...map.values()].sort((a, b) => b.valor - a.valor);
    });
    res.setHeader('X-PMG-Data-Source', 'DAILY-SNAPSHOT');
    return res.status(200).json(data);
  } catch (err) { return erroApi(res, err); }
}
