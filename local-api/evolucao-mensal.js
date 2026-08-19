import {
  getPool, montarCteBaseRegional, FROM_BASE_REGIONAL, aplicarFiltrosRegionais,
  responderCache, salvarCache, erroApi,
} from '../src/lib/regional-dashboard.js';

const cache = new Map();

export default async function handler(req, res) {
  try {
    if (responderCache(req, res, cache)) return;
    const pool = await getPool();
    const request = pool.request();
    const where = aplicarFiltrosRegionais(request, req.query);
    const query = `
      ${montarCteBaseRegional(req.query)}
      SELECT
        YEAR(v.Data) AS ano,
        MONTH(v.Data) AS mes,
        SUM(vp.Valor) AS valor,
        SUM(vp.[Qtde Kg]) AS volume,
        COUNT(DISTINCT vp.[ID Pedido de Venda]) AS pedidos
      ${FROM_BASE_REGIONAL}
      WHERE ${where} AND v.Data IS NOT NULL
      GROUP BY YEAR(v.Data), MONTH(v.Data)
      ORDER BY ano, mes
    `;
    const result = await request.query(query);
    const data = result.recordset;
    salvarCache(req, res, cache, data);
    return res.status(200).json(data);
  } catch (err) {
    return erroApi(res, err);
  }
}
