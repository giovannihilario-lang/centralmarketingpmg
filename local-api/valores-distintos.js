import {
  getPool, sql, CTE_BASE_REGIONAL, FROM_BASE_REGIONAL, aplicarFiltrosRegionais,
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
  Produto: {
    col: 'CAST(p.[ID Produto] AS NVARCHAR(30))',
    label: "CONCAT(CAST(p.[ID Produto] AS NVARCHAR(30)), ' — ', COALESCE(p.[Produto], 'Produto sem descrição'))",
    search: "CONCAT(CAST(p.[ID Produto] AS NVARCHAR(30)), ' ', COALESCE(p.[Produto], ''))",
    param: 'p_produto',
  },
};

export default async function handler(req, res) {
  try {
    const item = COLUNAS[req.query.p_coluna];
    if (!item) return res.status(400).json({ message: `Coluna inválida: ${req.query.p_coluna}` });
    if (responderCache(req, res, cache, CACHE_TTL_CATALOGO_MS)) return;

    const pool = await getPool();
    const request = pool.request();
    const where = aplicarFiltrosRegionais(request, req.query, { ignorar: [item.param] });
    const busca = String(req.query.p_busca || '').trim();
    const limite = Math.min(Math.max(Number.parseInt(req.query.p_limit || (req.query.p_coluna === 'Produto' ? '120' : '5000'), 10) || 120, 1), 5000);
    request.input('limite', sql.Int, limite);
    if (busca && item.search) request.input('busca', sql.NVarChar(220), `%${busca}%`);

    const labelCol = item.label || item.col;
    const searchWhere = busca && item.search ? 'WHERE busca_texto LIKE @busca' : '';
    const query = `
      ${CTE_BASE_REGIONAL},
      BaseFiltrada AS (
        SELECT
          ${item.col} AS valor,
          ${labelCol} AS rotulo,
          ${item.search || item.col} AS busca_texto,
          vp.[ID Pedido de Venda] AS pedido_id
        ${FROM_BASE_REGIONAL}
        WHERE ${where} AND ${item.col} IS NOT NULL AND ${item.col} <> ''
      ),
      BasePesquisada AS (
        SELECT valor, rotulo, pedido_id
        FROM BaseFiltrada
        ${searchWhere}
      )
      SELECT TOP (@limite)
        valor,
        MAX(rotulo) AS rotulo,
        COUNT(DISTINCT pedido_id) AS qtd,
        (SELECT COUNT(DISTINCT pedido_id) FROM BaseFiltrada) AS total_pedidos
      FROM BasePesquisada
      GROUP BY valor
      ORDER BY qtd DESC, rotulo ASC
    `;
    const result = await request.query(query);
    const data = result.recordset;
    salvarCache(req, res, cache, data);
    return res.status(200).json(data);
  } catch (err) {
    return erroApi(res, err);
  }
}
