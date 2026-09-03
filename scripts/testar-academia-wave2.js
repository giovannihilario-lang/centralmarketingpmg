import assert from 'node:assert/strict';
import fs from 'node:fs';
import { matchRegistration, trainingStats } from '../public/assets/wave2-core.js';
const reps=[
 {code:'10',name:'Maria Silva',email:'maria@x.com',phone:'11999990000',region:'SP'},
 {code:'20',name:'João Santos',email:'joao@x.com',phone:'11888880000',region:'RJ'},
 {code:'30',name:'João Santoro',email:'js@x.com',phone:'11777770000',region:'SP'}
];
assert.equal(matchRegistration({code:'10',name:'Outro'},reps,[]).method,'codigo');
assert.equal(matchRegistration({email:'joao@x.com'},reps,[]).method,'email');
assert.equal(matchRegistration({phone:'11 99999-0000'},reps,[]).method,'telefone');
assert.equal(matchRegistration({name:'maria silva'},reps,[]).method,'nome_exato');
const fuzzy=matchRegistration({name:'joao santo'},reps,[]);assert.notEqual(fuzzy.status,'resolvido','fuzzy nunca deve auto-resolver');
const aliases=[{alias_original:'M. Silva',estado:'confirmado',representante_codigo:'10'}];assert.equal(matchRegistration({name:'M. Silva'},reps,aliases).method,'alias');
const stats=trainingStats(reps,[{match_status:'resolvido',representante_codigo:'10'},{match_status:'resolvido',representante_codigo:'20'}],[{representante_codigo:'10'}]);
assert.deepEqual({total:stats.total,registered:stats.registered,notRegistered:stats.notRegistered,present:stats.present,absent:stats.absent},{total:3,registered:2,notRegistered:1,present:1,absent:1});
const sql=fs.readFileSync(new URL('../sql/27-WAVE2-OPERACOES.sql',import.meta.url),'utf8');
assert.match(sql,/idx_academia_presenca_unica/,'presença duplicada deve ser impedida no banco');
assert.match(sql,/academia_inscricoes/);assert.match(sql,/academia_representante_aliases/);assert.match(sql,/criar_checkin_academia_v2/);
const ui=fs.readFileSync(new URL('../public/assets/academia-wave2.js',import.meta.url),'utf8');
const server=fs.readFileSync(new URL('../server.js',import.meta.url),'utf8');
assert.match(ui,/Mapeie pelo menos nome, código, e-mail ou telefone/);
assert.match(ui,/Não inscritos/);assert.match(ui,/data-lineage/);assert.match(ui,/registrar_presenca_academia_v2/);
assert.match(ui,/searchParams\.get\('treinamento'\)/,'deep link de treinamento precisa persistir');

assert.match(server,/createError\.code==='23505'/,'Check-in concorrente deve tratar unique violation como idempotência.');
assert.match(server,/operational_audit_events/,'Check-in QR deve alimentar audit trail.');
console.log('ACADEMIA_WAVE2: PASS');
