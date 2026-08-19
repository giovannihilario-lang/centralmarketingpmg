import { forEachRegionalFact } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';

export default async function handler(req, res) {
  try {
    const map = new Map();
    await forEachRegionalFact(req.query, ({ line, client, product }) => {
      if (!product.g || !client.z) return;
      const key = `${product.g}\u0000${client.z}`;
      const current = map.get(key) || { grupo: product.g, regiao: client.z, valor: 0 };
      current.valor += Number(line.v) || 0;
      map.set(key, current);
    });
    const data = [...map.values()].sort((a, b) => b.valor - a.valor);
    res.setHeader('X-PMG-Data-Source', 'DAILY-SNAPSHOT');
    return res.status(200).json(data);
  } catch (err) { return erroApi(res, err); }
}
