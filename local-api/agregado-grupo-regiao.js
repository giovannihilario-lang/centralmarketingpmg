import {
  getPool, CTE_BASE_REGIONAL, FROM_BASE_REGIONAL, aplicarFiltrosRegionais,
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
      ${CTE_BASE_REGIONAL}
      SELECT p.Grupo AS grupo, c.Zona AS regiao, SUM(vp.Valor) AS valor
      ${FROM_BASE_REGIONAL}
      WHERE ${where} AND p.Grupo IS NOT NULL AND c.Zona IS NOT NULL
      GROUP BY p.Grupo, c.Zona
      ORDER BY valor DESC
    `;
    const result = await request.query(query);
    const data = result.recordset;
    salvarCache(req, res, cache, data);
    return res.status(200).json(data);
  } catch (err) {
    return erroApi(res, err);
  }
}
