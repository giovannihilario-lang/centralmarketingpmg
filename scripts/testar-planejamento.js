import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const appPath = new URL('../public/assets/acompanhamento.js', import.meta.url);
const original = fs.readFileSync(appPath, 'utf8');
const boot = "ReactDOM.createRoot(document.getElementById('root')).render(html`<${AppErrorBoundary}><${App}/></${AppErrorBoundary}>`);";
const contextMarker = '    useLucide([view, mobileNav, commandOpen, loading, error, setupMissing, selectedId, recordModal, paymentModal, toast, filteredRecords.length]);';
assert.ok(original.includes(boot) && original.includes(contextMarker), 'Pontos de teste da Central não encontrados.');
const code = original.replace(boot, 'globalThis.__TEST__ = { sum, buildPlanningSnapshot, fetchAll, App };')
  .replace(contextMarker, 'globalThis.__ACTIONS__ = { ...context, setData, setClient }; return null;');
const noop = () => {};
const hooks = [];
let cursor = 0;
const sandbox = {
  console, Intl, Date, URLSearchParams, Set, Map,
  location:{ search:'' }, document:{}, localStorage:{ getItem:() => null },
  setTimeout:() => 1, clearTimeout:noop, requestAnimationFrame:noop, cancelAnimationFrame:noop,
  React:{
    Component:class {}, createElement:noop, useCallback:fn => fn, useEffect:noop, useMemo:fn => fn(),
    useState(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
      return [hooks[index], value => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!(index in hooks)) hooks[index] = { current:initial };
      return hooks[index];
    },
  },
  htm:{ bind:() => noop }, ReactDOM:{ createRoot:() => ({ render:noop }) },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(code, sandbox, { filename:appPath.pathname });
const { sum, buildPlanningSnapshot, fetchAll, App } = sandbox.__TEST__;
function render() { cursor = 0; App(); return sandbox.__ACTIONS__; }
const cents = value => Math.round(Number(value) * 100);
const clone = value => JSON.parse(JSON.stringify(value));

// Reproduz o defeito: a soma antiga não encaminhava o índice ao seletor.
assert.equal(sum([10, 20], (_, index) => [10, 20][index]), 30);

const source = JSON.parse(fs.readFileSync(new URL('../data/acompanhamento-carga-inicial.json', import.meta.url), 'utf8'));
const records = source.items.map((item, index) => ({ ...clone(item.registro), id:`r-${String(index).padStart(5, '0')}` }));
const payments = source.items.flatMap((item, index) => (item.pagamentos || []).map((payment, paymentIndex) => ({
  ...clone(payment), id:`p-${String(index).padStart(5, '0')}-${paymentIndex}`, registro_id:records[index].id,
})));
const baseline = buildPlanningSnapshot(records, payments);
assert.equal(baseline.planning.length, 15);
assert.equal(cents(baseline.grandTotal), 261037768);
assert.equal(cents(baseline.paidTotal), 174081768);
assert.equal(cents(baseline.remainingTotal), 86956000);
assert.ok(baseline.columnTotals.every(value => value > 0));
assert.equal(cents(sum(baseline.monthTotals, value => value)), cents(baseline.grandTotal));
assert.equal(cents(buildPlanningSnapshot(records, []).grandTotal), cents(baseline.grandTotal));

// Simula o limite real de 1.000 linhas do PostgREST sem acessar a produção.
const server = { records:clone(records), payments:clone(payments), reads:[], failTable:null, failRpc:null };
function tableRows(name) {
  if (name === 'acompanhamento_painel' || name === 'acompanhamento_registros') return server.records;
  if (name === 'acompanhamento_pagamentos') return server.payments;
  return [];
}
const db = {
  from(table) {
    const order = [];
    let start = 0; let end = 999;
    return {
      select() { return this; }, eq() { return this; },
      order(field, options = {}) { order.push([field, options.ascending !== false]); return this; },
      limit(count) { end = Math.min(count, 1000) - 1; return this; },
      range(from, to) { start = from; end = Math.min(to, from + 999); return this; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          server.reads.push({ table, start, end });
          if (server.failTable === table) return { data:null, error:{ message:'Falha simulada de atualização', code:'NETWORK_ERROR' } };
          const rows = [...tableRows(table)].sort((a, b) => {
            for (const [field, ascending] of order) {
              const compared = String(a[field] ?? '').localeCompare(String(b[field] ?? ''));
              if (compared) return ascending ? compared : -compared;
            }
            return 0;
          });
          return { data:clone(rows.slice(start, end + 1)), error:null };
        }).then(resolve, reject);
      },
    };
  },
  async rpc(name, args) {
    if (server.failRpc === name) return { data:null, error:{ message:'Falha simulada ao salvar' } };
    if (name === 'salvar_pagamento_acompanhamento_v1') {
      const id = args.p_pagamento_id || `p-new-${server.payments.length}`;
      const saved = { ...args.p_dados, id, registro_id:args.p_registro_id };
      const found = server.payments.find(item => item.id === id);
      if (found) Object.assign(found, saved); else server.payments.push(saved);
      return { data:id, error:null };
    }
    if (name === 'salvar_acompanhamento_v1') {
      const found = server.records.find(item => item.id === args.p_registro_id);
      assert.ok(found, 'Cadastro existente deve ser preservado.');
      Object.assign(found, args.p_dados);
      return { data:found.id, error:null };
    }
    throw new Error(`RPC não esperado: ${name}`);
  },
};

