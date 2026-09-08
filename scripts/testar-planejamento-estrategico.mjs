import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  normalizeKpis,
  periodShift,
  detectRegionalOpportunities,
  detectDimensionOpportunities,
  projectProgress, projectMetricValue,
} from '../public/assets/estrategia-core.js';

const read = file => readFile(new URL(`../${file}`, import.meta.url), 'utf8');
const [html, app, core, css, migration, rollback, customersApi, central, pkgText] = await Promise.all([
  read('public/planejamento-estrategico.html'),
  read('public/assets/estrategia.js'),
  read('public/assets/estrategia-core.js'),
  read('public/assets/estrategia.css'),
  read('sql/28-PLANEJAMENTO-ESTRATEGICO.sql'),
  read('sql/28-ROLLBACK-PLANEJAMENTO-ESTRATEGICO.sql'),
  read('local-api/estrategia-clientes.js'),
  read('public/central.html'),
  read('package.json'),
]);

assert.match(html, /Planejamento Estratégico/);
assert.match(html, /Exportar PPTX/);
assert.match(html, /projectCustomerId/);
assert.match(html, /value="clientes">Clientes positivados/);
assert.match(html, /pptxgen\.bundle\.js/);
assert.match(app, /\/agregado-cidades/);
assert.match(app, /\/agregado-por-dimensao/);
assert.match(app, /\/estrategia-clientes/);
assert.match(app, /Clientes positivados/);
assert.match(app, /criar_projeto_estrategico_v1/);
assert.match(app, /criar_demanda_estrategica_v1/);
assert.match(app, /metricEndpoint/);
assert.match(core, /detectRegionalOpportunities/);
assert.match(css, /presentation-stage/);

const htmlIds = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(htmlIds).size, htmlIds.length, 'HTML não deve ter IDs duplicados');
const domRefs = [...app.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]);
const missingDomIds = [...new Set(domRefs)].filter(id => !htmlIds.includes(id));
assert.deepEqual(missingDomIds, [], `IDs usados pelo JS e ausentes no HTML: ${missingDomIds.join(', ')}`);

const kpis = normalizeKpis({ total_valor: 100000, total_kg: 4000, n_pedidos: 20, n_cidades: 4, n_fornecedores: 8 });
assert.equal(kpis.ticket_medio, 5000);
assert.equal(projectMetricValue({ n_clientes: 42 }, 'clientes'), 42);
assert.deepEqual(periodShift('2026-01', '2026-01'), { de: '2025-12', ate: '2025-12' });

const regionals = detectRegionalOpportunities(
  [
    { cidade: 'A', uf: 'SP', valor: 100000, kg: 1000 },
    { cidade: 'B', uf: 'SP', valor: 50000, kg: 600 },
    { cidade: 'C', uf: 'SP', valor: 10000, kg: 200 },
  ],
  [
    { cidade: 'A', uf: 'SP', valor: 110000, kg: 1100 },
    { cidade: 'B', uf: 'SP', valor: 90000, kg: 800 },
    { cidade: 'C', uf: 'SP', valor: 20000, kg: 250 },
  ],
  { minRevenue: 10000, max: 10 },
);
assert.ok(regionals.some(item => item.kind === 'regional'));

const dimensions = detectDimensionOpportunities(
  [{ chave: 'Congelados', total: 180000 }],
  [{ chave: 'Congelados', total: 120000 }],
  'categoria',
  { minRevenue: 100000, max: 5 },
);
assert.ok(dimensions.some(item => /Congelados/.test(item.title)));

const progress = projectProgress(
  { meta_indicador: 'faturamento', meta_tipo: 'percentual', meta_valor: 20, inicio: '2026-09-01', fim: '2026-11-30', baseline: { total_valor: 100 } },
  { total_valor: 125 },
  new Date('2026-09-10T12:00:00-03:00'),
);
assert.equal(Math.round(progress.delta), 25);
assert.equal(progress.health, 'atingido');

for (const table of ['estrategia_oportunidades','estrategia_projetos','estrategia_acoes','estrategia_medicoes','estrategia_revisoes']) {
  assert.match(migration, new RegExp(`create table if not exists public\\.${table}`));
}
assert.match(migration, /estrategia_projeto_preservar_baseline_v1/);
assert.match(migration, /Baseline e autoria do projeto estratégico são imutáveis/);
assert.match(migration, /enable row level security/);
assert.match(migration, /revoke all on function public\.criar_projeto_estrategico_v1/);
assert.match(migration, /grant execute on function public\.criar_demanda_estrategica_v1/);
assert.match(rollback, /drop table if exists public\.estrategia_projetos cascade/);

assert.match(customersApi, /dbo\.Vendas/);
assert.match(customersApi, /dbo\.Clientes/);
assert.match(customersApi, /currentCustomers/);
assert.match(customersApi, /reativacao/);
assert.match(customersApi, /queda superior a 40%/);
assert.match(customersApi, /dbo\.VendasProdutos/);
assert.match(customersApi, /dbo\.Produtos/);
assert.match(customersApi, /p_grupo/);
assert.match(customersApi, /positivity/);
assert.doesNotMatch(customersApi, /SQL_PASSWORD\s*=|SUPABASE_SERVICE_ROLE_KEY\s*=/);

assert.match(central, /<strong>Planejamento Estratégico<\/strong>/);
assert.match(central, />Planejamento Estratégico<\/a>/);
const pkg = JSON.parse(pkgText);
assert.equal(pkg.scripts?.['estrategia:testar'], 'node scripts/testar-planejamento-estrategico.mjs');

console.log('PLANEJAMENTO_ESTRATEGICO: PASS');
