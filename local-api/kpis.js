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
        COALESCE(SUM(vp.Valor), 0) AS total_valor,
        COALESCE(SUM(vp.[Qtde Kg]), 0) AS total_kg,
        COUNT_BIG(*) AS n_registros,
        COUNT(DISTINCT vp.[ID Pedido de Venda]) AS n_pedidos,
        COUNT(DISTINCT CONCAT(
          UPPER(LTRIM(RTRIM(c.Cidade))) COLLATE Latin1_General_CI_AI,
          '|', UPPER(LTRIM(RTRIM(c.UF))) COLLATE Latin1_General_CI_AI
        )) AS n_cidades,
        COUNT(DISTINCT UPPER(LTRIM(RTRIM(c.UF))) COLLATE Latin1_General_CI_AI) AS n_ufs,
        COUNT(DISTINCT p.Fornecedor) AS n_fornecedores,
        CAST(
          COALESCE(SUM(vp.Valor), 0) /
          NULLIF(CAST(COUNT(DISTINCT vp.[ID Pedido de Venda]) AS decimal(19,4)), 0)
          AS decimal(19,2)
        ) AS ticket_medio
      ${FROM_BASE_REGIONAL}
      WHERE ${where}
    `;
    const result = await request.query(query);
    const data = result.recordset;
    salvarCache(req, res, cache, data);
    return res.status(200).json(data);
  } catch (err) {
    return erroApi(res, err);
  }
}
