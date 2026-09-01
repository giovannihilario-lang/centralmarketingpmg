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
const htmlSource = fs.readFileSync(path.join(projectRoot, 'public', 'acompanhamento.html'), 'utf8');

if (!original.includes('Central de Acompanhamento UX V2.5.7')) throw new Error('Versão V2.5.7 ausente no JS.');
if (original.includes('window.lucide?.createIcons')) throw new Error('createIcons não pode alterar nós controlados pelo React.');
if (!original.includes('lucide-icon-host')) throw new Error('Contêiner isolado dos ícones não foi criado.');
if (!original.includes('window.lucide.createElement(icon)')) throw new Error('Lucide não está isolado dentro do contêiner estável.');
if (!htmlSource.includes('acompanhamento.js?v=2.5.7')) throw new Error('Cache do JS V2.5.7 não foi invalidado.');
if (!htmlSource.includes('translate="no"')) throw new Error('Proteção contra alteração externa da árvore React ausente.');
const testable = original.replace(
  "ReactDOM.createRoot(document.getElementById('root')).render(html`<${AppErrorBoundary}><${App}/></${AppErrorBoundary}>`);",
  'globalThis.__PMG_TEST__ = { parseOfficialWorkbook, isMissingSetupError, officialRevenueSnapshot, liveRevenueSnapshot, sourceConfirmsSupplierRow, decorateOfficialRevenueTruth, buildOfficialConfirmationAllocation, buildIntegrityReport, buildPlanningSnapshot, buildMktgExportSnapshot, revenueLineMatchKey };',
);

