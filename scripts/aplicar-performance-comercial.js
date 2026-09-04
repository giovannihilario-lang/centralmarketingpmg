import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const centralPath = path.join(root, 'public', 'central.html');

if (!fs.existsSync(centralPath)) {
  console.error('ERRO: public/central.html não encontrado. Execute este script na raiz do PMG Connect.');
  process.exit(1);
}

const original = fs.readFileSync(centralPath, 'utf8');
const oldLabel = 'Dashboard de Vendas';
const newLabel = 'Performance Comercial';

if (original.includes(newLabel) && !original.includes(oldLabel)) {
  console.log('OK: Central já aponta para “Performance Comercial”. Nenhuma alteração necessária.');
  process.exit(0);
}

if (!original.includes(oldLabel)) {
  console.error('ERRO: não encontrei o rótulo “Dashboard de Vendas” em public/central.html.');
  console.error('O arquivo pode ser de outra versão. Nenhuma alteração foi feita.');
  process.exit(1);
}

const updated = original.replace(oldLabel, newLabel);
fs.writeFileSync(centralPath, updated, 'utf8');
console.log('OK: public/central.html atualizado: Dashboard de Vendas → Performance Comercial.');
