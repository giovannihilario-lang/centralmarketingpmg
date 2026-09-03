import assert from 'node:assert/strict';
import {
  buildSupplierIdentityIndex,
  buildSupplierQualityIssues,
  normalizeSupplierText,
  resolveSupplierIdentity,
  suggestSupplierMatches,
} from '../public/assets/supplier-identity-core.js';
import { buildSupplierFinanceComposition } from '../public/assets/financial-lineage-core.js';
import { searchLocalEntities } from '../public/assets/central-hoje-core.js';
import { linkTaskSupplier } from '../public/assets/supplier-identity-service.js';

const suppliers = [
  { id:1, nome:'McCain do Brasil', cnpj:'12.345.678/0001-90' },
  { id:2, nome:'Café São Paulo', cnpj:'98.765.432/0001-10' },
  { id:3, nome:'Alfa Food Service', cnpj:null },
];
const identities = [
  { id:'a1', fornecedor_id:1, tipo:'codigo', origem:'sql_comercial', valor_original:'1234', valor_normalizado:'1234', estado:'confirmado' },
  { id:'a2', fornecedor_id:1, tipo:'alias', origem:'manual', valor_original:'Mc Cain', valor_normalizado:'mc cain', estado:'confirmado' },
  { id:'a3', fornecedor_id:1, tipo:'nome', origem:'documentos', valor_original:'MCCAIN FOODS', valor_normalizado:'mccain foods', estado:'confirmado' },
  { id:'a4', fornecedor_id:2, tipo:'alias', origem:'manual', valor_original:'Cafe SP', valor_normalizado:'cafe sp', estado:'sugerido' },
];
const index = buildSupplierIdentityIndex(suppliers, identities);

assert.equal(resolveSupplierIdentity({ masterId:1 }, index).supplier.id, 1, 'ID canônico precisa ser a prioridade máxima');
assert.equal(resolveSupplierIdentity({ code:' 1234 ', source:'sql_comercial' }, index).supplier.id, 1, 'Código confirmado precisa resolver');
assert.equal(resolveSupplierIdentity({ cnpj:'12.345.678/0001-90' }, index).supplier.id, 1, 'CNPJ canônico precisa resolver');
assert.equal(resolveSupplierIdentity({ name:'Mc Cain' }, index).supplier.id, 1, 'Alias confirmado precisa resolver');
assert.equal(resolveSupplierIdentity({ name:'  MCCAIN   DO BRASIL ' }, index).supplier.id, 1, 'Caixa e espaços não podem quebrar nome canônico');
assert.equal(resolveSupplierIdentity({ name:'CAFE SAO PAULO' }, index).supplier.id, 2, 'Acentos não podem quebrar nome canônico');
assert.equal(resolveSupplierIdentity({ name:'Fornecedor inexistente' }, index).status, 'unresolved', 'Fornecedor desconhecido deve permanecer não resolvido');

const ambiguousIndex = buildSupplierIdentityIndex([
  { id:10, nome:'Café Bom' }, { id:11, nome:'Cafe Bom' },
], []);
const ambiguous = resolveSupplierIdentity({ name:'cafe bom' }, ambiguousIndex);
assert.equal(ambiguous.status, 'ambiguous', 'Nomes canônicos colidentes precisam ser ambíguos');
assert.equal(ambiguous.candidates.length, 2);

const fuzzyResult = resolveSupplierIdentity({ name:'Alfa Foods' }, index);
assert.equal(fuzzyResult.status, 'unresolved', 'Similaridade nunca pode fazer merge automático');
const fuzzySuggestions = suggestSupplierMatches('Alfa Foods', suppliers, { threshold:0.5 });
assert.ok(fuzzySuggestions.some(item => item.supplier.id === 3), 'Similaridade deve aparecer apenas como sugestão revisável');

