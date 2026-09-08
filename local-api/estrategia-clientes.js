import { getPool, sql } from '../src/lib/db.js';

// Antes deste ajuste, este arquivo abria seu PRÓPRIO ConnectionPool (config
// duplicada, sem os nomes de fallback AZURE_SQL_* e sem o handler pool.on('error')
// que existe em src/lib/db.js). Isso criava uma segunda conexão persistente ao
// mesmo SQL Server (desperdício no plano limitado da Vercel) e, se a conexão
// caísse em produção, este endpoint ficava quebrado até reiniciar o processo —
// getPool() já resolve os dois problemas e é a mesma pool usada pelo resto da API.

function monthStart(value) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return new Date(Date.UTC(year, month - 1, 1));
}

function monthAfter(value) {
  const start = monthStart(value);
  if (!start) return null;
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
}

function previousMonthStart(value) {
  const start = monthStart(value);
  if (!start) return null;
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
}

function number(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ message: 'Método não permitido.' });

  const period = String(req.query.p_de || req.query.p_ate || '').trim();
  const customerId = String(req.query.p_cliente || '').trim() || null;
  const city = String(req.query.p_cidade || '').trim() || null;
  const uf = String(req.query.p_uf || '').trim().toUpperCase() || null;
  const group = String(req.query.p_grupo || '').trim() || null;
  const supplier = String(req.query.p_fornecedor || '').trim() || null;
  const currentStart = monthStart(period);
  const currentEnd = monthAfter(period);
  const previousStart = previousMonthStart(period);

  if (!currentStart || !currentEnd || !previousStart) {
    return res.status(400).json({ message: 'Informe p_de no formato YYYY-MM.' });
  }

  try {
    const db = await getPool();
    const request = db.request();
    request.input('currentStart', sql.Date, currentStart);
    request.input('currentEnd', sql.Date, currentEnd);
    request.input('previousStart', sql.Date, previousStart);
    request.input('customerId', sql.NVarChar(120), customerId);
    request.input('city', sql.NVarChar(160), city);
    request.input('uf', sql.NVarChar(20), uf);
    request.input('group', sql.NVarChar(180), group);
    request.input('supplier', sql.NVarChar(220), supplier);

    const result = await request.query(`
      IF OBJECT_ID('tempdb..#strategy_sales') IS NOT NULL DROP TABLE #strategy_sales;
      IF OBJECT_ID('tempdb..#strategy_current') IS NOT NULL DROP TABLE #strategy_current;
      IF OBJECT_ID('tempdb..#strategy_previous') IS NOT NULL DROP TABLE #strategy_previous;

      SELECT
        CAST(v.[ID Cliente] AS nvarchar(120)) AS customer_id,
        CAST(v.[Data] AS date) AS sale_date,
        CAST(v.[ID Pedido de Venda] AS nvarchar(120)) AS order_id,
        TRY_CONVERT(decimal(19,2), v.[Valor Total]) AS revenue,
        TRY_CONVERT(decimal(19,3), v.[Peso]) AS weight
      INTO #strategy_sales
      FROM dbo.Vendas v
      WHERE v.[ID Cliente] IS NOT NULL
        AND v.[Data] >= @previousStart
        AND v.[Data] < @currentEnd
        AND (@customerId IS NULL OR CAST(v.[ID Cliente] AS nvarchar(120)) = @customerId)
        AND (@city IS NULL OR EXISTS (
          SELECT 1
          FROM dbo.Clientes fc
          WHERE CAST(fc.[ID Cliente] AS nvarchar(120)) = CAST(v.[ID Cliente] AS nvarchar(120))
            AND LTRIM(RTRIM(CONVERT(nvarchar(160),fc.[Cidade]))) = @city
        ))
        AND (@uf IS NULL OR EXISTS (
          SELECT 1
          FROM dbo.Clientes fu
          WHERE CAST(fu.[ID Cliente] AS nvarchar(120)) = CAST(v.[ID Cliente] AS nvarchar(120))
            AND UPPER(LTRIM(RTRIM(CONVERT(nvarchar(20),fu.[UF])))) = @uf
        ))
        AND ((@group IS NULL AND @supplier IS NULL) OR EXISTS (
          SELECT 1
          FROM dbo.VendasProdutos vp
          INNER JOIN dbo.Produtos pr
            ON CAST(pr.[ID Produto] AS nvarchar(120)) = CAST(vp.[ID Produto] AS nvarchar(120))
          WHERE CAST(vp.[ID Pedido de Venda] AS nvarchar(120)) = CAST(v.[ID Pedido de Venda] AS nvarchar(120))
            AND (@group IS NULL OR LTRIM(RTRIM(CONVERT(nvarchar(180),pr.[Grupo]))) = @group)
            AND (@supplier IS NULL OR LTRIM(RTRIM(CONVERT(nvarchar(220),pr.[Fornecedor]))) = @supplier)
        ));

      SELECT
        customer_id,
        SUM(COALESCE(revenue,0)) AS revenue,
        SUM(COALESCE(weight,0)) AS kg,
        COUNT(DISTINCT order_id) AS orders
      INTO #strategy_current
      FROM #strategy_sales
      WHERE sale_date >= @currentStart AND sale_date < @currentEnd
      GROUP BY customer_id;

      SELECT
        customer_id,
        SUM(COALESCE(revenue,0)) AS revenue,
        SUM(COALESCE(weight,0)) AS kg,
        COUNT(DISTINCT order_id) AS orders
      INTO #strategy_previous
      FROM #strategy_sales
      WHERE sale_date >= @previousStart AND sale_date < @currentStart
      GROUP BY customer_id;

      WITH compared AS (
        SELECT
          COALESCE(c.customer_id,p.customer_id) AS customer_id,
          COALESCE(c.revenue,0) AS current_revenue,
          COALESCE(p.revenue,0) AS previous_revenue,
          COALESCE(c.orders,0) AS current_orders,
          COALESCE(p.orders,0) AS previous_orders
        FROM #strategy_current c
        FULL OUTER JOIN #strategy_previous p ON p.customer_id=c.customer_id
      )
      SELECT TOP (80)
        x.customer_id,
        COALESCE(
          NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(240),cl.[Nome Fantasia]))),''),
          CONVERT(nvarchar(240),cl.[Cliente]),
          'Cliente ' + x.customer_id
        ) AS customer_name,
        CONVERT(nvarchar(140),cl.[Cidade]) AS city,
        CONVERT(nvarchar(20),cl.[UF]) AS uf,
        CONVERT(nvarchar(180),cl.[Vendedor]) AS seller,
        x.current_revenue,
        x.previous_revenue,
        x.current_orders,
        x.previous_orders,
        CASE
          WHEN x.previous_revenue >= 5000 AND x.current_revenue = 0 THEN 'reativacao'
          WHEN x.previous_revenue >= 5000 AND x.current_revenue < x.previous_revenue * 0.60 THEN 'queda'
          ELSE 'outro'
        END AS signal_type
      FROM compared x
      OUTER APPLY (
        SELECT TOP (1)
          c0.[Nome Fantasia], c0.[Cliente], c0.[Cidade], c0.[UF], c0.[Vendedor]
        FROM dbo.Clientes c0
        WHERE CAST(c0.[ID Cliente] AS nvarchar(120)) = x.customer_id
        ORDER BY
          CASE WHEN NULLIF(LTRIM(RTRIM(CONVERT(nvarchar(240),c0.[Nome Fantasia]))),'') IS NULL THEN 1 ELSE 0 END,
          CONVERT(nvarchar(240),c0.[Nome Fantasia])
      ) cl
      WHERE (x.previous_revenue >= 5000 AND x.current_revenue = 0)
         OR (x.previous_revenue >= 5000 AND x.current_revenue < x.previous_revenue * 0.60)
      ORDER BY (x.previous_revenue - x.current_revenue) DESC;

      SELECT
        (SELECT COUNT_BIG(*) FROM #strategy_current) AS current_customers,
        (SELECT COUNT_BIG(*) FROM #strategy_previous) AS previous_customers,
        (SELECT COALESCE(SUM(revenue),0) FROM #strategy_current) AS current_revenue,
        (SELECT COALESCE(SUM(revenue),0) FROM #strategy_previous) AS previous_revenue,
        (SELECT COALESCE(SUM(kg),0) FROM #strategy_current) AS current_kg,
        (SELECT COALESCE(SUM(kg),0) FROM #strategy_previous) AS previous_kg,
        (SELECT COALESCE(SUM(orders),0) FROM #strategy_current) AS current_orders,
        (SELECT COALESCE(SUM(orders),0) FROM #strategy_previous) AS previous_orders;
    `);

    const rows = result.recordsets?.[0] || [];
    const summaryRow = result.recordsets?.[1]?.[0] || {};
    const opportunities = rows.slice(0, 40).map(row => {
      const previousRevenue = number(row.previous_revenue);
      const currentRevenue = number(row.current_revenue);
      const decline = previousRevenue > 0 ? ((currentRevenue / previousRevenue) - 1) * 100 : null;
      const reactivation = row.signal_type === 'reativacao';
      const customerName = String(row.customer_name || `Cliente ${row.customer_id}`);
      return {
        type: row.signal_type,
        customerId: String(row.customer_id),
        customerName,
        city: row.city || null,
        uf: row.uf || null,
        seller: row.seller || null,
        currentRevenue,
        previousRevenue,
        currentOrders: number(row.current_orders),
        previousOrders: number(row.previous_orders),
        declinePct: decline,
        score: reactivation ? 86 : Math.min(82, 55 + Math.abs(decline || 0) / 3),
        title: reactivation ? `Reativar ${customerName}` : `Recuperar queda de ${customerName}`,
        description: reactivation
          ? 'Cliente faturou no mês anterior e ainda não realizou compra no período atual. Sinal de reativação, não previsão de receita.'
          : `Faturamento caiu ${Math.abs(decline || 0).toFixed(1)}% contra o mês anterior. Sinal baseado em comportamento histórico.`,
      };
    });

    const currentOrders = number(summaryRow.current_orders);
    const previousOrders = number(summaryRow.previous_orders);
    return res.json({
      ok: true,
      source: 'SQL Server · dbo.Vendas + dbo.Clientes + dbo.VendasProdutos + dbo.Produtos',
      period,
      filters: { customerId, city, uf, group, supplier },
      summary: {
        currentCustomers: number(summaryRow.current_customers),
        previousCustomers: number(summaryRow.previous_customers),
      },
      currentKpis: {
        total_valor: number(summaryRow.current_revenue),
        total_kg: number(summaryRow.current_kg),
        n_pedidos: currentOrders,
        ticket_medio: currentOrders ? number(summaryRow.current_revenue) / currentOrders : 0,
        n_clientes: number(summaryRow.current_customers),
      },
      previousKpis: {
        total_valor: number(summaryRow.previous_revenue),
        total_kg: number(summaryRow.previous_kg),
        n_pedidos: previousOrders,
        ticket_medio: previousOrders ? number(summaryRow.previous_revenue) / previousOrders : 0,
        n_clientes: number(summaryRow.previous_customers),
      },
      opportunities,
      rules: {
        reactivation: 'faturamento anterior >= R$ 5.000 e faturamento atual = R$ 0',
        decline: 'faturamento anterior >= R$ 5.000 e queda superior a 40%',
        positivity: 'cliente único com pelo menos uma venda no período e no escopo filtrado',
      },
    });
  } catch (error) {
    console.error('[estrategia-clientes]', error);
    return res.status(error.status || 500).json({
      message: 'Não foi possível calcular os sinais de clientes no SQL Server.',
      detail: process.env.NODE_ENV === 'production' ? undefined : error.message,
    });
  }
}
