import {
  getPool, CTE_BASE_REGIONAL, responderCache, salvarCache, erroApi, CACHE_TTL_CATALOGO_MS,
} from '../src/lib/regional-dashboard.js';

const cache = new Map();

export default async function handler(req, res) {
  try {
    if (responderCache(req, res, cache, CACHE_TTL_CATALOGO_MS)) return;
    const pool = await getPool();
    const result = await pool.request().query(`
      ${CTE_BASE_REGIONAL}
      SELECT DISTINCT Cidade AS cidade, UF AS uf
      FROM ClientesUnicos
      WHERE Cidade IS NOT NULL AND UF IS NOT NULL AND Cidade <> '' AND UF <> ''
      ORDER BY UF, Cidade
    `);
    const data = result.recordset;
    salvarCache(req, res, cache, data);
    return res.status(200).json(data);
  } catch (err) {
    return erroApi(res, err);
  }
}
