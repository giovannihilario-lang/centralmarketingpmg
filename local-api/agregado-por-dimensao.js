import {
  getPool, sql, CTE_BASE_REGIONAL, FROM_BASE_REGIONAL, aplicarFiltrosRegionais,
  responderCache, salvarCache, erroApi,
} from '../src/lib/regional-dashboard.js';

const cache = new Map();

const DIMENSOES = {
  Regiao: 'c.Zona',
  UF: 'c.UF',
  Segmento: 'c.Segmento',
  Grupo: 'p.Grupo',
  Fornecedor: 'p.Fornecedor',
  SubGrupo: 'p.[Sub-grupo]',
};
const METRICAS = {
  Valor: 'vp.Valor',
  'Qtde Kg': 'vp.[Qtde Kg]',
};

export default async function handler(req, res) {
  try {
    const { p_dimensao, p_metrica, p_limit } = req.query;
    const dimCol = DIMENSOES[p_dimensao];
    const metCol = METRICAS[p_metrica];
    if (!dimCol) return res.status(400).json({ message: `Dimensão inválida: ${p_dimensao}` });
    if (!metCol) return res.status(400).json({ message: `Métrica inválida: ${p_metrica}` });
    const limit = Math.max(1, Math.min(1000, parseInt(p_limit, 10) || 10));

    if (responderCache(req, res, cache)) return;
    const pool = await getPool();
    const request = pool.request();
    request.input('limit', sql.Int, limit);
    const where = aplicarFiltrosRegionais(request, req.query);

    const query = `
      ${CTE_BASE_REGIONAL},
      Agregado AS (
        SELECT ${dimCol} AS chave, SUM(${metCol}) AS total
        ${FROM_BASE_REGIONAL}
        WHERE ${where} AND ${dimCol} IS NOT NULL AND ${dimCol} <> ''
        GROUP BY ${dimCol}
      )
      SELECT TOP (@limit)
        chave,
        total,
        SUM(total) OVER () AS total_geral
      FROM Agregado
      ORDER BY total DESC
    `;
    const result = await request.query(query);
    const data = result.recordset;
    salvarCache(req, res, cache, data);
    return res.status(200).json(data);
  } catch (err) {
    return erroApi(res, err);
  }
}
