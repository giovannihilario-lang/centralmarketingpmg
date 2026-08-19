import { forEachRegionalFact } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';

const norm = (value) => String(value ?? '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleUpperCase('pt-BR');

export default async function handler(req, res) {
  try {
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
    res.setHeader('X-PMG-Data-Source', 'DAILY-SNAPSHOT');
    return res.status(200).json([...map.values()]);
  } catch (err) { return erroApi(res, err); }
}
