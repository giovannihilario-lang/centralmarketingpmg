import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  buildHomeMetrics,
  buildOperationalAlerts,
  campaignState,
  dateKey,
  daysBetween,
  normalizeText,
  searchLocalEntities,
  snapshotFreshness,
  summarizeAlerts,
} from '../public/assets/central-hoje-core.js';

const now = new Date('2026-09-02T15:00:00-03:00');
const me = { id:'me', role:'colaborador' };
const tasks = [
  { id:'t1', titulo:'Material McCain', status:'andamento', prioridade:'alta', responsavel_id:'me', prazo:'2026-09-01' },
  { id:'t2', titulo:'Publicar campanha', status:'nova', prioridade:'imediata', responsavel_id:'other', prazo:'2026-09-03' },
  { id:'t3', titulo:'Revisar catálogo', status:'andamento', prioridade:'media', responsavel_id:'other', prazo:'2026-09-02' },
];
const executors = [
  { tarefa_id:'t2', colaborador_id:'me' },
  { tarefa_id:'t3', colaborador_id:'me' },
];
const payments = [
  { id:'p1', registro_id:'r1', status:'previsto', vencimento:'2026-09-01', valor_previsto:1200, valor_pago:0, registro:{ fornecedor:'McCain' } },
  { id:'p2', registro_id:'r2', status:'agendado', vencimento:'2026-09-04', valor_previsto:500, valor_pago:100, registro:{ fornecedor:'Camil' } },
  { id:'p3', registro_id:'r3', status:'pago', vencimento:'2026-09-01', valor_previsto:999, valor_pago:999 },
];
const documents = [
  { id:'d1', entrada_id:'e1', status:'aguardando_conferencia', criado_em:'2026-09-01T10:00:00-03:00', entrada:{ nome_arquivo:'mccain.pdf' } },
];
const suppliers = [
  { id:'s1', nome:'McCain Foods', status:'ativo', ultimo_upload:null, categoria:'Congelados' },
  { id:'s2', nome:'Camil', status:'ativo', ultimo_upload:'2026-09-01T12:00:00Z' },
];
const campaigns = [
  { id:'c1', name:'McCain Setembro', start:'2026-08-31', end:'2026-09-03', suppliers:[{ name:'McCain' }] },
  { id:'c2', name:'Camil Outubro', start:'2026-09-04', end:'2026-10-05' },
];
const snapshot = { ready:true, day:'2026-09-02', stale:false, updatedAt:'2026-09-02T08:02:00-03:00' };

assert.equal(normalizeText('  São João & McCain  '), 'sao joao & mccain');
assert.equal(dateKey(now), '2026-09-02');
assert.equal(daysBetween('2026-09-02', '2026-09-04'), 2);
assert.equal(campaignState(campaigns[0], '2026-09-02').id, 'active');
assert.equal(snapshotFreshness(snapshot, '2026-09-02').level, 'ok');
assert.equal(snapshotFreshness({ ...snapshot, day:'2026-09-01' }, '2026-09-02').level, 'warning');

const alerts = buildOperationalAlerts({ now, me, tasks, executors, payments, documents, suppliers, campaigns, snapshot });
const ids = new Set(alerts.map(item => item.id));
assert(ids.has('task-overdue:t1'), 'demanda atrasada deveria gerar alerta');
assert(ids.has('task-immediate:t2'), 'executor de demanda imediata deveria receber alerta');
assert(ids.has('task-today:t3'), 'prazo de hoje deveria gerar alerta');
assert(ids.has('payment-overdue:p1'), 'pagamento vencido deveria gerar alerta');
assert(ids.has('payment-soon:p2'), 'pagamento próximo deveria gerar alerta');
assert(ids.has('document:e1'), 'documento pendente deveria gerar alerta');
assert(ids.has('campaign-end:c1'), 'campanha terminando deveria gerar alerta');
assert(ids.has('campaign-start:c2'), 'campanha iniciando deveria gerar alerta');
assert(ids.has('suppliers-without-upload'), 'fornecedor sem upload deveria gerar alerta agregado');
assert.equal([...ids].filter(id => id.startsWith('task-') && id.endsWith(':t2')).length, 1, 'uma tarefa não deve gerar alertas conflitantes');

