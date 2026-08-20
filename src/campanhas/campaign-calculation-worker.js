import 'dotenv/config';
import { parentPort, workerData } from 'node:worker_threads';

process.env.PMG_SNAPSHOT_READ_ONLY = 'true';
const send = (payload) => { try { parentPort?.postMessage(payload); } catch {} };

try {
  const resource = String(workerData?.resource || '');
  const payload = workerData?.payload || {};
  const module = await import('../../local-api/campanhas-data.js');
  const handlers = {
    'apuracao':module.queryPerformance,
    'auditoria-vendedor':module.querySellerAudit,
    'beneficio-primeira-compra':module.queryFirstPurchaseBenefit,
    'diagnostico-consistencia':module.queryConsistencyDiagnostic,
  };
  const handler = handlers[resource];
  if (typeof handler !== 'function') {
    const error = new Error(`Recurso pesado desconhecido: ${resource}`);
    error.code = 'PMG_CAMPAIGN_WORKER_RESOURCE';
    throw error;
  }
  const result = await handler(payload);
  send({ type:'done', result });
} catch (error) {
  send({ type:'error', error:{ message:error?.message || String(error), code:error?.code || error?.originalError?.code || 'PMG_CAMPAIGN_WORKER_ERROR', hint:error?.hint || error?.dica || '', stack:error?.stack || null } });
  process.exitCode = 1;
}
