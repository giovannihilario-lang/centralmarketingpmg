import { createClient } from '@supabase/supabase-js';
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const sub = req.body;
  if (!sub?.endpoint) return res.status(400).json({ erro: 'Subscription inválida.' });

  const { error } = await supabase.from('push_subscriptions').upsert({
    endpoint: sub.endpoint,
    p256dh: sub.keys.p256dh,
    auth: sub.keys.auth,
  }, { onConflict: 'endpoint' });

  if (error) return res.status(500).json({ erro: error.message });
  res.status(200).json({ ok: true });
}