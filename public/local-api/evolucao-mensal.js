import { forEachRegionalFact, orderDateMs } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';

export default async function handler(req, res) {
  try {
    const map = new Map();
    await forEachRegionalFact(req.query, ({ line, order }) => {
      const ms = orderDateMs(order);
      if (!Number.isFinite(ms)) return;
      const d = new Date(ms);
      const ano = d.getUTCFullYear();
      const mes = d.getUTCMonth() + 1;
      const key = `${ano}-${mes}`;
      const current = map.get(key) || { ano, mes, valor: 0, volume: 0, pedidos: new Set() };
      current.valor += Number(line.v) || 0;
      current.volume += Number(line.kg) || 0;
      current.pedidos.add(String(line.o));
      map.set(key, current);
    });
    const data = [...map.values()]
      .sort((a, b) => a.ano - b.ano || a.mes - b.mes)
      .map((row) => ({ ano: row.ano, mes: row.mes, valor: row.valor, volume: row.volume, pedidos: row.pedidos.size }));
    res.setHeader('X-PMG-Data-Source', 'DAILY-SNAPSHOT');
    return res.status(200).json(data);
  } catch (err) { return erroApi(res, err); }
}
