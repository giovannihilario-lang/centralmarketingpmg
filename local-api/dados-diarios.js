import {
  ensureDailySnapshot,
  forceDailySnapshot,
  getDailySnapshotStatus,
  startDailySnapshot,
} from '../src/lib/daily-commercial-snapshot.js';

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  const action = String(req.query?.acao || req.query?.action || 'status').trim().toLowerCase();

  try {
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (action === 'status') return res.status(200).json(getDailySnapshotStatus());

    if (action === 'iniciar' || action === 'start') {
      const status = startDailySnapshot();
      return res.status(status.ready && status.day === status.today ? 200 : 202).json(status);
    }

    if (action === 'garantir' || action === 'ensure') {
      await ensureDailySnapshot();
      return res.status(200).json(getDailySnapshotStatus());
    }

    if (action === 'forcar' || action === 'force') {
      if (!['POST', 'PUT'].includes(req.method)) {
        return res.status(405).json({ message: 'Use POST para forçar uma nova sincronização.' });
      }
      await forceDailySnapshot();
      return res.status(200).json(getDailySnapshotStatus());
    }

    return res.status(400).json({ message: `Ação inválida: ${action}` });
  } catch (error) {
    console.error('[dados-diarios]', error);
    return res.status(503).json({
      ...getDailySnapshotStatus(),
      ok: false,
      message: error?.message || 'Não foi possível preparar os dados comerciais do dia.',
      code: error?.code || 'PMG_DAILY_SNAPSHOT_ERROR',
    });
  }
}
