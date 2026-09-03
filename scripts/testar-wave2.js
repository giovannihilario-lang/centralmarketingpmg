import { spawnSync } from 'node:child_process';
const scripts=[
 'testar-calendario-wave2.js','testar-fornecedores-obrigacoes.js','testar-fornecedores-assets.js','testar-external-portal-wave2.js','testar-automacoes-wave2.js','testar-academia-wave2.js','testar-relacionamentos-wave2.js','testar-wave2-security.js'
];
for(const script of scripts){const r=spawnSync(process.execPath,[new URL(script,import.meta.url).pathname],{stdio:'inherit'});if(r.status!==0)process.exit(r.status||1)}
console.log('WAVE2: PASS');
