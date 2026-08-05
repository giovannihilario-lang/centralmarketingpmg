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
const CACHE_TTL_MS = 1800000; // 30 min

// whitelist: nunca usar o valor do usuário direto na query (evita SQL injection)
const COLUNAS = {
  Regiao: "c.Zona",
  UF: "c.UF",
  Segmento: "c.Segmento",
  Grupo: "p.Grupo",
  Fornecedor: "p.Fornecedor",
  SubGrupo: "p.[Sub-grupo]",
};

export default async function handler(req, res) {
  try {
    const { p_coluna } = req.query;
    const col = COLUNAS[p_coluna];
    if (!col) {
      return res.status(400).json({ message: `Coluna inválida: ${p_coluna}` });
    }

    const cacheKey = JSON.stringify(req.query);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
      return res.status(200).json(cached.data);
    }

    const pool = new sql.ConnectionPool(config);
    await pool.connect();
    const query = `
      SELECT ${col} AS valor, COUNT(*) AS qtd
      FROM VendasProdutos vp
      JOIN Vendas v ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
      JOIN Clientes c ON v.[ID Cliente] = c.[ID Cliente]
      JOIN Produtos p ON vp.[ID Produto] = p.[ID Produto]
      WHERE ${col} IS NOT NULL AND ${col} <> ''
      GROUP BY ${col}
      ORDER BY qtd DESC
    `;
    const result = await pool.request().query(query);
    await pool.close();
    cache.set(cacheKey, { time: Date.now(), data: result.recordset });
    return res.status(200).json(result.recordset);
  } catch (err) {
    return res.status(500).json({ message: err.message, code: err.code || null });
  }
}
