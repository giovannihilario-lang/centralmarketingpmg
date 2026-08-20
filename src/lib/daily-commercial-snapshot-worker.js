import 'dotenv/config';
import { parentPort, workerData } from 'node:worker_threads';
import { runSnapshotWorkerJob, snapshotDay } from './daily-commercial-snapshot.js';

const send = (payload) => {
  try { parentPort?.postMessage(payload); } catch {}
};

try {
  const day = String(workerData?.day || snapshotDay());
  const result = await runSnapshotWorkerJob({
    day,
    onProgress(phase, progress, message) {
      send({ type:'progress', phase, progress, message });
    },
  });
  send({ type:'done', result });
} catch (error) {
  send({
    type:'error',
    error:{
      message:error?.message || String(error),
      code:error?.code || error?.originalError?.code || 'PMG_DAILY_SNAPSHOT_WORKER_ERROR',
      stack:error?.stack || null,
    },
  });
  process.exitCode = 1;
}
