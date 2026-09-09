import { ensureDailySnapshot } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';
import { withResponseCache } from '../src/lib/response-cache.js';

const CACHE_MS = 5 * 60_000;

export default async function handler(req, res) {
  try {
    const data = await withResponseCache('cidades-existentes', CACHE_MS, async () => {
      const snapshot = await ensureDailySnapshot();
      const seen = new Set();
      const result = [];
      for (const client of snapshot.regionalClients || []) {
        if (!client.ci || !client.uf) continue;
        const key = `${client.ci}|${client.uf}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push({ cidade: client.ci, uf: client.uf });
      }
      result.sort((a, b) => a.uf.localeCompare(b.uf, 'pt-BR') || a.cidade.localeCompare(b.cidade, 'pt-BR'));
      return result;
    });
    res.setHeader('X-PMG-Data-Source', 'DAILY-SNAPSHOT');
    return res.status(200).json(data);
  } catch (err) { return erroApi(res, err); }
}
