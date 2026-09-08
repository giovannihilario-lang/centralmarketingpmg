import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const centralPath = path.join(root, 'public', 'central.html');
const packagePath = path.join(root, 'package.json');

function fail(message) {
  console.error(`PLANEJAMENTO_ESTRATEGICO_INSTALL: FAIL · ${message}`);
  process.exit(1);
}

if (!existsSync(centralPath)) fail('public/central.html não encontrado. Execute na raiz do PMG Connect.');
if (!existsSync(packagePath)) fail('package.json não encontrado. Execute na raiz do PMG Connect.');

let central = await readFile(centralPath, 'utf8');
let centralChanged = false;

if (!central.includes('<strong>Planejamento Estratégico</strong>')) {
  const marker = '<div class="quick-grid">';
  if (!central.includes(marker)) fail('Não encontrei a quick-grid da Central. Nenhum arquivo foi alterado.');
  const card = `\n          <a class="quick-link" href="/planejamento-estrategico.html"><strong>Planejamento Estratégico</strong><span>Meta 200M, oportunidades, projetos e ciclo de 90 dias.</span><b>Abrir →</b></a>`;
  central = central.replace(marker, `${marker}${card}`);
  centralChanged = true;
  console.log('✓ public/central.html: atalho rápido estratégico adicionado');
} else {
  console.log('✓ public/central.html: atalho rápido estratégico já instalado');
}

if (!central.includes('>Planejamento Estratégico</a>')) {
  const navMarker = '<a href="/catalogo.html" class="nav-link">';
  if (central.includes(navMarker)) {
    const nav = `<a href="/planejamento-estrategico.html" class="nav-link"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/><path d="m4 8 6-4 6 3 6-5"/></svg>Planejamento Estratégico</a>\n    `;
    central = central.replace(navMarker, `${nav}${navMarker}`);
    centralChanged = true;
    console.log('✓ public/central.html: navegação principal estratégica adicionada');
  } else {
    console.log('! public/central.html: marcador da navegação principal não encontrado; o atalho rápido foi mantido');
  }
} else {
  console.log('✓ public/central.html: navegação principal estratégica já instalada');
}

if (centralChanged) await writeFile(centralPath, central, 'utf8');

const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
pkg.scripts ||= {};
if (!pkg.scripts['estrategia:testar']) {
  pkg.scripts['estrategia:testar'] = 'node scripts/testar-planejamento-estrategico.mjs';
  await writeFile(packagePath, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8');
  console.log('✓ package.json: script estrategia:testar adicionado');
} else {
  console.log('✓ package.json: script estrategia:testar já existe');
}

console.log('PLANEJAMENTO_ESTRATEGICO_INSTALL: PASS');
