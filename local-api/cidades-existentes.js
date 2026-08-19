import { ensureDailySnapshot } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';

export default async function handler(req, res) {
  try {
    const snapshot = await ensureDailySnapshot();
    const seen = new Set();
    const data = [];
    for (const client of snapshot.regionalClients || []) {
      if (!client.ci || !client.uf) continue;
      const key = `${client.ci}|${client.uf}`;
      if (seen.has(key)) continue;
      seen.add(key);
      data.push({ cidade: client.ci, uf: client.uf });
    }
    data.sort((a, b) => a.uf.localeCompare(b.uf, 'pt-BR') || a.cidade.localeCompare(b.cidade, 'pt-BR'));
    res.setHeader('X-PMG-Data-Source', 'DAILY-SNAPSHOT');
    return res.status(200).json(data);
  } catch (err) { return erroApi(res, err); }
}