const duplicatedAliasIndex = buildSupplierIdentityIndex(
  [{id:21,nome:'Fornecedor A'}, {id:22,nome:'Fornecedor B'}],
  [
    {fornecedor_id:21,tipo:'alias',origem:'erp_a',valor_original:'Mesmo Alias',valor_normalizado:'mesmo alias',estado:'confirmado'},
    {fornecedor_id:22,tipo:'alias',origem:'erp_b',valor_original:'Mesmo Alias',valor_normalizado:'mesmo alias',estado:'confirmado'},
  ]
);
assert.equal(resolveSupplierIdentity({name:'Mesmo Alias'}, duplicatedAliasIndex).status, 'ambiguous', 'Aliases confirmados conflitantes entre fontes não podem escolher fornecedor arbitrariamente');
const conflictingIssues=buildSupplierQualityIssues({suppliers:duplicatedAliasIndex.suppliers,identities:duplicatedAliasIndex.identities});
assert.ok(conflictingIssues.some(item=>item.type==='conflicting_confirmed_identity'),'Identidades confirmadas conflitantes precisam aparecer na Qualidade dos Dados');

const issues = buildSupplierQualityIssues({
  suppliers,
  identities,
  externalRecords:[
    {source:'acompanhamento',entityType:'financeiro',entityId:'r1',name:'McCain do Brasil',code:'9999'},
    {source:'documentos',entityType:'documento',entityId:'d1',name:'Alfa Food Servic'},
  ],
});
assert.ok(issues.some(item => item.type === 'pending_alias'), 'Alias sugerido precisa aparecer para revisão');
assert.ok(issues.some(item => item.type === 'unmapped_code'), 'Código não mapeado precisa aparecer na qualidade');
assert.ok(issues.some(item => item.type === 'unresolved_identity' && item.fuzzySuggestions?.length), 'Fuzzy deve gerar problema revisável, não merge');


const searchByAlias = searchLocalEntities('mccain foods', { suppliers, supplierIdentities:identities, tasks:[], campaigns:[] });
assert.equal(searchByAlias.filter(item => item.type === 'Fornecedor').length,1,'Ctrl+K deve deduplicar aliases no fornecedor canônico');
assert.match(searchByAlias.find(item => item.type === 'Fornecedor').href,/fornecedor=1$/);
assert.equal(searchByAlias.find(item => item.type === 'Fornecedor').title,'McCain do Brasil');

let linkedPayload = null;
await linkTaskSupplier({ rpc:async (name,payload) => { linkedPayload={name,payload}; return {error:null}; } }, 'task-1', 1);
assert.deepEqual(linkedPayload,{name:'vincular_tarefa_fornecedor_v1',payload:{p_tarefa_id:'task-1',p_fornecedor_id:1}},'Vínculo persistente deve usar a RPC canônica');

const records = [
  {id:'r1',valor_acordado:1000,impacta_totais:true},
  {id:'r2',valor_acordado:500,impacta_totais:true},
  {id:'r3',valor_acordado:999,impacta_totais:false},
];
const payments = [
  {id:'p1',registro_id:'r1',valor_previsto:400,valor_pago:400,status:'pago',vencimento:'2026-08-15'},
  {id:'p2',registro_id:'r1',valor_previsto:300,valor_pago:0,status:'previsto',vencimento:'2026-08-20'},
  {id:'p3',registro_id:'r2',valor_previsto:200,valor_pago:0,status:'pago',vencimento:'2026-09-10'},
];
const lineage = buildSupplierFinanceComposition(records,payments,{today:'2026-09-02'});
assert.equal(lineage.totalFollowed,1500);
assert.equal(lineage.totalRealized,600);
assert.equal(lineage.totalOutstanding,900);
assert.equal(lineage.totalOverdue,300);
assert.equal(lineage.rows.reduce((sum,row)=>sum+row.followed,0),lineage.totalFollowed,'Total exibido precisa ser a soma da composição');
assert.equal(normalizeSupplierText('  Café  São-Paulo  '),'cafe sao paulo');

console.log('FORNECEDOR_IDENTIDADE: PASS');
console.log(`Casos: identidade canônica, código, CNPJ, aliases, ambiguidade, fuzzy revisável, qualidade e lineage financeiro.`);
