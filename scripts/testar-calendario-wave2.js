import assert from 'node:assert/strict';
import fs from 'node:fs';
import { aggregateCalendarEvents, filterCalendarEvents } from '../public/assets/wave2-core.js';

const events=aggregateCalendarEvents({
  tasks:[{id:'t1',titulo:'Demanda McCain',status:'nova',prioridade:'alta',prazo:'2026-09-03',fornecedor_id:10,responsavel_id:'u1'}],
  campaigns:[{id:'c1',name:'Campanha Multi',startDate:'2026-09-04',endDate:'2026-09-10',supplierIds:['10','20']}],
  payments:[{id:'p1',registro_id:'r1',titulo:'Pagamento',vencimento:'2026-09-05',status:'pendente',fornecedor_id:'10'}],
  trainings:[{id:'a1',titulo:'Treinamento',inicio_em:'2026-09-06T09:00:00-03:00',ativo:true,fornecedor_id:20}],
  obligations:[{id:'o1',titulo:'Anúncio',prazo:'2026-09-07',status:'pendente',direcao_responsabilidade:'fornecedor',fornecedor_id:10}]
});
assert.equal(events.length,6,'deve agregar 1 demanda + 2 marcos campanha + pagamento + treinamento + obrigação');
assert.equal(filterCalendarEvents(events,{supplier:'10'}).length,5,'filtro canônico deve incluir campanha multi-fornecedor');
assert.equal(filterCalendarEvents(events,{source:'academia'}).length,1);
assert.equal(filterCalendarEvents(events,{from:'2026-09-05',to:'2026-09-07'}).length,3);
assert.ok(events.every(e=>e.href&&e.entityId),'todo evento precisa deep link e identidade original');

const src=fs.readFileSync(new URL('../public/assets/wave2-operacoes.js',import.meta.url),'utf8');
assert.match(src,/valor_previsto,valor_pago/,'consulta de pagamentos deve usar colunas reais');
assert.match(src,/fornecedor_identidades/,'calendário deve resolver aliases/identidade canônica');
assert.match(src,/searchParams\.get\('modo'\)/,'modo do calendário deve restaurar da URL');
assert.match(src,/max-width: 760px/,'mobile deve priorizar Agenda');
assert.match(src,/searchParams\.get\('obrigacao'\)/,'deep link de obrigação deve ser consumido');
console.log('CALENDARIO_WAVE2: PASS');
