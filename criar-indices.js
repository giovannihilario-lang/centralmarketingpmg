import { getPool } from './src/lib/db.js';

// Antes deste ajuste, este script tinha sua PRÓPRIA config de conexão,
// lendo process.env.SQL_SERVER/SQL_DATABASE direto (sem o .trim() que
// src/lib/db.js aplica). Um espaço sobrando em alguma dessas variáveis no
// .env fazia o driver cair no banco padrão do login (não o configurado) —
// por isso toda tabela dava "Cannot find the object ... dbo.Vendas" mesmo
// a conexão "funcionando". Reusar getPool() garante a mesma conexão (e a
// mesma config) que o resto da API já usa com sucesso.

const indices = [
  {
    nome: 'IX_VendasProdutos_Pedido',
    sql: `CREATE NONCLUSTERED INDEX IX_VendasProdutos_Pedido
          ON dbo.VendasProdutos ([ID Pedido de Venda])
          INCLUDE (Valor, [Qtde Kg], [ID Produto])`,
  },
  {
    nome: 'IX_VendasProdutos_Produto',
    sql: `CREATE NONCLUSTERED INDEX IX_VendasProdutos_Produto
          ON dbo.VendasProdutos ([ID Produto])
          INCLUDE (Valor, [Qtde Kg], [ID Pedido de Venda])`,
  },
  {
    nome: 'IX_Vendas_Cliente',
    sql: `CREATE NONCLUSTERED INDEX IX_Vendas_Cliente
          ON dbo.Vendas ([ID Cliente])
          INCLUDE (Data)`,
  },
  {
    nome: 'IX_Vendas_Data',
    sql: `CREATE NONCLUSTERED INDEX IX_Vendas_Data
          ON dbo.Vendas (Data)
          INCLUDE ([ID Cliente])`,
  },
  {
    nome: 'IX_Clientes_Zona',
    sql: `CREATE NONCLUSTERED INDEX IX_Clientes_Zona
          ON dbo.Clientes (Zona)
          INCLUDE (Cidade, UF, [ID Cliente])`,
  },
  {
    nome: 'IX_Clientes_UF',
    sql: `CREATE NONCLUSTERED INDEX IX_Clientes_UF
          ON dbo.Clientes (UF)
          INCLUDE (Cidade, Zona, [ID Cliente])`,
  },
  {
    nome: 'IX_Clientes_Segmento',
    sql: `CREATE NONCLUSTERED INDEX IX_Clientes_Segmento
          ON dbo.Clientes (Segmento)
          INCLUDE ([ID Cliente])`,
  },
  {
    nome: 'IX_Produtos_Grupo',
    sql: `CREATE NONCLUSTERED INDEX IX_Produtos_Grupo
          ON dbo.Produtos (Grupo)
          INCLUDE ([ID Produto], Fornecedor)`,
  },
  {
    nome: 'IX_Produtos_Fornecedor',
    sql: `CREATE NONCLUSTERED INDEX IX_Produtos_Fornecedor
          ON dbo.Produtos (Fornecedor)
          INCLUDE ([ID Produto], Grupo)`,
  },
];

async function existeIndice(pool, nome) {
  const result = await pool
    .request()
    .input('nome', nome)
    .query('SELECT 1 FROM sys.indexes WHERE name = @nome');
  return result.recordset.length > 0;
}

async function main() {
  console.log('Conectando no SQL Server (mesma pool da API)...');
  const pool = await getPool();
  console.log('Conectado. Criando índices (isso pode demorar alguns minutos)...\n');

  for (const idx of indices) {
    process.stdout.write(`- ${idx.nome} ... `);
    try {
      if (await existeIndice(pool, idx.nome)) {
        console.log('já existe, pulando.');
        continue;
      }
      const inicio = Date.now();
      const request = pool.request();
      request.timeout = 0; // criar índice em milhões de linhas pode demorar mais que o timeout padrão das outras consultas
      await request.query(idx.sql);
      const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
      console.log(`criado (${segundos}s).`);
    } catch (err) {
      console.log(`ERRO: ${err.message}`);
    }
  }

  console.log('\nConcluído.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Falha geral:', err.message);
  process.exit(1);
});