const loaded = await fetchAll(db);
assert.equal(loaded.records.length, records.length);
assert.equal(loaded.payments.length, payments.length);
assert.ok(server.reads.some(item => item.table === 'acompanhamento_pagamentos' && item.start >= 1000));
assert.ok(server.reads.some(item => item.table === 'acompanhamento_painel' && item.start >= 1000));
assert.equal(new Set(loaded.payments.map(item => item.id)).size, payments.length);

let actions = render();
actions.setClient(db); actions.setData(loaded); actions = render();
const fair = baseline.planning.find(item => item.referencia === 'Feiras/ eventos');
assert.ok(fair);
const june = baseline.paymentMap.get(`${fair.id}|5`);
assert.equal(Number(june.valor_previsto), 816400.56);
const sourceBefore = JSON.stringify(fair.dados_originais);
const notices = [];
// notify utiliza o estado de toast; as verificações abaixo observam também seu tom.
function currentSnapshot() {
  actions = render();
  return buildPlanningSnapshot(actions.allRecords, actions.payments);
}
async function editMonth(monthIndex, amount, paid) {
  const current = currentSnapshot();
  const record = actions.allRecords.find(item => item.id === fair.id);
  const payment = current.paymentMap.get(`${fair.id}|${monthIndex}`);
  return actions.quickUpsertPayment(record, payment, monthIndex, amount, {
    status:paid ? 'pago' : 'previsto', syncRecordTotal:true, fingerprintLabel:'planejamento',
  });
}

assert.equal(await editMonth(5, 816500.56, true), true);
let updated = currentSnapshot();
assert.equal(cents(updated.planningCellValue(fair, 5)), 81650056);
assert.equal(cents(updated.grandTotal - baseline.grandTotal), 10000);
assert.equal(cents(updated.paidTotal - baseline.paidTotal), 10000);
assert.equal(cents(updated.monthTotals[5] - baseline.monthTotals[5]), 10000);
const fairIndex = updated.planning.findIndex(item => item.id === fair.id);
assert.equal(cents(server.records.find(item => item.id === fair.id).valor_acordado), cents(updated.columnTotals[fairIndex]));
assert.equal(JSON.stringify(server.records.find(item => item.id === fair.id).dados_originais), sourceBefore);
assert.equal(server.payments.length, payments.length, 'Editar não deve duplicar a parcela.');

// Uma leitura nova, como F5, continua trazendo a alteração.
const reloaded = await fetchAll(db);
assert.equal(cents(buildPlanningSnapshot(reloaded.records, reloaded.payments).planningCellValue(fair, 5)), 81650056);

// Zero é uma edição válida: não pode ressuscitar o valor original.
assert.equal(await editMonth(5, 0, true), true);
updated = currentSnapshot();
assert.equal(updated.planningCellValue(fair, 5), 0);
assert.equal(cents(updated.grandTotal), cents(baseline.grandTotal - 816400.56));
assert.equal(cents(updated.paidTotal), cents(baseline.paidTotal - 816400.56));

// Preencher mês vazio soma apenas uma vez e não altera o total pago.
assert.equal(await editMonth(0, 1250, false), true);
updated = currentSnapshot();
assert.equal(updated.planningCellValue(fair, 0), 1250);
assert.equal(updated.planningCellPaid(fair, 0), false);
assert.equal(server.payments.length, payments.length + 1);
assert.equal(cents(updated.grandTotal), cents(baseline.grandTotal - 816400.56 + 1250));

// Falha de gravação não confirma uma edição que não aconteceu.
server.failRpc = 'salvar_pagamento_acompanhamento_v1';
assert.equal(await editMonth(0, 9999, false), false);
assert.equal(currentSnapshot().planningCellValue(fair, 0), 1250);
server.failRpc = null;

// Se a gravação funciona e a recarga falha, o valor confirmado permanece visível.
server.failTable = 'acompanhamento_pagamentos';
assert.equal(await editMonth(0, 1500, false), true);
assert.equal(currentSnapshot().planningCellValue(fair, 0), 1500);
const toast = hooks.find(value => value && typeof value === 'object' && typeof value.message === 'string' && value.tone === 'info');
assert.match(toast?.message || '', /Alteração salva/);
notices.push(toast.message);
server.failTable = null;

// Dados legados: total salvo inclui os meses visíveis da fonte mesmo sem parcelas.
server.records = clone(records);
server.payments = payments.filter(payment => payment.registro_id !== fair.id).map(clone);
actions.setData(await fetchAll(db)); actions = render();
assert.equal(await editMonth(5, 816500.56, true), true);
updated = currentSnapshot();
assert.equal(cents(updated.grandTotal), cents(baseline.grandTotal + 100));
assert.equal(cents(server.records.find(item => item.id === fair.id).valor_acordado), cents(updated.columnTotals[fairIndex]));

