const base = String(process.env.PMG_LOCAL_API || 'http://localhost:3001/api').replace(/\/$/, '');
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function get(path) {
  const started = Date.now();
  const response = await fetch(`${base}${path}`);
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`HTTP ${response.status} sem JSON: ${raw.slice(0,180)}`); }
  return { status:response.status, ms:Date.now()-started, data };
}

console.log(`\nTeste do módulo Campanhas em ${base}\n`);
try {
  let bootstrap = await get('/campanhas-data?recurso=bootstrap');
  console.log(`bootstrap: HTTP ${bootstrap.status} · ${bootstrap.ms} ms · ready=${bootstrap.data.ready} · warming=${bootstrap.data.warming}`);

  for (let attempt=1; attempt<=20 && !bootstrap.data.ready; attempt++) {
    process.stdout.write(`Aguardando aquecimento SQL (${attempt}/20)…\r`);
    await wait(2500);
    bootstrap = await get('/campanhas-data?recurso=bootstrap');
  }
  process.stdout.write(' '.repeat(80) + '\r');

  if (!bootstrap.data.ready) {
    console.error('A API respondeu rápido, mas o SQL não terminou de aquecer. Confira o terminal do npm start.');
    process.exitCode = 1;
  } else {
    console.log(`cache pronto: ${bootstrap.data.fornecedores?.length || 0} fornecedores · ${bootstrap.data.representantes?.length || 0} representantes ativos`);
    const supplier = bootstrap.data.fornecedores?.[0];
    if (supplier) {
      const products = await get(`/campanhas-data?recurso=produtos&fornecedorId=${encodeURIComponent(supplier.id || '')}&fornecedor=${encodeURIComponent(supplier.nome)}&limite=10`);
      console.log(`produtos de ${supplier.nome}: HTTP ${products.status} · ${products.ms} ms · ${products.data.items?.length || 0}/${products.data.total || 0}`);
    }
    const diagnostic = await get('/campanhas-data?recurso=diagnostico');
    console.log(`diagnóstico: HTTP ${diagnostic.status} · ${diagnostic.ms} ms · banco=${diagnostic.data.sql?.banco || '—'}`);
    console.log('\nTudo certo. O primeiro aquecimento pode demorar, mas a interface e os endpoints de cache não ficam bloqueados.\n');
  }
} catch (error) {
  console.error(`Falha: ${error.message}`);
  console.error('Execute npm start em outro terminal e tente novamente.');
  process.exitCode = 1;
}
