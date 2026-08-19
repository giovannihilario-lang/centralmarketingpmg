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
  results.push({ file:fileName, records:parsed.items.length, payments:parsed.items.reduce((sum, item) => sum + item.pagamentos.length, 0), warnings:parsed.warnings.length });
}

console.log(JSON.stringify({ status:'ok', results }));