const noop = () => {};
const sandbox = {
  console, XLSX, Intl, Date, URLSearchParams, crypto: webcrypto,
  setTimeout, clearTimeout, requestAnimationFrame: callback => callback(Date.now()), cancelAnimationFrame: noop,
  React: {
    Component:class {}, createElement: noop, useCallback: value => value, useEffect: noop, useMemo: callback => callback(),
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


// Regressão V2.5.5: a Central não pode ficar presa eternamente no boot e o importador oficial deve ser simples.
for (const requiredUxContract of [
  "withTimeout(fetchAll(client), 25000",
  "A Central demorou demais para carregar",
  "Escolha o Excel e confirme.",
  "Importar planilha",
  "Modelo não reconhecido. Use Fornecedores 20XX, MKTG 2026 ou o modelo de Fechamento da PMG.",
]) {
  if (!original.includes(requiredUxContract)) throw new Error(`Contrato V2.5.5 ausente: ${requiredUxContract}`);
}
if (original.includes('Confirme o que cada coluna significa')) throw new Error('Importador oficial ainda exibe mapeamento técnico na interface ativa');

// A importação de Fornecedores precisa persistir a confirmação na própria linha,
// porque desde a V1.9.5 essa é a fonte de verdade de Receita/Dashboard.
for (const requiredImportContract of [
  "preflightOfficialSupplierImport",
  "confirmOfficialSupplierRows",
  "confirmar_pagamentos_lote_v1",
  "supplierRevenueFingerprints",
  "ImportErrorBoundary",
  "normalizeImportItem",
]) {
  if (!original.includes(requiredImportContract)) throw new Error(`Importador sem contrato de segurança: ${requiredImportContract}`);
}

// Regressão V2.5.2: arquivo renomeado pelo navegador, como "Fornecedores 2026(4).xlsx", deve ser reconhecido
// e somente abas mensais podem alimentar Pagamentos/Receita.
const importProbe = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(importProbe, XLSX.utils.aoa_to_sheet([
  ['CONTROLE DE FORNECEDORES 2026'],
  ['CAMPANHA','FORNECEDOR','VERBA','NF','VALOR'],
  ['INCENTIVO','AJINOMOTO',51666.68,'NF 123',10000],
  ['TOTAL','',51666.68,'',''],
]), 'Janeiro');
XLSX.utils.book_append_sheet(importProbe, XLSX.utils.aoa_to_sheet([
  ['FORNECEDOR','VERBA'],['IGNORAR ESTA ABA',999],
]), 'Notas');
const importedProbe = sandbox.__PMG_TEST__.parseOfficialWorkbook('Fornecedores 2026(4).xlsx', importProbe);
if (!importedProbe || importedProbe.kind !== 'fornecedores') throw new Error('Importador não reconheceu Fornecedores 2026 com sufixo de cópia');
if (importedProbe.warnings.length) throw new Error(`Importador oficial gerou alerta inesperado: ${importedProbe.warnings.join(' · ')}`);
if (importedProbe.totals.length !== 1 || importedProbe.totals[0].sheet !== 'Janeiro') throw new Error('Importador processou aba que não representa competência mensal');
const importedRevenueProbe = importedProbe.items.find(item => item.registro.natureza === 'receita');
const importedCostProbe = importedProbe.items.find(item => item.registro.natureza === 'despesa');
if (!importedRevenueProbe || importedRevenueProbe.registro.fornecedor !== 'Ajinomoto' || Math.abs(Number(importedRevenueProbe.registro.valor_acordado) - 51666.68) > .01) throw new Error('Importação de Fornecedores não criou a receita esperada');
if (!importedRevenueProbe.registro.fingerprint.includes('marketing|fornecedores|2026|janeiro|ajinomoto|incentivo')) throw new Error(`Fingerprint de Fornecedores incompatível com histórico: ${importedRevenueProbe.registro.fingerprint}`);
if (importedRevenueProbe.pagamentos[0]?.status !== 'pago' || Math.abs(Number(importedRevenueProbe.pagamentos[0]?.valor_pago) - 51666.68) > .01) throw new Error('Importação de Fornecedores não alimentou Pagamentos');
if (!importedCostProbe || Math.abs(Number(importedCostProbe.registro.valor_acordado) - 10000) > .01 || importedCostProbe.registro.impacta_totais !== false) throw new Error('Importação não preservou o VALOR específico como detalhamento dentro da verba');


// Regressão V2.5.5: o modelo de Fechamento de aba única precisa entrar direto em Pagamentos sem mapeamento técnico.
const closingProbe = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(closingProbe, XLSX.utils.aoa_to_sheet([
  ['CAMPANHA','FORNECEDOR','VERBA','NF','VALOR'],
  ['COTA','AJINOMOTO',51666.68,'NF 321',0],
  ['INCENTIVO','BUNGE',25000,'DEPÓSITO',0],
]), 'Planilha1');
const closingDetected = sandbox.__PMG_TEST__.parseOfficialWorkbook('Teste fechamento.xlsx', closingProbe, { forcedMonthIndex:7 });
if (!closingDetected || closingDetected.kind !== 'fechamento') throw new Error('Importador não reconheceu o modelo de Fechamento em aba única');
if (closingDetected.items.length !== 2) throw new Error(`Modelo de Fechamento deveria gerar 2 lançamentos, gerou ${closingDetected.items.length}`);
if (closingDetected.competenceMonthIndex !== 7) throw new Error('Modelo de Fechamento não preservou a competência escolhida');
const closingAjinomoto = closingDetected.items.find(item => item.registro.fornecedor === 'Ajinomoto');
if (!closingAjinomoto || closingAjinomoto.pagamentos[0]?.status !== 'pago') throw new Error('Fechamento não alimentou Pagamentos como recebido');
if (!closingAjinomoto.registro.fingerprint.includes('marketing|fornecedores|2026|agosto|ajinomoto|cota')) throw new Error(`Fingerprint de Fechamento incompatível com Fornecedores: ${closingAjinomoto?.registro?.fingerprint}`);

// Regressão V2.5.0: duas linhas do mesmo fornecedor/mês não podem herdar a mesma baixa oficial.
const multiLineSource = {
  id:'source-multiline', controle:'marcos', ano_referencia:2026, fornecedor:'Fornecedor Teste', natureza:'receita',
  impacto_totais:true, status:'aprovado', valor_acordado:100, tags:['previsão','fornecedor'], data_inicio:'2026-01-01',
  dados_originais:{ pagamentos_mensais:[100,0,0,0,0,0,0,0,0,0,0,0] },
};
const multiLineRows = [
  { id:'row-100', controle:'marketing', ano_referencia:2026, fornecedor:'Fornecedor Teste', natureza:'receita', impacto_totais:true, status:'concluido', valor_acordado:100, data_inicio:'2026-01-01', numero_documento:'NF-100', tags:['fornecedores'] },
  { id:'row-50', controle:'marketing', ano_referencia:2026, fornecedor:'Fornecedor Teste', natureza:'receita', impacto_totais:true, status:'concluido', valor_acordado:50, data_inicio:'2026-01-01', numero_documento:'NF-050', tags:['fornecedores'] },
];
const multiDecorated = sandbox.__PMG_TEST__.decorateOfficialRevenueTruth([multiLineSource,...multiLineRows]);
const row100 = multiDecorated.find(item => item.id === 'row-100');
const row50 = multiDecorated.find(item => item.id === 'row-50');
if (row100?._oficial_confirmado !== true || row50?._oficial_confirmado !== false) {
  throw new Error(`Conciliação por linha falhou: 100=${row100?._oficial_confirmado} / 50=${row50?._oficial_confirmado}`);
}
const multiLive = sandbox.__PMG_TEST__.liveRevenueSnapshot(multiDecorated, [], [], 2026);
if (Math.abs(Number(multiLive.bySupplier.get('fornecedor teste')?.months?.[0] || 0) - 100) > 0.01) {
  throw new Error('Conciliação por linha alterou indevidamente o total oficial do fornecedor');
}
const noForecastRow = { id:'manual-sem-previsao', controle:'marketing', ano_referencia:2026, fornecedor:'Receita Sem Previsão', natureza:'receita', impacto_totais:true, status:'concluido', valor_acordado:25, pagamento_confirmado:true, data_inicio:'2026-01-01', origem_importacao:'cadastro-manual', tags:['fornecedores','manual'] };
const integritySynthetic = sandbox.__PMG_TEST__.buildIntegrityReport([...multiDecorated,noForecastRow], [], [], 2026);
if (integritySynthetic.noForecastCount < 1) throw new Error('Integridade não detectou receita confirmada sem previsão');


// Regressão V2.5.1: a exportação precisa reproduzir Receita/Planejamento a partir da mesma fonte viva da Central.
const exportSynthetic = sandbox.__PMG_TEST__.buildMktgExportSnapshot({
  allRecords:[...multiDecorated,noForecastRow],
  payments:[],
  conferences:[],
});
const exportSupplier = exportSynthetic.revenue2026.find(row => row.name === 'Fornecedor Teste');
if (!exportSupplier || Math.abs(Number(exportSupplier.months?.[0] || 0) - 100) > 0.01) {
  throw new Error('Exportação MKTG não reproduziu a Receita conciliada por fornecedor');
}
if (!exportSynthetic.pendingRows.some(row => row.supplier === 'Receita Sem Previsão')) {
  throw new Error('Exportação MKTG não incluiu lançamento a receber em PENDÊNCIAS');
}
const exportTemplatePath = path.join(projectRoot,'public','modelos','MKTG-2026-PMG-CONNECT.xlsx');
if (!fs.existsSync(exportTemplatePath)) throw new Error('Modelo de exportação MKTG 2026 não foi incluído no projeto');
const exportTemplate = XLSX.readFile(exportTemplatePath,{ cellStyles:true });
for (const requiredSheet of ['RECEITA','Planejamento','PENDÊNCIAS']) {
  if (!exportTemplate.Sheets[requiredSheet]) throw new Error(`Modelo de exportação sem a aba ${requiredSheet}`);
}

const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const fingerprints = new Set(snapshot.items.map(item => item.registro.fingerprint));
const paymentFingerprints = new Set(snapshot.items.flatMap(item => item.pagamentos.map(payment => `${item.registro.fingerprint}|${payment.fingerprint}`)));
const cases = ['Fornecedores 2024.xlsx', 'Fornecedores 2025.xlsx', 'Fornecedores 2026.xlsx', 'MKTG 2026.xlsx'];
const results = [];
const expectedCounts = {
  'Fornecedores 2024.xlsx': { records:430, payments:426 },
  'Fornecedores 2025.xlsx': { records:524, payments:523 },
  'Fornecedores 2026.xlsx': { records:271, payments:270 },
  'MKTG 2026.xlsx': { records:101, payments:384 },
};

for (const fileName of cases) {
  const workbook = XLSX.readFile(path.join(sourceDir, fileName), { cellFormula:true, cellDates:true });
  const parsed = sandbox.__PMG_TEST__.parseOfficialWorkbook(fileName, workbook);
  if (!parsed) throw new Error(`${fileName}: modelo oficial não reconhecido`);
  const unique = new Set(parsed.items.map(item => item.registro.fingerprint));
  const expectedItems = snapshot.items.filter(item => item.registro.origem_importacao === fileName);
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
  const records = parsed.items.length;
  const payments = parsed.items.reduce((sum, item) => sum + item.pagamentos.length, 0);
  const expectedCount = expectedCounts[fileName];
  if (records !== expectedCount.records || payments !== expectedCount.payments) {
    throw new Error(`${fileName}: contagem divergente (obtido ${records}/${payments}; esperado ${expectedCount.records}/${expectedCount.payments})`);
  }
  if (parsed.warnings.length) throw new Error(`${fileName}: ${parsed.warnings.length} aviso(s) de reconciliação`);
  results.push({ file:fileName, records, payments, warnings:parsed.warnings.length });
}


if (snapshot.items.length !== 1326) throw new Error(`Carga consolidada: ${snapshot.items.length} registros; esperado 1326`);

const officialRevenueTotal = snapshot.items.find(item => {
  const record = item.registro || {};
  return record.controle === 'marcos' && record.ano_referencia === 2026 && record.natureza === 'indicador' && (record.tags || []).includes('receita-realizada');
});
if (!officialRevenueTotal) throw new Error('Receita realizada oficial 2026 não foi preservada');
if (Math.abs(Number(officialRevenueTotal.registro.valor_acordado || 0) - 3970297.69) > 0.01) {
  throw new Error(`Receita realizada 2026 divergente: ${officialRevenueTotal.registro.valor_acordado}; esperado 3970297.69`);
}
const officialRevenueMonths = officialRevenueTotal.registro.dados_originais?.pagamentos_mensais || [];
if (officialRevenueMonths.length !== 12 || Math.abs(Number(officialRevenueMonths[6] || 0) - 635720.36) > 0.01) {
  throw new Error('SOMA MENSAL do MKTG 2026 não foi preservada corretamente');
}

const snapshotRecords = snapshot.items.map((item, index) => ({ id:`test-${index}`, ...(item.registro || {}) }));
const officialSnapshot = sandbox.__PMG_TEST__.officialRevenueSnapshot(snapshotRecords, 2026);
if (Math.abs(Number(officialSnapshot.total || 0) - 3970297.69) > 0.01) {
  throw new Error(`Dashboard/Receita não reproduzem o total oficial: ${officialSnapshot.total}`);
}
const decoratedRecords = sandbox.__PMG_TEST__.decorateOfficialRevenueTruth(snapshotRecords);

// Regressão V2.4.0: um lançamento manual não pode herdar a confirmação da fonte oficial
// e, depois de confirmado, precisa entrar imediatamente na Receita/Dashboard sem duplicar a base.
const ajinomotoManualAugust = {
  id:'manual-ajinomoto-august', controle:'marketing', ano_referencia:2026, fornecedor:'Ajinomoto', natureza:'receita', impacta_totais:true,
  categoria:'cota_anual', referencia:'Cota anual', titulo:'Cota anual — Ajinomoto — Agosto 2026', status:'concluido',
  data_inicio:'2026-08-01', data_fim:'2026-08-31', valor_acordado:51666.68, tags:['marketing','fornecedores','2026','agosto','manual'],
  origem_importacao:'cadastro-manual', pagamento_confirmado:false,
};
if (sandbox.__PMG_TEST__.sourceConfirmsSupplierRow(ajinomotoManualAugust, officialSnapshot)) {
  throw new Error('Linha manual herdou confirmação da fonte oficial indevidamente');
}
const beforeManualConfirmation = sandbox.__PMG_TEST__.liveRevenueSnapshot([...decoratedRecords, ajinomotoManualAugust], [], [], 2026);
const ajinomotoBefore = beforeManualConfirmation.bySupplier.get('ajinomoto');
if (Math.abs(Number(ajinomotoBefore?.months?.[7] || 0) - 1) > 0.01) {
  throw new Error(`Ajinomoto/agosto pendente alterou a Receita: ${ajinomotoBefore?.months?.[7]}`);
}
const confirmedManual = { ...ajinomotoManualAugust, pagamento_confirmado:true };
const afterManualConfirmation = sandbox.__PMG_TEST__.liveRevenueSnapshot([...decoratedRecords, confirmedManual], [], [], 2026);
const ajinomotoAfter = afterManualConfirmation.bySupplier.get('ajinomoto');
if (Math.abs(Number(ajinomotoAfter?.months?.[7] || 0) - 51666.68) > 0.01) {
  throw new Error(`Ajinomoto/agosto não entrou na Receita após confirmação: ${ajinomotoAfter?.months?.[7]}`);
}
const expectedReconciledTotal = Number(officialSnapshot.total || 0) - 1 + 51666.68;
if (Math.abs(Number(afterManualConfirmation.total || 0) - expectedReconciledTotal) > 0.01) {
  throw new Error(`Receita reconciliada divergente: ${afterManualConfirmation.total}; esperado ${expectedReconciledTotal}`);
}

const julySupplierRows = decoratedRecords.filter(record => record.controle === 'marketing' && record.ano_referencia === 2026 && record.natureza === 'receita' && (record.tags || []).includes('fornecedores') && String(record.data_inicio || '').startsWith('2026-07'));
if (julySupplierRows.length !== 34 || julySupplierRows.some(record => record._oficial_confirmado !== true)) {
  throw new Error(`Conciliação MKTG julho divergente: ${julySupplierRows.filter(record => record._oficial_confirmado).length}/${julySupplierRows.length} confirmadas pela fonte`);
}

const allPayments = snapshot.items.flatMap(item => item.pagamentos || []);
if (allPayments.length !== 1603) throw new Error(`Carga consolidada: ${allPayments.length} movimentos; esperado 1603`);

const planning = snapshot.items.filter(item => {
  const record = item.registro || {};
  return record.controle === 'marcos' && record.ano_referencia === 2026 && record.natureza === 'despesa' && (record.tags || []).includes('planejamento');
});
const planningPayments = planning.flatMap(item => item.pagamentos || []);
const planningPaid = planningPayments.filter(payment => payment.status === 'pago' || Number(payment.valor_pago || 0) > 0);
if (planning.length !== 15 || planningPayments.length !== 104 || planningPaid.length !== 73) {
  throw new Error(`Planejamento 2026 divergente: ${planning.length} frentes / ${planningPayments.length} parcelas / ${planningPaid.length} baixas automáticas`);
}

const planningPaidTotal = planningPaid.reduce((total, payment) => total + Number(payment.valor_pago || 0), 0);
if (Math.abs(planningPaidTotal - 1740817.68) > 0.01) {
  throw new Error(`Planejamento 2026 pago divergente: ${planningPaidTotal}; esperado 1740817.68`);
}
const planningTotal = planning.reduce((total, item) => total + Number(item.registro?.valor_acordado || 0), 0);
if (Math.abs(planningTotal - 2610377.68) > 0.01) {
  throw new Error(`Planejamento 2026 total divergente: ${planningTotal}; esperado 2610377.68`);
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

console.log(JSON.stringify({ status:'ok', summary:{ records:snapshot.items.length, payments:allPayments.length, planning:{ fronts:planning.length, installments:planningPayments.length, autoPaid:planningPaid.length }, centerCostRules:{ alfamaMtrix:true, ajinomotoIncentivo:true } }, results }));
