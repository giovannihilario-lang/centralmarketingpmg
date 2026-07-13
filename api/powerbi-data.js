import sql from "mssql";

// Whitelist de tabelas permitidas — nunca aceitar nome de tabela vindo direto
// da query string sem checar contra essa lista (evita SQL injection).
const TABELAS_PERMITIDAS = {
  clientes: "Clientes",
  produtos: "Produtos",
  vendas: "Vendas",
  vendasprodutos: "VendasProdutos",
};

const config = {
  server: process.env.AZURE_SQL_SERVER,       // ex: pama.database.windows.net
  database: process.env.AZURE_SQL_DATABASE,   // ex: powerbi
  user: process.env.AZURE_SQL_USER,
  password: process.env.AZURE_SQL_PASSWORD,
  options: {
    encrypt: true,               // obrigatório para Azure SQL
    trustServerCertificate: false,
  },
  pool: {
    max: 5,
    min: 0,
    idleTimeoutMillis: 30000,
  },
};

// Reutiliza a conexão entre invocações da função serverless (evita reconectar
// a cada chamada, o que é lento e pode esgotar o limite de conexões do Azure).
let poolPromise;
function getPool() {
  if (!poolPromise) {
    poolPromise = sql.connect(config);
  }
  return poolPromise;
}

export default async function handler(req, res) {
  const tabelaParam = String(req.query.tabela || "").toLowerCase();
  const tabela = TABELAS_PERMITIDAS[tabelaParam];

  if (!tabela) {
    return res.status(400).json({
      erro: "Parâmetro 'tabela' inválido ou ausente.",
      tabelasDisponiveis: Object.values(TABELAS_PERMITIDAS),
    });
  }

  try {
    const pool = await getPool();

    // Paginação simples via querystring: ?tabela=vendas&limite=1000&pagina=1
    const limite = Math.min(parseInt(req.query.limite, 10) || 1000, 5000);
    const pagina = Math.max(parseInt(req.query.pagina, 10) || 1, 1);
    const offset = (pagina - 1) * limite;

    const result = await pool
      .request()
      .input("offset", sql.Int, offset)
      .input("limite", sql.Int, limite)
      .query(`
        SELECT *
        FROM [dbo].[${tabela}]
        ORDER BY (SELECT NULL)
        OFFSET @offset ROWS
        FETCH NEXT @limite ROWS ONLY
      `);

    return res.status(200).json({
      tabela,
      pagina,
      limite,
      total: result.recordset.length,
      dados: result.recordset,
    });
  } catch (err) {
    console.error("Erro ao consultar Azure SQL:", err);
    return res.status(500).json({ erro: err.message });
  }
}
