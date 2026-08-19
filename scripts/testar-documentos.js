import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../public/assets/acompanhamento-ocr.js';
import { DOCUMENT_SCHEMA, validateAnalysis } from '../api/analisar-documento.js';

const { classify, parsePage, parseBrazilianMoney } = globalThis.PMGDocumentOCR;

assert.equal(parseBrazilianMoney('R$ 2.069,76'), 2069.76);
assert.equal(parseBrazilianMoney('215.255,04'), 215255.04);

const samples = [
  {
    type:'cadastro_pagamento',
    text:`CADASTRO DE PAGAMENTO\nFORNECEDOR: COAMO AGROINDUSTRIAL\nVALOR BRUTO R$ 205.867,05\nDESC R$ 7.147,99 REF. ACORDO MKT\nVALOR LIQUIDO R$ 198.719,06\nDATA DE PAGAMENTO 07/08/2026`,
    expectedMarketing:7147.99,
  },
  {
    type:'pedido_compra',
    text:`PEDIDO DE COMPRA Nº 333428\nFORNECEDOR: BATATAS LAMB WESTON\nTOTAL DO PEDIDO R$ 215.255,04\nSOBRAS MARKETING R$ 2.069,76\nVENCIMENTO 02/09/2026`,
    expectedMarketing:2069.76,
  },
  {
    type:'danfe',
    text:`DANFE\nNOTA FISCAL ELETRONICA Nº 000.056.354\nEMITENTE: TONDO S.A.\nNATUREZA DA OPERACAO REMESSA EM BONIFICACAO DOACAO OU BRINDE\nVALOR TOTAL DA NOTA R$ 10.064,60`,
    expectedMarketing:10064.60,
  },
  {
    type:'extrato_bancario',
    text:`EXTRATO BANCARIO\nAGENCIA E CONTA\nTED TRANSFERENCIA RECEBIDA\nREMETENTE: CARGILL AGRICOLA S A\nR$ 10.000,00\nSALDO DO DIA R$ 25.000,00`,
    expectedMarketing:null,
  },
];

for (const [index, sample] of samples.entries()) {
  assert.equal(classify(sample.text).type, sample.type, `Classificacao incorreta para ${sample.type}`);
  const parsed = parsePage(sample.text, index + 1, 92);
  assert.equal(parsed.tipo, sample.type);
  assert.equal(parsed.valor_marketing, sample.expectedMarketing);
  assert.ok(parsed.alertas.length, 'Todo OCR deve exigir conferencia.');
}

const purchase = parsePage(samples[1].text, 2, 95);
assert.equal(purchase.numero_pedido, '333428');
assert.equal(purchase.valor_total_documento, 215255.04);
assert.equal(purchase.valor_lancamento_sugerido, 2069.76);
assert.equal(purchase.vencimento, '2026-09-02');

const scannedStatement = parsePage(`EXTRATO MENSAL / POR PERIODO\nULTIMOS LANCAMENTOS\nSALDO ANTERIOR\nREMETCARGILL AGRICOLA SA +10.000,00 12.783.701,71\nREM OUTRO FORNECEDOR 6.923,52`, 4, 82);
assert.equal(scannedStatement.tipo, 'extrato_bancario');
assert.equal(scannedStatement.valor_lancamento_sugerido, 10000);

const unknown = parsePage('DOCUMENTO DIVERSO SEM MODELO CONHECIDO', 5, 80);
assert.equal(unknown.tipo, 'nao_identificado');
assert.ok(unknown.campos_duvidosos.includes('tipo_documento'));

const html = fs.readFileSync(new URL('../public/acompanhamento.html', import.meta.url), 'utf8');
assert.match(html, /pdfjs-dist@3\.11\.174/);
assert.match(html, /tesseract\.js@5\.1\.1/);
assert.match(html, /acompanhamento-ocr\.js\?v=1\.2\.2/);
assert.match(html, /acompanhamento-documentos\.css\?v=1\.2\.3/);
assert.match(html, /acompanhamento-documentos\.js\?v=1\.2\.3/);
assert.match(html, /connect-auth\.js\?v=1\.2\.2/);

const documentModule = fs.readFileSync(new URL('../public/assets/acompanhamento-documentos.js', import.meta.url), 'utf8');
assert.match(documentModule, /PMGDocumentOCR\.analyzePdf/);
assert.match(documentModule, /\/api\/analisar-documento/);
assert.match(documentModule, /Gemini 3\.7 Flash/);
assert.match(documentModule, /return \(\) => cancelAnimationFrame\(frame\)/, 'O efeito dos icones precisa devolver uma funcao de limpeza.');

const envExample = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
assert.doesNotMatch(envExample, /OPENAI_API_KEY/);
assert.match(envExample, /GEMINI_DOCUMENT_MODEL=gemini-3\.7-flash/);

assert.deepEqual(DOCUMENT_SCHEMA.properties.documentos.items.properties.tipo.enum.sort(), [
  'cadastro_pagamento', 'danfe', 'extrato_bancario', 'nao_identificado', 'pedido_compra'
]);
const validated = validateAnalysis({
  total_paginas:1,
  resumo:'Leitura de teste',
  documentos:[{ tipo:'danfe', paginas:[1], confianca:.91, valor_total_documento:10064.6 }],
});
assert.equal(validated.documentos[0].tipo, 'danfe');
assert.equal(validated.documentos[0].valor_total_documento, 10064.6);
assert.ok(validated.documentos[0].alertas.some(alert => /Confira o PDF original/i.test(alert)));

const sql = fs.readFileSync(new URL('../sql/08-CAIXA-ENTRADA-DOCUMENTOS.sql', import.meta.url), 'utf8');
assert.match(sql, /conferencia_confirmada/);
assert.match(sql, /status = 'aprovado'/);
assert.match(sql, /grant select on public\.acompanhamento_documentos_entrada to authenticated/);
assert.doesNotMatch(sql, /grant (insert|update|delete) on public\.acompanhamento_documentos_/i);

console.log(JSON.stringify({ status:'ok', reader:'gemini-free+local-fallback', templates:samples.length, paid_api:false, human_review:true }));
