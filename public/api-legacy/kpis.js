import sql from "mssql";
const config = {
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  user: process.env.SQL_USER,
  password: process.env.SQL_PASSWORD,
  options: {
    encrypt: process.env.SQL_ENCRYPT === "false" ? false : true,
    trustServerCertificate: false,
  },
  connectionTimeout: 30000,
  requestTimeout: 60000,
};

const cache = new Map();
const CACHE_TTL_MS = 180000; // 3 min

export default async function handler(req, res) {
  try {
    const cacheKey = JSON.stringify(req.query);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
      return res.status(200).json(cached.data);
    }

    const pool = new sql.ConnectionPool(config);
    await pool.connect();
    const request = pool.request();
    let where = "1=1";
    const { p_regiao, p_uf, p_segmento, p_grupo, p_fornecedor, p_subgrupo, p_de, p_ate } = req.query;
    if (p_regiao) { where += " AND c.Zona = @regiao"; request.input("regiao", p_regiao); }
    if (p_uf) { where += " AND c.UF = @uf"; request.input("uf", p_uf); }
    if (p_segmento) { where += " AND c.Segmento = @segmento"; request.input("segmento", p_segmento); }
    if (p_grupo) { where += " AND p.Grupo = @grupo"; request.input("grupo", p_grupo); }
    if (p_subgrupo) { where += " AND p.[Sub-grupo] = @subgrupo"; request.input("subgrupo", p_subgrupo); }
    if (p_fornecedor) { where += " AND p.Fornecedor = @fornecedor"; request.input("fornecedor", p_fornecedor); }
    if (p_de) {
      const [anoDe, mesDe] = p_de.split("-").map(Number);
      where += " AND v.Data >= @de";
      request.input("de", sql.DateTime2, new Date(Date.UTC(anoDe, mesDe - 1, 1)));
    }
    if (p_ate) {
      const [anoAte, mesAte] = p_ate.split("-").map(Number);
      where += " AND v.Data < @ate";
      request.input("ate", sql.DateTime2, new Date(Date.UTC(anoAte, mesAte, 1)));
    }

    const query = `
      SELECT
        SUM(vp.Valor) AS total_valor,
        SUM(vp.[Qtde Kg]) AS total_kg,
        COUNT(*) AS n_registros,
        COUNT(DISTINCT vp.[ID Pedido de Venda]) AS n_pedidos,
        COUNT(DISTINCT CONCAT(c.Cidade, '|', c.UF)) AS n_cidades,
        COUNT(DISTINCT c.UF) AS n_ufs,
        COUNT(DISTINCT p.Fornecedor) AS n_fornecedores
      FROM VendasProdutos vp
      JOIN Vendas v ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
      JOIN Clientes c ON v.[ID Cliente] = c.[ID Cliente]
      JOIN Produtos p ON vp.[ID Produto] = p.[ID Produto]
      WHERE ${where}
    `;
    const result = await request.query(query);
    await pool.close();
    cache.set(cacheKey, { time: Date.now(), data: result.recordset });
    return res.status(200).json(result.recordset);
  } catch (err) {
    return res.status(500).json({ message: err.message, code: err.code || null });
  }
}
