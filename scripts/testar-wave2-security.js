import assert from 'node:assert/strict';
import fs from 'node:fs';
const sql=fs.readFileSync(new URL('../sql/27-WAVE2-OPERACOES.sql',import.meta.url),'utf8');
for(const table of ['fornecedor_contatos','fornecedor_obrigacoes','fornecedor_assets','fornecedor_followups','fornecedor_portal_tokens','fornecedor_portal_submissoes','academia_inscricoes','academia_presencas','automacao_execucoes','operational_audit_events']) assert.ok(sql.includes(`'${table}'`),`tabela fora da lista RLS ${table}`);
assert.match(sql,/alter table public\.%I enable row level security/,'migration precisa habilitar RLS dinamicamente');
assert.match(sql,/revoke select on public\.fornecedor_portal_tokens from authenticated/);
assert.match(sql,/grant execute on function public\.finalizar_asset_fornecedor_v2[\s\S]*to service_role/);
assert.match(sql,/wave2_tem_capacidade\('materiais'\)/);
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
assert.match(server,/exigirCapacidadeWave2\(req, 'materiais'\)/,'backend interno deve validar capability');
assert.match(server,/WAVE2_PATH_SCOPE/);assert.match(server,/actualHash/);assert.match(server,/actualMime/);
const publicFiles=['public/assets/wave2-operacoes.js','public/assets/fornecedor-envio.js','public/assets/academia-checkin.js','public/assets/academia-wave2.js','public/operacoes.html','public/fornecedor-envio.html','public/academia-checkin.html'];
const secretRe=/(service[_-]?role|SUPABASE_SERVICE_ROLE|BEGIN PRIVATE KEY|mssql:\/\/|password\s*[:=]\s*['"][^'"]+)/i;
for(const file of publicFiles){const text=fs.readFileSync(new URL(`../${file}`,import.meta.url),'utf8');assert.equal(secretRe.test(text),false,`possível segredo em ${file}`)}
console.log('WAVE2_SECURITY: PASS');
