import { forEachRegionalFact } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';

const DIMENSOES = {
  Regiao: ({ client }) => client.z,
  UF: ({ client }) => client.uf,
  Segmento: ({ client }) => client.se,
  Grupo: ({ product }) => product.g,
  Fornecedor: ({ product }) => product.sn,
  SubGrupo: ({ product }) => product.sg,
};
const METRICAS = {
  Valor: ({ line }) => Number(line.v) || 0,
  'Qtde Kg': ({ line }) => Number(line.kg) || 0,
};

export default async function handler(req, res) {
  try {
    const dim = DIMENSOES[req.query.p_dimensao];
    const metric = METRICAS[req.query.p_metrica];
    if (!dim) return res.status(400).json({ message: `Dimensão inválida: ${req.query.p_dimensao}` });
    if (!metric) return res.status(400).json({ message: `Métrica inválida: ${req.query.p_metrica}` });
    const limit = Math.max(1, Math.min(1000, Number.parseInt(req.query.p_limit, 10) || 10));
    const map = new Map();
    await forEachRegionalFact(req.query, (fact) => {
      const key = String(dim(fact) ?? '').trim();
      if (!key) return;
      map.set(key, (map.get(key) || 0) + metric(fact));
    });
    const totalGeral = [...map.values()].reduce((sum, value) => sum + value, 0);
    const data = [...map.entries()]
      .map(([chave, total]) => ({ chave, total, total_geral: totalGeral }))
      .sort((a, b) => b.total - a.total)
      .slice(0, limit);
    res.setHeader('X-PMG-Data-Source', 'DAILY-SNAPSHOT');
    return res.status(200).json(data);
  } catch (err) { return erroApi(res, err); }
}
