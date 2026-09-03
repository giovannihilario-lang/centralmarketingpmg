import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const [suppliersHtml,s360,demandasHtml,demandas,centralCore,central,migration,rollback,css] = await Promise.all([
  read('public/fornecedores.html'), read('public/assets/fornecedor-360.js'), read('public/demandas.html'), read('public/assets/demandas-v2.js'),
  read('public/assets/central-hoje-core.js'), read('public/assets/central-hoje.js'), read('sql/26-FORNECEDOR-IDENTIDADE-WAVE1B.sql'),
  read('sql/26-ROLLBACK-FORNECEDOR-IDENTIDADE-WAVE1B.sql'), read('public/assets/fornecedor-360.css'),
]);

assert.match(suppliersHtml,/fornecedor-360\.css/);
assert.match(suppliersHtml,/fornecedor-360\.js/);
assert.match(suppliersHtml,/PMGFornecedor360\?\.open/);
assert.doesNotMatch(suppliersHtml,/params\.get\('fornecedor'\)[\s\S]{0,250}abrirModalEditar/,'Deep link não pode voltar a abrir edição em vez do 360');

for (const label of ['Visão Geral','Comercial','Financeiro','Campanhas','Demandas','Documentos','Catálogo','Contatos','Histórico']) assert.ok(s360.includes(label),`Fornecedor 360 sem seção ${label}`);
assert.match(s360,/safe\('Financeiro'/);
assert.match(s360,/safe\('Demandas'/);
assert.match(s360,/safe\('Documentos'/);
assert.match(s360,/Ver composição/);
assert.match(s360,/Sem merge automático/);
assert.match(s360,/Dados comerciais temporariamente indisponíveis|temporariamente indisponível/);
assert.match(s360,/America\/Sao_Paulo/);

assert.match(demandasHtml,/id="itemSupplier"/);
assert.match(demandasHtml,/id="editTaskSupplier"/);
assert.match(demandasHtml,/id="taskSupplierFilter"/);
assert.match(demandas,/vincular_tarefa_fornecedor_v1/);
assert.match(demandas,/fornecedor_id/);
assert.match(demandas,/fornecedores\.html\?fornecedor=/);
assert.match(demandas,/supplierLinkWarningV1B/);
assert.match(demandas,/nova.*openQuickAdd|openQuickAdd\('demanda',\{supplierId\}\)/s);

assert.match(centralCore,/supplierIdentities/);
assert.match(centralCore,/Alias reconhecido/);
assert.match(centralCore,/fornecedores\.html\?fornecedor=/);
assert.match(central,/loadSupplierIdentities/);

assert.match(migration,/create table if not exists public\.fornecedor_identidades/);
assert.match(migration,/add column if not exists fornecedor_id bigint references public\.fornecedores/);
assert.match(migration,/enable row level security/);
assert.match(migration,/grant select on public\.fornecedor_identidades to authenticated/);
assert.match(migration,/revoke all on public\.fornecedor_identidades from anon, authenticated/);
assert.match(migration,/vincular_tarefa_fornecedor_v1/);
assert.match(migration,/idx_fornecedor_identidades_ativas_unicas/);
assert.match(migration,/estado in \('sugerido','confirmado','rejeitado'\)/);
assert.match(rollback,/drop table if exists public\.fornecedor_identidades/);
assert.match(rollback,/drop column if exists fornecedor_id/);
assert.match(css,/@media \(max-width:\s*768px\)/);
assert.match(css,/:focus-visible/);

console.log('WAVE1B_CONTRACTS: PASS');
console.log('Contratos: Fornecedor 360, Demandas, Ctrl+K, Data Quality, lineage, RLS/migration e rollback.');
