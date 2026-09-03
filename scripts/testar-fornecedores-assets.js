import assert from 'node:assert/strict';
import fs from 'node:fs';
import { detectMagicMime, validateAssetMeta, sha256Hex } from '../public/assets/wave2-core.js';

assert.equal(detectMagicMime(Uint8Array.from([0xff,0xd8,0xff,0,0])),'image/jpeg');
assert.equal(detectMagicMime(Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])),'image/png');
assert.equal(detectMagicMime(new TextEncoder().encode('%PDF-1.7')),'application/pdf');
assert.equal(validateAssetMeta({name:'fake.jpg',size:100,mime:'image/jpeg',detectedMime:'application/pdf'}).ok,false,'MIME spoof deve falhar');
assert.equal(validateAssetMeta({name:'huge.png',size:11*1024*1024,mime:'image/png',detectedMime:'image/png'}).ok,false,'arquivo >10MB deve falhar');
const low=validateAssetMeta({name:'small.png',size:1000,mime:'image/png',detectedMime:'image/png',width:500,height:500});
assert.ok(low.warnings.length>=1,'imagem pequena deve gerar warning');
assert.equal(await sha256Hex('abc'),'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
const sql=fs.readFileSync(new URL('../sql/27-WAVE2-OPERACOES.sql',import.meta.url),'utf8');
assert.match(sql,/idx_fornecedor_assets_hash_supplier/);
assert.match(sql,/idx_fornecedor_submissoes_token_hash/,'retry externo deve ser idempotente por token+hash');
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
for(const marker of ['wave2MagicMime','WAVE2_MIME_SPOOF','WAVE2_HASH_MISMATCH','WAVE2_PATH_SCOPE','exigirCapacidadeWave2']) assert.ok(server.includes(marker),`servidor sem ${marker}`);
console.log('FORNECEDORES_ASSETS_WAVE2: PASS');
