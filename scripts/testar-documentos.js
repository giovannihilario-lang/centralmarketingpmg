import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DOCUMENT_SCHEMA, validateAnalysis } from '../api/analisar-documento.js';

const itemSchema = DOCUMENT_SCHEMA.properties.documentos.items;
for (const required of itemSchema.required) {
  assert.ok(itemSchema.properties[required], `Campo obrigatorio ausente do schema: ${required}`);
}
assert.equal(new Set(itemSchema.required).size, itemSchema.required.length, 'Schema possui campos obrigatorios duplicados.');

const analysis = validateAnalysis({
  total_paginas:4,
  resumo:'Modelos recorrentes PMG',
  documentos:[
    {
      ordem:9, paginas:[2, 2, 1], tipo:'pedido_compra', confianca:1.7,
      fornecedor:'Batatas Lamb Weston', cnpj:null, fornecedor_codigo:'19555',
      numero_documento:'333428', numero_pedido:'333428', numero_nota:null,
      data_emissao:'2026-08-05', vencimento:'2026-09-02', data_pagamento:null,
      valor_total_documento:215255.04, valor_marketing:2069.76, valor_lancamento_sugerido:2069.76,
      natureza_sugerida:'receita', categoria_sugerida:'parceria', forma_pagamento:'28 dias',
      titulo_sugerido:'Sobras de Marketing - Lamb Weston', descricao:'Pedido de compra', observacoes:'Conferir',
      evidencias:['SOBRAS MARKETING R$ 2.069,76'], alertas:['Nao usar o total do pedido'], campos_duvidosos:[],
    },
  ],
});

assert.equal(analysis.documentos.length, 1);
assert.equal(analysis.documentos[0].ordem, 1, 'A ordem deve ser normalizada pelo servidor.');
assert.deepEqual(analysis.documentos[0].paginas, [1, 2]);
assert.equal(analysis.documentos[0].confianca, 1);
assert.equal(analysis.documentos[0].valor_lancamento_sugerido, 2069.76);

const invalid = validateAnalysis({ total_paginas:1, documentos:[{ tipo:'contrato', natureza_sugerida:'credito', categoria_sugerida:'inventada' }] });
assert.equal(invalid.documentos[0].tipo, 'nao_identificado');
assert.equal(invalid.documentos[0].natureza_sugerida, 'neutro');
assert.equal(invalid.documentos[0].categoria_sugerida, 'outro');

const html = fs.readFileSync(new URL('../public/acompanhamento.html', import.meta.url), 'utf8');
assert.match(html, /acompanhamento-documentos\.css\?v=1\.2\.0/);
assert.match(html, /acompanhamento-documentos\.js\?v=1\.2\.0/);

const sql = fs.readFileSync(new URL('../sql/08-CAIXA-ENTRADA-DOCUMENTOS.sql', import.meta.url), 'utf8');
assert.match(sql, /conferencia_confirmada/);
assert.match(sql, /status = 'aprovado'/);
assert.match(sql, /grant select on public\.acompanhamento_documentos_entrada to authenticated/);
assert.doesNotMatch(sql, /grant (insert|update|delete) on public\.acompanhamento_documentos_/i);

console.log(JSON.stringify({ status:'ok', schema_fields:itemSchema.required.length, document_types:itemSchema.properties.tipo.enum.length }));
