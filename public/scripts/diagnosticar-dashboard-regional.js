import 'dotenv/config';
import { getPool } from '../src/lib/db.js';
import { CTE_BASE_REGIONAL, FROM_BASE_REGIONAL } from '../src/lib/regional-dashboard.js';

const pool = await getPool();

try {
  const resumo = await pool.request().query(`
    SELECT
      COUNT_BIG(*) AS linhas_clientes,
      COUNT(DISTINCT [ID Cliente]) AS ids_clientes,
      COUNT_BIG(*) - COUNT(DISTINCT [ID Cliente]) AS linhas_duplicadas_clientes
    FROM dbo.Clientes;

    SELECT
      COUNT_BIG(*) AS linhas_produtos,
      COUNT(DISTINCT [ID Produto]) AS ids_produtos,
      COUNT_BIG(*) - COUNT(DISTINCT [ID Produto]) AS linhas_duplicadas_produtos
    FROM dbo.Produtos;

    SELECT
      COUNT_BIG(*) AS linhas_vendas,
      COUNT(DISTINCT [ID Pedido de Venda]) AS ids_pedidos,
      COUNT_BIG(*) - COUNT(DISTINCT [ID Pedido de Venda]) AS linhas_duplicadas_vendas
    FROM dbo.Vendas;
  `);

  const comparacao = await pool.request().query(`
    SELECT
      SUM(vp.Valor) AS faturamento_join_antigo,
      COUNT_BIG(*) AS itens_join_antigo,
      COUNT(DISTINCT vp.[ID Pedido de Venda]) AS pedidos_join_antigo,
      CAST(SUM(vp.Valor) / NULLIF(CAST(COUNT(DISTINCT vp.[ID Pedido de Venda]) AS decimal(19,4)),0) AS decimal(19,2)) AS ticket_por_pedido_join_antigo,
      CAST(SUM(vp.Valor) / NULLIF(CAST(COUNT_BIG(*) AS decimal(19,4)),0) AS decimal(19,2)) AS media_por_linha_antiga
    FROM dbo.VendasProdutos vp
    JOIN dbo.Vendas v ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
    JOIN dbo.Clientes c ON v.[ID Cliente] = c.[ID Cliente]
    JOIN dbo.Produtos p ON vp.[ID Produto] = p.[ID Produto];

    ${CTE_BASE_REGIONAL}
    SELECT
      SUM(vp.Valor) AS faturamento_corrigido,
      COUNT_BIG(*) AS itens_corrigidos,
      COUNT(DISTINCT vp.[ID Pedido de Venda]) AS pedidos_corrigidos,
      CAST(SUM(vp.Valor) / NULLIF(CAST(COUNT(DISTINCT vp.[ID Pedido de Venda]) AS decimal(19,4)),0) AS decimal(19,2)) AS ticket_medio_por_pedido
    ${FROM_BASE_REGIONAL};
  `);

  const format = (r) => Object.fromEntries(Object.entries(r || {}).map(([k,v]) => [k, typeof v === 'bigint' ? v.toString() : v]));
  console.log('\n=== Integridade cadastral ===');
  console.table(resumo.recordsets.map(rs => format(rs[0])));
  console.log('\n=== Comparação do cálculo antigo x corrigido ===');
  console.table([
    { modelo: 'JOIN antigo', ...format(comparacao.recordsets[0][0]) },
    { modelo: 'Regional corrigido', ...format(comparacao.recordsets[1][0]) },
  ]);
  console.log('\nTicket médio correto = faturamento corrigido / pedidos distintos.');
} finally {
  // O pool compartilhado é mantido aberto no servidor, mas este arquivo é um comando avulso.
  await pool.close();
}
