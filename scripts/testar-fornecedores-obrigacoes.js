import assert from 'node:assert/strict';
import fs from 'node:fs';
import { obligationDirection, obligationFlags, matrixFromObligations, preferredContact, buildFollowupDraft } from '../public/assets/wave2-core.js';

assert.equal(obligationDirection('aprovado','fornecedor'),'concluido');
assert.equal(obligationDirection('recebido','fornecedor'),'pmg');
assert.equal(obligationDirection('ajuste_solicitado','pmg'),'fornecedor');
const overdue=obligationFlags({prazo:'2026-09-01',status:'pendente',direcao_responsabilidade:'fornecedor'},new Date('2026-09-03T12:00:00-03:00'));
assert.equal(overdue.overdue,true); assert.equal(overdue.waitingSupplier,true);
const matrix=matrixFromObligations([
 {id:'1',fornecedor_id:1,fornecedor_nome:'A',tipo:'anuncio_catalogo',status:'aprovado',direcao_responsabilidade:'concluido'},
 {id:'2',fornecedor_id:1,fornecedor_nome:'A',tipo:'logo',status:'pendente',prazo:'2026-09-01',direcao_responsabilidade:'fornecedor'}
],['anuncio_catalogo','logo']);
assert.equal(matrix[0].overallLabel,'Atrasado');
const contact=preferredContact([{id:'m',nome:'Maria',departamento:'Marketing',preferido:true,ativo:true},{id:'f',nome:'Carlos',departamento:'Financeiro',ativo:true}],'anuncio_catalogo');
assert.equal(contact.id,'m');
assert.match(buildFollowupDraft({supplierName:'McCain',contact,obligations:[{titulo:'Anúncio',prazo:'2026-09-10'}]}),/Anúncio/);

const sql=fs.readFileSync(new URL('../sql/27-WAVE2-OPERACOES.sql',import.meta.url),'utf8');
for(const token of ['fornecedor_obrigacoes','direcao_responsabilidade','criar_demanda_para_obrigacao_v2','registrar_followup_fornecedor_v2','criar_portal_fornecedor_token_v2']) assert.ok(sql.includes(token),`migration sem ${token}`);
assert.match(sql,/constraint fornecedor_obrigacao_status[\s\S]*pendente[\s\S]*solicitado[\s\S]*recebido[\s\S]*em_revisao[\s\S]*ajuste_solicitado[\s\S]*aprovado[\s\S]*dispensado/);
console.log('FORNECEDORES_OBRIGACOES_WAVE2: PASS');
