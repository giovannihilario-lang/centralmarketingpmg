import {
  getPool, CTE_BASE_REGIONAL, FROM_BASE_REGIONAL, aplicarFiltrosRegionais,
  responderCache, salvarCache, erroApi, CACHE_TTL_CATALOGO_MS,
} from '../src/lib/regional-dashboard.js';

const cache = new Map();

export default async function handler(req, res) {
  try {
    if (responderCache(req, res, cache, CACHE_TTL_CATALOGO_MS)) return;
    const pool = await getPool();
    const request = pool.request();
    // Datas são ignoradas de propósito: este endpoint responde quais meses existem
    // dentro dos demais filtros. O frontend restringe ao intervalo selecionado quando necessário.
    const where = aplicarFiltrosRegionais(request, req.query, { ignorar: ['p_de', 'p_ate'] });
    const query = `
      ${CTE_BASE_REGIONAL}
      SELECT DISTINCT
        YEAR(v.Data) AS ano,
        RIGHT('0' + CAST(MONTH(v.Data) AS varchar(2)), 2) AS mes
      ${FROM_BASE_REGIONAL}
      WHERE ${where} AND v.Data IS NOT NULL
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
