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
      SELECT
        UPPER(LTRIM(RTRIM(c.UF))) AS uf,
        YEAR(v.Data) AS ano,
        MONTH(v.Data) AS mes,
        SUM(vp.Valor) AS valor
      ${FROM_BASE_REGIONAL}
      WHERE ${where} AND c.UF IS NOT NULL AND v.Data IS NOT NULL
      GROUP BY UPPER(LTRIM(RTRIM(c.UF))), YEAR(v.Data), MONTH(v.Data)
      ORDER BY uf, ano, mes
    `;
    const result = await request.query(query);
    const data = result.recordset;
    salvarCache(req, res, cache, data);
    return res.status(200).json(data);
  } catch (err) {
    return erroApi(res, err);
  }
}
