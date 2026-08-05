import sql from "mssql";

const config = {
  server: process.env.AZURE_SQL_SERVER,       // ex: pama.database.windows.net
  database: process.env.AZURE_SQL_DATABASE,
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
  connectionTimeout: 15000,
  requestTimeout: 15000,
};

export default async function handler(req, res) {
  try {
    const pool = await sql.connect(config);
    const result = await pool.request().query("SELECT 1 AS teste");
    await pool.close();

    return res.status(200).json({
      sucesso: true,
      mensagem: "Conexão direta Vercel -> Azure SQL funcionou!",
      resultado: result.recordset,
    });
  } catch (err) {
    return res.status(500).json({
      sucesso: false,
      erro: err.message,
      code: err.code || null,
    });
  }
}