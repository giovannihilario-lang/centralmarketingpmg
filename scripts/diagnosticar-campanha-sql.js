/**
 * Uso:
 *   node scripts/diagnosticar-campanha-sql.js 1551 2026-07-06
 *
 * Requer `npm start` aberto.
 */

const supplierId = Number(process.argv[2]);
const campaignStart = process.argv[3];

if (!Number.isFinite(supplierId) || !/^\d{4}-\d{2}-\d{2}$/.test(campaignStart || '')) {
  console.error('Uso: node scripts/diagnosticar-campanha-sql.js <ID_FORNECEDOR> <AAAA-MM-DD>');
  process.exit(1);
}

const response = await fetch('http://localhost:3001/api/campanhas-data?recurso=diagnostico-consistencia', {
  method:'POST',
  headers:{ 'Content-Type':'application/json' },
  body:JSON.stringify({
    supplierIds:[supplierId],
    productIds:[],
    sellers:[],
    campaignStart,
    asOfDate:new Date().toISOString().slice(0,10),
  }),
});

const data = await response.json();

if (!response.ok) {
  console.error(data);
  process.exit(1);
}

console.log('\nPERÍODOS');
console.table(data.periodsUsed);

console.log('\nCATÁLOGO DO FORNECEDOR');
console.table(data.catalog);

console.log('\nCOMPARAÇÃO DOS MODOS');
console.table((data.totals || []).map((row) => ({
  modo:row.mode,
  periodo:row.period,
  kg:Number(row.kg).toFixed(1),
  faturamento:Number(row.revenue).toFixed(2),
  clientes:row.customers,
  pedidos:row.orders,
  produtos:row.products,
  vendedores:row.sellers,
})));

console.log('\nCAUSAS DETECTADAS');
for (const cause of data.causes || []) {
  console.log(`- [${cause.severity}] ${cause.code}: ${cause.message}`);
}

console.log('\nVOLUME POR STATUS DO PRODUTO');
console.table(data.statusBreakdown || []);

console.log('\nTIPOS / FORMAS DE VENDA');
console.table(data.saleBreakdown || []);