const unpaid = { ...june, status:'previsto', valor_pago:0 };
assert.equal(buildPlanningSnapshot([fair], [unpaid]).planningCellPaid(fair, 5), false);
const cancelled = { ...june, status:'cancelado' };
assert.equal(buildPlanningSnapshot([fair], [cancelled]).planningCellValue(fair, 5), 0);
const zeroSource = { ...fair, dados_originais:{ ...fair.dados_originais, valores_mensais:Array(12).fill(0) } };
assert.equal(buildPlanningSnapshot([zeroSource], []).grandTotal, 0);
const otherYear = { ...june, vencimento:'2025-06-30', valor_previsto:1 };
assert.equal(buildPlanningSnapshot([fair], [otherYear]).planningCellValue(fair, 5), 816400.56);

// Botões de pagamento usam o mesmo retrato da matriz, inclusive meses da fonte.
server.records = clone(records); server.payments = clone(payments);
actions.setData(await fetchAll(db)); actions = render();
const planningBeforeToggle = currentSnapshot();
const julyValue = planningBeforeToggle.planningCellValue(fair, 6);
assert.equal(planningBeforeToggle.planningCellPaid(fair, 6), false);
const duplicateClick = [actions.quickTogglePlanningPaid(fair, 6), actions.quickTogglePlanningPaid(fair, 6)];
assert.deepEqual(await Promise.all(duplicateClick), [true, false], 'Clique duplo não duplica a gravação.');
updated = currentSnapshot();
assert.equal(updated.planningCellPaid(fair, 6), true);
assert.equal(cents(updated.grandTotal), cents(baseline.grandTotal));
assert.equal(cents(updated.paidTotal), cents(baseline.paidTotal + julyValue));
assert.equal(cents(updated.remainingTotal), cents(baseline.remainingTotal - julyValue));
const paidJuly = updated.paymentMap.get(`${fair.id}|6`);
assert.equal(Number(paidJuly.valor_pago), julyValue);
const now = new Date();
const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
assert.equal(paidJuly.pago_em, today, 'Data real não deve ser inventada pelo vencimento.');
assert.equal(server.payments.length, payments.length);
assert.equal(await actions.quickTogglePlanningPaid(fair, 6), true);
updated = currentSnapshot();
assert.equal(updated.planningCellPaid(fair, 6), false);
assert.equal(Number(updated.paymentMap.get(`${fair.id}|6`).valor_pago), 0);
assert.equal(updated.paymentMap.get(`${fair.id}|6`).pago_em, '');
assert.equal(cents(updated.paidTotal), cents(baseline.paidTotal));
assert.equal(cents(updated.grandTotal), cents(baseline.grandTotal));
assert.equal(await actions.quickTogglePlanningPaid(fair, 0), false, 'Não permite dar baixa em um mês vazio.');
server.failRpc = 'salvar_pagamento_acompanhamento_v1';
assert.equal(await actions.quickTogglePlanningPaid(fair, 6), false);
assert.equal(currentSnapshot().planningCellPaid(fair, 6), false, 'Falha ao salvar não marca como pago.');
server.failRpc = null;

// Fonte vermelha sem parcela: reabrir cria uma única sobreposição explícita.
server.payments = payments.filter(payment => payment.registro_id !== fair.id).map(clone);
actions.setData(await fetchAll(db)); actions = render();
assert.equal(await actions.quickTogglePlanningPaid(fair, 5), true);
updated = currentSnapshot();
assert.equal(updated.planningCellPaid(fair, 5), false);
assert.equal(updated.planningCellValue(fair, 5), Number(june.valor_previsto));
assert.equal(cents(updated.grandTotal), cents(baseline.grandTotal));
assert.equal(cents(updated.paidTotal), cents(baseline.paidTotal - Number(june.valor_previsto)));
assert.equal(JSON.stringify(server.records.find(item => item.id === fair.id).dados_originais), sourceBefore);
const finalReload = await fetchAll(db);
assert.equal(buildPlanningSnapshot(finalReload.records, finalReload.payments).planningCellPaid(fair, 5), false);

const pageError = await sandbox.__TEST__.fetchAll({ from:() => ({
  select() { return this; }, order() { return this; }, eq() { return this; }, limit() { return this; },
  range() { return Promise.resolve({ data:null, error:new Error('Sem conexão') }); },
  then(resolve) { return Promise.resolve({ data:[], error:null }).then(resolve); },
}) }).then(() => null, error => error);
assert.ok(pageError, 'Uma falha de paginação não deve devolver uma base parcial como sucesso.');

console.log(JSON.stringify({ status:'ok', records:records.length, payments:payments.length,
  planningTotal:2610377.68, planningPaid:1740817.68,
  tested:['indices da soma', 'pagina além de 1000', 'edição paga', 'recarga', 'zero', 'mês vazio', 'falha ao salvar', 'falha ao recarregar', 'meses sem parcela', 'fonte preservada', 'status salvo', 'ano correto', 'marcar pago', 'reabrir', 'clique duplo', 'data real', 'reabertura da fonte vermelha'],
  liveDatabaseAccess:false }));
