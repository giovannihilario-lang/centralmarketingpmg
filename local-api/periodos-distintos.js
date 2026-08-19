import { forEachRegionalFact, orderDateMs } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';

export default async function handler(req, res) {
  try {
    const map = new Map();
    await forEachRegionalFact(req.query, ({ order }) => {
      const ms = orderDateMs(order);
      if (!Number.isFinite(ms)) return;
      const d = new Date(ms);
      const ano = d.getUTCFullYear();
      const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
      map.set(`${ano}-${mes}`, { ano, mes });
    }, { ignore: ['p_de', 'p_ate'] });
    const data = [...map.values()].sort((a, b) => a.ano - b.ano || Number(a.mes) - Number(b.mes));
    res.setHeader('X-PMG-Data-Source', 'DAILY-SNAPSHOT');
    return res.status(200).json(data);
  } catch (err) { return erroApi(res, err); }
}
