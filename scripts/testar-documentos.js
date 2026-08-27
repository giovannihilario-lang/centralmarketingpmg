import assert from 'node:assert/strict';
import fs from 'node:fs';
import '../public/assets/acompanhamento-ocr.js';
import { DOCUMENT_SCHEMA, geminiModelCandidates, providerMessage, shouldRetryGemini, validateAnalysis } from '../api/analisar-documento.js';

const { classify, parsePage, parseBrazilianMoney } = globalThis.PMGDocumentOCR;

assert.equal(parseBrazilianMoney('R$ 2.069,76'), 2069.76);
assert.equal(parseBrazilianMoney('215.255,04'), 215255.04);

const samples = [
  {
    type:'desconto_nota',
    text:`CADASTRO DE PAGAMENTO\nFORNECEDOR: COAMO AGROINDUSTRIAL\nVALOR BRUTO R$ 205.867,05\nDESC R$ 7.147,99 REF. ACORDO MKT\nVALOR LIQUIDO R$ 198.719,06\nDATA DE PAGAMENTO 07/08/2026`,
    expectedMarketing:7147.99,
  },
  {
    type:'desconto_nota',
    text:`PEDIDO DE COMPRA Nº 333428\nFORNECEDOR: BATATAS LAMB WESTON\nTOTAL DO PEDIDO R$ 215.255,04\nSOBRAS MARKETING R$ 2.069,76\nVENCIMENTO 02/09/2026`,
    expectedMarketing:2069.76,
  },
  {
    type:'deposito',
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

const lowConfidence = parsePage(samples[1].text, 6, 40);
assert.equal(lowConfidence.valor_lancamento_sugerido, null, 'OCR de baixa confiança não deve sugerir valor financeiro.');
assert.equal(lowConfidence.origem_leitura, 'ocr_local');
assert.match(lowConfidence.modelo_leitura, /tesseract-v6/);

const genericDescription = parsePage(`CADASTRO DE PAGAMENTO\nFORNECEDOR: TESTE ALIMENTOS\nDESCRICAO DO ITEM R$ 9.999,99\nVALOR BRUTO R$ 10.000,00`, 7, 95);
assert.equal(genericDescription.valor_marketing, null, 'A palavra descrição não pode ser confundida com DESC/MKT.');

const html = fs.readFileSync(new URL('../public/acompanhamento.html', import.meta.url), 'utf8');
assert.match(html, /pdfjs-dist@3\.11\.174/);
assert.match(html, /tesseract\.js@5\.1\.1/);
assert.match(html, /acompanhamento-ocr\.js\?v=1\.2\.6/);
assert.match(html, /acompanhamento-documentos\.css\?v=1\.2\.9/);
assert.match(html, /acompanhamento-documentos\.js\?v=1\.2\.10/);
assert.match(html, /connect-auth\.js\?v=1\.2\.2/);

const documentModule = fs.readFileSync(new URL('../public/assets/acompanhamento-documentos.js', import.meta.url), 'utf8');
assert.match(documentModule, /PMGDocumentOCR\.analyzePdf/);
assert.match(documentModule, /\/api\/analisar-documento/);
assert.match(documentModule, /Leitura protegida · contingência automática/);
assert.doesNotMatch(documentModule, /context\.notify\(`\$\{geminiError/);
assert.match(documentModule, /return \(\) => cancelAnimationFrame\(frame\)/, 'O efeito dos icones precisa devolver uma funcao de limpeza.');

assert.equal(shouldRetryGemini(503, 'gemini-3.7-flash is currently experiencing high demand'), true);
assert.equal(shouldRetryGemini(400, 'invalid request'), false);
assert.match(providerMessage({ error:{ message:'gemini-3.7-flash is currently experiencing high demand' } }, 503), /leitura visual esta ocupada/i);
assert.doesNotMatch(providerMessage({ error:{ message:'gemini-3.7-flash is currently experiencing high demand' } }, 503), /high demand/i);
const candidates = geminiModelCandidates();
assert.deepEqual(candidates.slice(0, 3), ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash']);
const apiSource = fs.readFileSync(new URL('../api/analisar-documento.js', import.meta.url), 'utf8');
assert.doesNotMatch(apiSource, /type:'document'[^\n]*resolution:/, 'PDF inline da Interactions API nao deve enviar resolution; o endpoint em producao rejeita esse parametro.');
assert.match(apiSource, /thinking_level:mode === 'reescan' \? 'high' : 'medium'/);
assert.match(apiSource, /GEMINI_DOCUMENT_FALLBACK_MODELS/);

assert.match(documentModule, /canonicalSupplierName\(extracted\.fornecedor, context\.allRecords\)/, 'O fornecedor lido deve ser reconciliado com o nome curto já usado na Central.');
assert.match(documentModule, /context\.navigatePayments\(paymentNavigation\(form, supplier\)\)/, 'Ao lançar pagamento, a conferência deve abrir a planilha de pagamentos.');
assert.match(documentModule, /\['fornecedores'\]/, 'Lançamentos de Marketing com fornecedor precisam entrar na planilha de pagamentos.');
assert.match(apiSource, /Prefira o nome comercial curto e reconhecivel do fornecedor/);

const envExample = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
assert.doesNotMatch(envExample, /OPENAI_API_KEY/);
assert.match(envExample, /GEMINI_DOCUMENT_MODEL=gemini-3\.7-flash/);

assert.deepEqual(DOCUMENT_SCHEMA.properties.documentos.items.properties.tipo.enum.sort(), [
  'deposito', 'desconto_nota', 'extrato_bancario', 'nao_identificado'
]);
const validated = validateAnalysis({
  total_paginas:1,
  resumo:'Leitura de teste',
  documentos:[{ tipo:'deposito', paginas:[1], confianca:.91, valor_total_documento:10064.6 }],
});
assert.equal(validated.documentos[0].tipo, 'deposito');
assert.equal(validated.documentos[0].valor_total_documento, 10064.6);
assert.ok(validated.documentos[0].alertas.some(alert => /Confira o PDF original/i.test(alert)));
const sanitized = validateAnalysis({
  total_paginas:1,
  documentos:[{ tipo:'desconto_nota', paginas:[1], confianca:.8, fornecedor:'PMG ATACADISTA', data_emissao:'2026-02-31', valor_total_documento:100, valor_marketing:150, valor_lancamento_sugerido:150, evidencias:['Marketing R$ 150,00'] }],
});
assert.equal(sanitized.documentos[0].fornecedor, null);
assert.equal(sanitized.documentos[0].data_emissao, null);
assert.equal(sanitized.documentos[0].valor_lancamento_sugerido, null);
assert.ok(sanitized.documentos[0].campos_duvidosos.includes('fornecedor'));

const legacyValidated = validateAnalysis({
  total_paginas:3,
  resumo:'Compatibilidade',
  documentos:[
    { tipo:'cadastro_pagamento', paginas:[1], confianca:.8 },
    { tipo:'pedido_compra', paginas:[2], confianca:.8 },
    { tipo:'danfe', paginas:[3], confianca:.8 },
  ],
});
assert.deepEqual(legacyValidated.documentos.map(item => item.tipo), ['desconto_nota', 'desconto_nota', 'deposito']);

const sql = fs.readFileSync(new URL('../sql/08-CAIXA-ENTRADA-DOCUMENTOS.sql', import.meta.url), 'utf8');
assert.match(sql, /conferencia_confirmada/);
assert.match(sql, /status = 'aprovado'/);
assert.match(sql, /grant select on public\.acompanhamento_documentos_entrada to authenticated/);
assert.doesNotMatch(sql, /grant (insert|update|delete) on public\.acompanhamento_documentos_/i);

console.log(JSON.stringify({ status:'ok', reader:'gemini-free+local-fallback', templates:samples.length, paid_api:false, human_review:true }));