const summary = summarizeAlerts(alerts);
assert(summary.total === alerts.length && summary.critical >= 3 && summary.important >= 3);

const metrics = buildHomeMetrics({ now, me, tasks, executors, payments, documents, suppliers, campaigns });
assert.deepEqual(metrics, {
  overdueTasks:1,
  paymentDue:2,
  pendingDocuments:1,
  suppliersPending:1,
  campaignsEnding:1,
});

const results = searchLocalEntities('mccain', {
  tasks,
  suppliers,
  campaigns,
  representatives:[{ id:'rep1', name:'José McCain' }],
  products:[{ id:123, name:'SureCrisp McCain', supplierName:'McCain' }],
});
assert(results.some(item => item.type === 'Demanda' && item.href.includes('tarefa=t1')));
assert(results.some(item => item.type === 'Fornecedor' && item.href.includes('fornecedor=s1')));
assert(results.some(item => item.type === 'Campanha' && item.href.includes('campanha=c1')));
assert(results.some(item => item.type === 'Representante' && item.href.includes('view=representatives')));
assert(results.some(item => item.type === 'Produto' && item.href.includes('view=products')));
assert.equal(searchLocalEntities('m', { suppliers }).length, 0, 'busca de 1 caractere deve ser ignorada');

const managerAlerts = buildOperationalAlerts({
  now,
  me:{ id:'gestor', role:'gestor' },
  tasks:[{ id:'review', titulo:'Aprovar peça', status:'revisao', avaliacao_status:'pendente', prazo:'2026-09-01' }],
});
assert.equal(managerAlerts[0]?.id, 'task-review:review');


const [centralHtml, centralUi, acompanhamentoJs, documentosJs, fornecedoresHtml, campanhasJs, catalogAlias] = await Promise.all([
  readFile(new URL('../public/central.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/assets/central-hoje.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/assets/acompanhamento.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/assets/acompanhamento-documentos.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/fornecedores.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/assets/campanhas-studio-v5.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/ferramentas/catalogo.html', import.meta.url), 'utf8'),
]);
assert(centralHtml.includes('id="todayMetrics"') && centralHtml.includes('id="globalSearchDialog"'), 'Central de Hoje deve renderizar métricas e busca global');
assert(centralHtml.includes('/assets/central-hoje.js') && !centralHtml.includes('chart.js'), 'Home não deve carregar Chart.js sem uso');
assert(centralHtml.includes('@media(max-width:900px)') && centralHtml.includes('.nav{display:none}'), 'Central deve ter adaptação mobile da navegação');
assert(centralHtml.includes('.header-button{min-width:44px;min-height:44px') && centralHtml.includes('.filter-chip{min-height:40px'), 'Controles móveis principais devem preservar alvos de toque adequados');
assert(centralUi.includes("http://localhost:3001/api/dados-diarios?acao=status"), 'Central deve consultar saúde/frescor do PMG Bridge');
assert(acompanhamentoJs.includes("INITIAL_PARAMS.get('registro')") && acompanhamentoJs.includes("INITIAL_PARAMS.get('documento')"), 'Acompanhamento deve aceitar deep links');
assert(documentosJs.includes('context.initialDocumentId'), 'Documentos deve respeitar o deep link recebido');
assert(fornecedoresHtml.includes("params.get('fornecedor')") && fornecedoresHtml.includes("params.get('status')"), 'Fornecedores deve aceitar deep links e filtros');
assert(campanhasJs.includes("params.get('campanha')") && campanhasJs.includes("params.get('busca')"), 'Campanhas deve aceitar deep links da busca global');
assert(catalogAlias.includes("/catalogo.html${location.search || ''}${location.hash || ''}"), 'Rota histórica do catálogo deve apontar para a implementação atual');

console.log('CENTRAL_HOJE_CORE: PASS');
console.log(JSON.stringify({ alerts:summary, metrics, searchResults:results.length }, null, 2));
