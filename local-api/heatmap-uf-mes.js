import { forEachRegionalFact, orderDateMs } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';

export default async function handler(req, res) {
  try {
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
    const data = [...map.values()].sort((a, b) => a.uf.localeCompare(b.uf, 'pt-BR') || a.ano - b.ano || a.mes - b.mes);
    res.setHeader('X-PMG-Data-Source', 'DAILY-SNAPSHOT');
    return res.status(200).json(data);
  } catch (err) { return erroApi(res, err); }
}
