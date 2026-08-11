import {
  getPool, CTE_BASE_REGIONAL, FROM_BASE_REGIONAL, aplicarFiltrosRegionais,
  responderCache, salvarCache, erroApi, CACHE_TTL_CATALOGO_MS,
} from '../src/lib/regional-dashboard.js';

const cache = new Map();

const COLUNAS = {
  Cidade: { col: "CONCAT(c.Cidade, ' / ', c.UF)", param: 'p_cidade' },
  Regiao: { col: 'c.Zona', param: 'p_regiao' },
  UF: { col: 'c.UF', param: 'p_uf' },
  Segmento: { col: 'c.Segmento', param: 'p_segmento' },
  Grupo: { col: 'p.Grupo', param: 'p_grupo' },
  Fornecedor: { col: 'p.Fornecedor', param: 'p_fornecedor' },
  SubGrupo: { col: 'p.[Sub-grupo]', param: 'p_subgrupo' },
};

export default async function handler(req, res) {
  try {
    const item = COLUNAS[req.query.p_coluna];
    if (!item) return res.status(400).json({ message: `Coluna inválida: ${req.query.p_coluna}` });
    if (responderCache(req, res, cache, CACHE_TTL_CATALOGO_MS)) return;

    const pool = await getPool();
    const request = pool.request();
    const where = aplicarFiltrosRegionais(request, req.query, { ignorar: [item.param] });
    const query = `
      ${CTE_BASE_REGIONAL},
      BaseFiltrada AS (
        SELECT ${item.col} AS valor, vp.[ID Pedido de Venda] AS pedido_id
        ${FROM_BASE_REGIONAL}
        WHERE ${where} AND ${item.col} IS NOT NULL AND ${item.col} <> ''
      )
      SELECT
        valor,
        COUNT(DISTINCT pedido_id) AS qtd,
        (SELECT COUNT(DISTINCT pedido_id) FROM BaseFiltrada) AS total_pedidos
      FROM BaseFiltrada
      GROUP BY valor
      ORDER BY qtd DESC, valor ASC
    `;
    const result = await request.query(query);
    const data = result.recordset;
    salvarCache(req, res, cache, data);
    return res.status(200).json(data);
  } catch (err) {
    return erroApi(res, err);
  }
}
