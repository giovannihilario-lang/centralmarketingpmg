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

export default async function handler(req, res) {
  try {
    const cacheKey = JSON.stringify(req.query);
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < CACHE_TTL_MS) {
      return res.status(200).json(cached.data);
    }

    const pool = new sql.ConnectionPool(config);
    await pool.connect();
    const result = await pool.request().query(`
      SELECT DISTINCT
        YEAR(Data) AS ano,
        RIGHT('0' + CAST(MONTH(Data) AS varchar(2)), 2) AS mes
      FROM Vendas
      WHERE Data IS NOT NULL
      ORDER BY ano, mes
    `);
    await pool.close();
    cache.set(cacheKey, { time: Date.now(), data: result.recordset });
    return res.status(200).json(result.recordset);
  } catch (err) {
    return res.status(500).json({ message: err.message, code: err.code || null });
  }
}
