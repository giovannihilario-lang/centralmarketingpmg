const BASE = String(process.env.PMG_CAMPAIGNS_API || 'http://localhost:3001/api').replace(/\/$/, '');
const endpoint = `${BASE}/campanhas-data`;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const raw = await response.text();
  let data;
  try { data = raw ? JSON.parse(raw) : {}; }
  catch { throw new Error(`HTTP ${response.status} sem JSON: ${raw.slice(0, 200)}`); }
  if (!response.ok && response.status !== 202) throw new Error(data.erro || data.message || `HTTP ${response.status}`);
  return data;
}

async function main() {
  console.log(`API: ${endpoint}`);
  await request(`${endpoint}?recurso=contexto-preparar`, { method: 'POST' });

  for (let attempt = 1; attempt <= 240; attempt += 1) {
    const status = await request(`${endpoint}?recurso=contexto-status&_=${Date.now()}`);
    console.log(`[${String(status.progress || 0).padStart(3)}%] ${status.message || status.status}`);
    if (status.ready) {
      const payload = await request(`${endpoint}?recurso=contexto&_=${Date.now()}`);
      const context = payload.context || {};
      console.table({
        fornecedores: context.suppliers?.length || 0,
        produtos: context.products?.length || 0,
        representantesAtivos: context.representatives?.length || 0,
        atualizadoEm: payload.updatedAt || status.updatedAt || '—',
      });
      return;
    }
    if (status.status === 'error') throw new Error(status.error?.message || status.message || 'Falha na preparação.');
    await sleep(750);
  }
  throw new Error('A preparação excedeu três minutos.');
}

main().catch((error) => {
  console.error('Falha:', error.message);
  process.exitCode = 1;
});
