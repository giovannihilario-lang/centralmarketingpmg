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

// whitelists: nunca usar o valor do usuário direto na query (evita SQL injection)
const DIMENSOES = {
  Regiao: "c.Zona",
  UF: "c.UF",
  Segmento: "c.Segmento",
  Grupo: "p.Grupo",
  Fornecedor: "p.Fornecedor",
  SubGrupo: "p.[Sub-grupo]",
};
const METRICAS = {
  Valor: "vp.Valor",
  "Qtde Kg": "vp.[Qtde Kg]",
};

export default async function handler(req, res) {
  try {
    const { p_dimensao, p_metrica, p_limit } = req.query;
    const dimCol = DIMENSOES[p_dimensao];
    const metCol = METRICAS[p_metrica];
    if (!dimCol) return res.status(400).json({ message: `Dimensão inválida: ${p_dimensao}` });
    if (!metCol) return res.status(400).json({ message: `Métrica inválida: ${p_metrica}` });
    const limit = Math.max(1, Math.min(100, parseInt(p_limit, 10) || 10));

    const cacheKey = JSON.stringify(req.query);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
      return res.status(200).json(cached.data);
    }

    const pool = new sql.ConnectionPool(config);
    await pool.connect();
    const request = pool.request();
    request.input("limit", sql.Int, limit);
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
      SELECT TOP (@limit) ${dimCol} AS chave, SUM(${metCol}) AS total
      FROM VendasProdutos vp
      JOIN Vendas v ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
      JOIN Clientes c ON v.[ID Cliente] = c.[ID Cliente]
      JOIN Produtos p ON vp.[ID Produto] = p.[ID Produto]
      WHERE ${where} AND ${dimCol} IS NOT NULL AND ${dimCol} <> ''
      GROUP BY ${dimCol}
      ORDER BY total DESC
    `;
    const result = await request.query(query);
    await pool.close();
    cache.set(cacheKey, { time: Date.now(), data: result.recordset });
    return res.status(200).json(result.recordset);
  } catch (err) {
    return res.status(500).json({ message: err.message, code: err.code || null });
  }
}
