import { createClient } from '@supabase/supabase-js';

let authClient = null;

function getAuthClient() {
  if (authClient) return authClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    const error = new Error('SUPABASE_URL / SUPABASE_ANON_KEY não configuradas.');
    error.status = 503;
    throw error;
  }
  authClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return authClient;
}

export function bearerToken(req) {
  const value = String(req?.headers?.authorization || '');
  return value.startsWith('Bearer ') ? value.slice(7).trim() : '';
}

export async function requireSupabaseUser(req) {
  const token = bearerToken(req);
  if (!token) {
    const error = new Error('Autenticação obrigatória.');
    error.status = 401;
    throw error;
  }

  const client = getAuthClient();
  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) {
    const authError = new Error('Sessão inválida ou expirada.');
    authError.status = 401;
    throw authError;
  }
  return data.user;
}

export async function requireUserOrCron(req) {
  const token = bearerToken(req);
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && token === cronSecret) return { type: 'cron' };
  const user = await requireSupabaseUser(req);
  return { type: 'user', user };
}

export function sendAuthError(res, error) {
  return res.status(error?.status || 401).json({ erro: error?.message || 'Não autorizado.' });
}
