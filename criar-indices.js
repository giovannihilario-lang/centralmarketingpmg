import sql from "mssql";
import "dotenv/config";

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
  requestTimeout: 0, // sem limite — criar índice em 9,5M linhas pode demorar
};

const indices = [
  {
    nome: "IX_VendasProdutos_Pedido",
    sql: `CREATE NONCLUSTERED INDEX IX_VendasProdutos_Pedido
          ON dbo.VendasProdutos ([ID Pedido de Venda])
          INCLUDE (Valor, [Qtde Kg], [ID Produto])`,
  },
  {
    nome: "IX_VendasProdutos_Produto",
    sql: `CREATE NONCLUSTERED INDEX IX_VendasProdutos_Produto
          ON dbo.VendasProdutos ([ID Produto])
          INCLUDE (Valor, [Qtde Kg], [ID Pedido de Venda])`,
  },
  {
    nome: "IX_Vendas_Cliente",
    sql: `CREATE NONCLUSTERED INDEX IX_Vendas_Cliente
          ON dbo.Vendas ([ID Cliente])
          INCLUDE (Data)`,
  },
  {
    nome: "IX_Vendas_Data",
    sql: `CREATE NONCLUSTERED INDEX IX_Vendas_Data
          ON dbo.Vendas (Data)
          INCLUDE ([ID Cliente])`,
  },
  {
    nome: "IX_Clientes_Zona",
    sql: `CREATE NONCLUSTERED INDEX IX_Clientes_Zona
          ON dbo.Clientes (Zona)
          INCLUDE (Cidade, UF, [ID Cliente])`,
  },
  {
    nome: "IX_Clientes_UF",
    sql: `CREATE NONCLUSTERED INDEX IX_Clientes_UF
          ON dbo.Clientes (UF)
          INCLUDE (Cidade, Zona, [ID Cliente])`,
  },
  {
    nome: "IX_Clientes_Segmento",
    sql: `CREATE NONCLUSTERED INDEX IX_Clientes_Segmento
          ON dbo.Clientes (Segmento)
          INCLUDE ([ID Cliente])`,
  },
  {
    nome: "IX_Produtos_Grupo",
    sql: `CREATE NONCLUSTERED INDEX IX_Produtos_Grupo
          ON dbo.Produtos (Grupo)
          INCLUDE ([ID Produto], Fornecedor)`,
  },
  {
    nome: "IX_Produtos_Fornecedor",
    sql: `CREATE NONCLUSTERED INDEX IX_Produtos_Fornecedor
          ON dbo.Produtos (Fornecedor)
          INCLUDE ([ID Produto], Grupo)`,
  },
];

async function existeIndice(pool, nome) {
  const result = await pool
    .request()
    .input("nome", sql.NVarChar, nome)
    .query("SELECT 1 FROM sys.indexes WHERE name = @nome");
  return result.recordset.length > 0;
}

async function main() {
  console.log("Conectando no Azure SQL...");
  const pool = new sql.ConnectionPool(config);
  await pool.connect();
  console.log("Conectado. Criando índices (isso pode demorar alguns minutos)...\n");

  for (const idx of indices) {
    process.stdout.write(`- ${idx.nome} ... `);
    try {
      if (await existeIndice(pool, idx.nome)) {
        console.log("já existe, pulando.");
        continue;
      }
      const inicio = Date.now();
      await pool.request().query(idx.sql);
      const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
      console.log(`criado (${segundos}s).`);
    } catch (err) {
      console.log(`ERRO: ${err.message}`);
    }
  }

  await pool.close();
  console.log("\nConcluído.");
}

main().catch((err) => {
  console.error("Falha geral:", err.message);
  process.exit(1);
});
