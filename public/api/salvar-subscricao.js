import { getPool, sql } from '../src/lib/db.js';
import { TABELAS } from '../src/lib/tabelas.js';

import { requireSupabaseUser, sendAuthError } from '../src/lib/supabase-auth.js';
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  try { await requireSupabaseUser(req); } catch (error) { return sendAuthError(res, error); }
  const sub = req.body;
  if (!sub?.endpoint) return res.status(400).json({ erro: 'Subscription inválida.' });

  try {
    const pool = await getPool();
    const request = pool.request();
    request.input('endpoint', sql.NVarChar(450), sub.endpoint);
    request.input('p256dh', sql.NVarChar(200), sub.keys.p256dh);
    request.input('auth', sql.NVarChar(200), sub.keys.auth);

    await request.query(`
      MERGE ${TABELAS.push_subscriptions} AS destino
      USING (SELECT @endpoint AS endpoint) AS origem ON destino.endpoint = origem.endpoint
      WHEN MATCHED THEN UPDATE SET p256dh = @p256dh, auth = @auth
      WHEN NOT MATCHED THEN INSERT (endpoint, p256dh, auth) VALUES (@endpoint, @p256dh, @auth);
    `);

    return res.status(200).json({ ok: true });
  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
}
