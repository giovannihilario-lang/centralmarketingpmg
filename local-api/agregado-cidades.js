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
        MAX(c.Cidade) AS cidade,
        UPPER(LTRIM(RTRIM(c.UF))) AS uf,
        SUM(vp.Valor) AS valor,
        SUM(vp.[Qtde Kg]) AS kg
      ${FROM_BASE_REGIONAL}
      WHERE ${where} AND c.Cidade IS NOT NULL AND c.UF IS NOT NULL
      GROUP BY
        UPPER(LTRIM(RTRIM(c.Cidade))) COLLATE Latin1_General_CI_AI,
        UPPER(LTRIM(RTRIM(c.UF))) COLLATE Latin1_General_CI_AI
    `;
    const result = await request.query(query);
    const data = result.recordset;
    salvarCache(req, res, cache, data);
    return res.status(200).json(data);
  } catch (err) {
    return erroApi(res, err);
  }
}
