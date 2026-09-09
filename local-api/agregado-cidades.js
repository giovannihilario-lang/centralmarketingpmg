import { forEachRegionalFact } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';
import { cacheKeyFor, withResponseCache } from '../src/lib/response-cache.js';

const norm = (value) => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('pt-BR');
const CACHE_MS = 5 * 60_000;

export default async function handler(req, res) {
  try {
    const data = await withResponseCache(cacheKeyFor('agregado-cidades', req.query), CACHE_MS, async () => {
      const map = new Map();
      await forEachRegionalFact(req.query, ({ line, client }) => {
        if (!client.ci || !client.uf) return;
        const key = `${norm(client.ci)}|${norm(client.uf)}`;
        const current = map.get(key) || { cidade: client.ci, uf: norm(client.uf), valor: 0, kg: 0 };
        if (String(client.ci).localeCompare(String(current.cidade), 'pt-BR') > 0) current.cidade = client.ci;
        current.valor += Number(line.v) || 0;
        current.kg += Number(line.kg) || 0;
        map.set(key, current);
      });
      return [...map.values()];
    });
    res.setHeader('X-PMG-Data-Source', 'DAILY-SNAPSHOT');
    return res.status(200).json(data);
  } catch (err) { return erroApi(res, err); }
}
