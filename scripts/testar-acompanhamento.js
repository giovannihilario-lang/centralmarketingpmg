import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import XLSX from 'xlsx';

const projectRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const appPath = path.join(projectRoot, 'public', 'assets', 'acompanhamento.js');
const snapshotPath = path.join(projectRoot, 'data', 'acompanhamento-carga-inicial.json');
const sourceDir = path.join(projectRoot, 'fontes', 'acompanhamento');

const original = fs.readFileSync(appPath, 'utf8');
const html = fs.readFileSync(path.join(projectRoot, 'public', 'acompanhamento.html'), 'utf8');
const operationalSql = fs.readFileSync(path.join(projectRoot, 'sql', '12-CONTROLES-OPERACIONAIS-V1.4.0.sql'), 'utf8');
const testable = original.replace(
  "ReactDOM.createRoot(document.getElementById('root')).render(html`<${App}/>`);",
  'globalThis.__PMG_TEST__ = { parseOfficialWorkbook, isMissingSetupError };',
);

const noop = () => {};
const sandbox = {
  console, XLSX, Intl, Date, URLSearchParams, crypto: webcrypto,
  setTimeout, clearTimeout, requestAnimationFrame: callback => callback(Date.now()), cancelAnimationFrame: noop,
  React: {
    createElement: noop, useCallback: value => value, useEffect: noop, useMemo: callback => callback(),
    useRef: value => ({ current:value }), useState: value => [value, noop],
  },
  ReactDOM: { createRoot: () => ({ render:noop }) },
  htm: { bind: () => noop },
  location: { search:'' },
  document: { getElementById:noop, body:{ classList:{ add:noop, remove:noop } }, addEventListener:noop, removeEventListener:noop },
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.runInNewContext(testable, sandbox, { filename:appPath });

for (const missingError of [
  { code:'PGRST205', message:"Could not find the table 'public.acompanhamento_painel' in the schema cache" },
  { status:404, message:'Not Found' },
  { code:'42P01', message:'relation acompanhamento_registros does not exist' },
]) {
  if (!sandbox.__PMG_TEST__.isMissingSetupError(missingError)) throw new Error('Falha ao reconhecer estrutura ausente do banco');
}
if (sandbox.__PMG_TEST__.isMissingSetupError({ code:'42501', message:'permission denied' })) throw new Error('Erro de permissão confundido com instalação ausente');

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const fingerprints = new Set(snapshot.items.map(item => item.registro.fingerprint));
const paymentFingerprints = new Set(snapshot.items.flatMap(item => item.pagamentos.map(payment => `${item.registro.fingerprint}|${payment.fingerprint}`)));
const cases = ['Fornecedores 2024.xlsx', 'Fornecedores 2025.xlsx', 'Fornecedores 2026.xlsx', 'MKTG 2026.xlsx'];
const results = [];
const expectedCounts = {
  'Fornecedores 2024.xlsx': { records:430, payments:426 },
  'Fornecedores 2025.xlsx': { records:524, payments:523 },
  'Fornecedores 2026.xlsx': { records:271, payments:270 },
  'MKTG 2026.xlsx': { records:110, payments:488 },
};

for (const fileName of cases) {
  const workbook = XLSX.readFile(path.join(sourceDir, fileName), { cellFormula:true, cellDates:true, cellStyles:true, bookFiles:true });
  const parsed = sandbox.__PMG_TEST__.parseOfficialWorkbook(fileName, workbook);
  if (!parsed) throw new Error(`${fileName}: modelo oficial não reconhecido`);
  const unique = new Set(parsed.items.map(item => item.registro.fingerprint));
  const expectedItems = snapshot.items.filter(item => item.registro.origem_importacao === fileName);
  const expectedByFingerprint = new Map(expectedItems.map(item => [item.registro.fingerprint, item]));
  const expected = new Set(expectedItems.map(item => item.registro.fingerprint));
  const missing = [...unique].filter(item => !fingerprints.has(item));
  const omitted = [...expected].filter(item => !unique.has(item));
  const parsedPayments = parsed.items.flatMap(item => item.pagamentos.map(payment => `${item.registro.fingerprint}|${payment.fingerprint}`));
  const expectedPayments = new Set(expectedItems.flatMap(item => item.pagamentos.map(payment => `${item.registro.fingerprint}|${payment.fingerprint}`)));
  const missingPayments = parsedPayments.filter(item => !paymentFingerprints.has(item));
  const omittedPayments = [...expectedPayments].filter(item => !parsedPayments.includes(item));
  if (unique.size !== parsed.items.length) throw new Error(`${fileName}: fingerprints duplicados`);
  if (missing.length) throw new Error(`${fileName}: ${missing.length} fingerprints não conciliam com a carga inicial`);
  if (omitted.length) throw new Error(`${fileName}: ${omitted.length} registros da carga inicial não são atualizados pela reimportação`);
  if (missingPayments.length) throw new Error(`${fileName}: ${missingPayments.length} pagamentos não conciliam com a carga inicial`);
  if (omittedPayments.length) throw new Error(`${fileName}: ${omittedPayments.length} pagamentos da carga inicial não são atualizados pela reimportação`);
  const recordFields = ['fornecedor', 'natureza', 'impacta_totais', 'categoria', 'titulo', 'referencia', 'status', 'data_inicio', 'data_fim', 'valor_acordado', 'centro_custo', 'numero_documento'];
  const paymentFields = ['descricao', 'valor_previsto', 'valor_pago', 'vencimento', 'pago_em', 'status', 'forma_pagamento', 'favorecido', 'numero_documento'];
  for (const item of parsed.items) {
    const expectedItem = expectedByFingerprint.get(item.registro.fingerprint);
    for (const field of recordFields) {
      if (JSON.stringify(item.registro[field] ?? '') !== JSON.stringify(expectedItem.registro[field] ?? '')) {
        throw new Error(`${fileName}: campo ${field} diverge entre a carga e a reimportação de ${item.registro.titulo}`);
      }
    }
    const expectedPaymentMap = new Map(expectedItem.pagamentos.map(payment => [payment.fingerprint, payment]));
    for (const payment of item.pagamentos) {
      const expectedPayment = expectedPaymentMap.get(payment.fingerprint);
      for (const field of paymentFields) {
        if (JSON.stringify(payment[field] ?? '') !== JSON.stringify(expectedPayment[field] ?? '')) {
          throw new Error(`${fileName}: pagamento ${payment.descricao} diverge no campo ${field}`);
        }
      }
    }
  }
  const records = parsed.items.length;
  const payments = parsed.items.reduce((sum, item) => sum + item.pagamentos.length, 0);
  const expectedCount = expectedCounts[fileName];
  if (records !== expectedCount.records || payments !== expectedCount.payments) {
    throw new Error(`${fileName}: contagem divergente (obtido ${records}/${payments}; esperado ${expectedCount.records}/${expectedCount.payments})`);
  }
  if (parsed.warnings.length) throw new Error(`${fileName}: ${parsed.warnings.length} aviso(s) de reconciliação`);
  results.push({ file:fileName, records, payments, warnings:parsed.warnings.length });
}


if (snapshot.items.length !== 1335) throw new Error(`Carga consolidada: ${snapshot.items.length} registros; esperado 1335`);
const allPayments = snapshot.items.flatMap(item => item.pagamentos || []);
if (allPayments.length !== 1707) throw new Error(`Carga consolidada: ${allPayments.length} movimentos; esperado 1707`);
if (paymentFingerprints.size !== allPayments.length) throw new Error('A carga consolidada contém fingerprints de pagamento duplicados');

const firstSupplier = snapshot.items.find(item => item.registro.origem_importacao === 'Fornecedores 2024.xlsx' && item.registro.fornecedor === 'Alibra');
if (!firstSupplier || /\|janeiro\|\d+\|alibra\|/.test(firstSupplier.registro.fingerprint)) {
  throw new Error('A identidade oficial ainda depende da posição física da linha');
}

const planning = snapshot.items.filter(item => {
  const record = item.registro || {};
  return record.controle === 'marcos' && record.ano_referencia === 2026 && record.natureza === 'despesa' && (record.tags || []).includes('planejamento');
});
const planningPayments = planning.flatMap(item => item.pagamentos || []);
const planningPaid = planningPayments.filter(payment => payment.status === 'pago' || Number(payment.valor_pago || 0) > 0);
const planningPaidValue = planningPaid.reduce((total, payment) => total + Number(payment.valor_pago || 0), 0);
if (planning.length !== 15 || planningPayments.length !== 104 || planningPaid.length !== 73 || Math.abs(planningPaidValue - 1740817.68) > .01) {
  throw new Error(`Planejamento 2026 divergente: ${planning.length} frentes / ${planningPayments.length} parcelas / ${planningPaid.length} realizados / R$ ${planningPaidValue}`);
}
if (planning.some(item => !Array.isArray(item.registro.dados_originais?.status_mensais))) throw new Error('Planejamento sem leitura das cores da fonte');

const supplierPayments = snapshot.items.filter(item => (item.registro?.tags || []).includes('fornecedores')).flatMap(item => item.pagamentos || []);
for (const requiredMethod of ['Desconto em boleto', 'Depósito', 'Depósito + desconto em boleto']) {
  if (!supplierPayments.some(payment => payment.forma_pagamento === requiredMethod)) throw new Error(`Classificação de recebimento ausente: ${requiredMethod}`);
}
const supplierMethodCounts = supplierPayments.reduce((counts, payment) => ({ ...counts, [payment.forma_pagamento]:(counts[payment.forma_pagamento] || 0) + 1 }), {});
if (supplierMethodCounts['Desconto em boleto'] !== 786 || supplierMethodCounts.Depósito !== 240 || supplierMethodCounts['Depósito + desconto em boleto'] !== 22) {
  throw new Error(`Classificação dos recebimentos divergente: ${JSON.stringify(supplierMethodCounts)}`);
}
if (!/Sobra Marketing/.test(original) || !/Bonificação/.test(original)) throw new Error('Os quatro tipos de recebimento não estão disponíveis para lançamentos futuros');

for (const [year, expectedValue] of [[2024, 5197089.34], [2025, 6562385.94], [2026, 3970269.22]]) {
  const value = snapshot.items.filter(item => item.registro.ano_referencia === year && (item.registro.tags || []).includes('fornecedores'))
    .reduce((total, item) => total + Number(item.registro.valor_acordado || 0), 0);
  if (Math.abs(value - expectedValue) > .01) throw new Error(`Total de verbas ${year} divergente: ${value}`);
}
const plannedValue = planning.reduce((total, item) => total + Number(item.registro.valor_acordado || 0), 0);
if (Math.abs(plannedValue - 2610377.68) > .01) throw new Error(`Planejamento anual divergente: ${plannedValue}`);
const indicators = Object.fromEntries(snapshot.items.filter(item => item.registro.natureza === 'indicador').map(item => [(item.registro.tags || []).find(tag => ['receita','investimento','saldo'].includes(tag)), Number(item.registro.valor_acordado)]));
if (indicators.investimento !== 3100997.78 || indicators.receita !== 6816000 || indicators.saldo !== 3715002.22) {
  throw new Error(`Indicadores executivos divergentes: ${JSON.stringify(indicators)}`);
}

const centerCosts = snapshot.items.filter(item => (item.registro?.tags || []).includes('centro-custo'));
const alfamaJuly = centerCosts.find(item => {
  const record = item.registro || {};
  return /ALFAMA/i.test(record.fornecedor || '') && record.ano_referencia === 2026 && /Julho 2026/i.test(record.titulo || '') && /MTRIX/i.test(record.titulo || '');
});
if (!alfamaJuly || Number(alfamaJuly.registro.valor_acordado) !== 11946.2 || alfamaJuly.registro.impacta_totais !== true || alfamaJuly.registro.dados_originais?.incluido_na_verba !== false) {
  throw new Error('Regra ALFAMA/MTRIX julho 2026 não foi preservada');
}
const ajinomotoMay = centerCosts.find(item => {
  const record = item.registro || {};
  return /AJINOMOTO/i.test(record.fornecedor || '') && record.ano_referencia === 2026 && /Maio 2026/i.test(record.titulo || '') && /incentivo/i.test(record.titulo || '');
});
if (!ajinomotoMay || Number(ajinomotoMay.registro.valor_acordado) !== 10000 || ajinomotoMay.registro.impacta_totais !== false || ajinomotoMay.registro.dados_originais?.incluido_na_verba !== true) {
  throw new Error('Regra AJINOMOTO/incentivo maio 2026 não foi preservada');
}

if (!/acompanhamento\.css\?v=1\.5\.0/.test(html) || !/acompanhamento\.js\?v=1\.5\.0/.test(html)) {
  throw new Error('A página não referencia a interface V1.5.0');
}
for (const expected of [
  /function PlanningActivityBoard/,
  /function PlanningMatrix/,
  /function FinanceWorkspace/,
  /const SIDEBAR_VIEWS = \['dashboard', 'planejamento', 'financeiro', 'registros', 'documentos', 'importar'\]/,
  /salvar_atividade_planejamento_v1/,
  /Somente gestores podem assinar/,
  /Data, forma e documento são obrigatórios/,
]) {
  if (!expected.test(original)) throw new Error(`Controle operacional ausente: ${expected}`);
}
if (/registrar_anexo_acompanhamento_v1/.test(original)) throw new Error('A interface ainda permite contornar a conferência de documentos');
for (const expected of [
  /create table if not exists public\.acompanhamento_planejamento_atividades/,
  /trg_validar_baixa_pagamento/,
  /trg_bloquear_pdf_sem_conferencia/,
  /trg_gestor_importacoes/,
  /on delete set null/,
]) {
  if (!expected.test(operationalSql)) throw new Error(`Proteção SQL ausente: ${expected}`);
}
if (fs.existsSync(path.join(projectRoot, 'public', 'data', 'acompanhamento-carga-inicial.json'))) {
  throw new Error('A carga financeira não pode permanecer publicada em public/data');
}
for (const fileName of cases) {
  if (fs.existsSync(path.join(projectRoot, 'public', 'fontes', 'acompanhamento', fileName))) {
    throw new Error(`A planilha oficial ${fileName} não pode permanecer publicada em public/fontes`);
  }
}

console.log(JSON.stringify({ status:'ok', summary:{ records:snapshot.items.length, payments:allPayments.length, stableFingerprints:true, publicSources:false, planning:{ fronts:planning.length, installments:planningPayments.length, sourceRealized:planningPaid.length, sourceRealizedValue:planningPaidValue, executionBoard:true }, receiptMethods:true, centerCostRules:{ alfamaMtrix:true, ajinomotoIncentivo:true } }, results }));
