import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = {
  api: path.join(root, 'local-api', 'performance-comercial.js'),
  html: path.join(root, 'public', 'dashboard.html'),
  css: path.join(root, 'public', 'assets', 'performance-comercial.css'),
  js: path.join(root, 'public', 'assets', 'performance-comercial.js'),
};

for (const [name, file] of Object.entries(files)) {
  assert.ok(fs.existsSync(file), `${name}: arquivo ausente em ${file}`);
}

const api = fs.readFileSync(files.api, 'utf8');
const html = fs.readFileSync(files.html, 'utf8');
const css = fs.readFileSync(files.css, 'utf8');
const js = fs.readFileSync(files.js, 'utf8');

// Fontes reais confirmadas no Azure SQL.
for (const table of ['dbo.Clientes', 'dbo.Produtos', 'dbo.Vendas', 'dbo.VendasProdutos']) {
  assert.ok(api.includes(table), `API não referencia ${table}`);
}

// Contrato de agregação: pedido selecionado uma vez; itens agregados separadamente.
assert.ok(api.includes('WITH SelectedOrders AS'), 'Resumo deve selecionar pedidos antes de agregar itens.');
assert.ok(api.includes('ItemAgg AS'), 'Resumo deve agregar itens separadamente.');
assert.ok(api.includes('EXISTS ('), 'Filtro de produto deve selecionar pedidos via EXISTS.');
assert.ok(api.includes("regraFaturamento: productScoped ? 'itens_filtrados' : 'valor_total_pedido'"), 'Regra explícita de faturamento ausente.');
assert.ok(api.includes('PrevItemAgg AS'), 'Comparação anterior por vendedor precisa de agregação de itens quando houver filtro de produto.');

// Demonstração do bug que o contrato evita.
const pedido = { id: 123, valor: 10_000 };
const itens = Array.from({ length: 10 }, (_, i) => ({ pedidoId: 123, item: i + 1 }));
const somaErrada = itens.reduce((total) => total + pedido.valor, 0);
const pedidosUnicos = new Map([[pedido.id, pedido]]);
const somaCorreta = [...pedidosUnicos.values()].reduce((total, row) => total + row.valor, 0);
assert.equal(somaErrada, 100_000, 'Fixture de double counting inválida.');
assert.equal(somaCorreta, 10_000, 'Faturamento por pedido único deve permanecer R$ 10.000.');

// Recursos principais do endpoint.
for (const resource of [
  'filtros','resumo','vendedores','evolucao','carteira','clientes-risco',
  'clientes-recuperados','clientes-novos','fornecedores','gap-fornecedor','mix',
  'heatmap','vendedor-360','comparacao','atencao','diagnostico'
]) {
  assert.ok(api.includes(`case '${resource}'`) || api.includes(`'${resource}'`), `Recurso ${resource} não encontrado.`);
}

// Frontend autenticado e ligado ao endpoint correto.
assert.ok(html.includes('data-pmg-auth'), 'dashboard.html deve exigir sessão PMG Connect.');
assert.ok(html.includes('/assets/connect-auth.js?v=1.2.0'), 'connect-auth atual não foi incluído.');
assert.ok(html.includes('Performance Comercial'), 'Título do módulo ausente.');
assert.ok(js.includes('/api/performance-comercial'), 'Frontend não chama a API da Performance Comercial.');
assert.ok(js.includes('Authorization: `Bearer ${state.session?.access_token || \'\'}`'), 'Frontend não envia a sessão Bearer.');

// IDs estáticos usados pelo helper $(id) devem existir no HTML.
const htmlIds = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]));
const jsIds = new Set([...js.matchAll(/\$\(["']([^"']+)["']\)/g)].map(match => match[1]));
const missingIds = [...jsIds].filter(id => !htmlIds.has(id));
assert.deepEqual(missingIds, [], `IDs usados no JS e ausentes no HTML: ${missingIds.join(', ')}`);

// Contratos básicos de UX/responsividade.
assert.ok(/@media\s*\(max-width:\s*(650|760)px\)/.test(css), 'CSS mobile principal ausente.');
assert.ok(css.includes('@media print'), 'Estilo de impressão do relatório ausente.');
assert.ok(html.includes('id="sellerDialog"'), 'Vendedor 360 ausente.');
assert.ok(html.includes('id="attentionList"'), 'Central de atenção ausente.');
assert.ok(html.includes('id="heatmap"'), 'Heatmap de fornecedores ausente.');

console.log('PASS: Performance Comercial');
console.log('  ✓ fontes SQL confirmadas');
console.log('  ✓ contrato anti-double-counting');
console.log('  ✓ recursos principais da API');
console.log('  ✓ sessão autenticada no frontend');
console.log('  ✓ IDs HTML/JS consistentes');
console.log('  ✓ contratos de UX, mobile e impressão');
