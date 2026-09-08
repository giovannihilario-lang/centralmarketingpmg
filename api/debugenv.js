import { resolveSupabaseUrl, resolveAnonKey, resolveServiceKey } from '../src/lib/env.js';

// Diagnostico TEMPORARIO (2026-09-08) so pra descobrir por que
// SUPABASE_SERVICE_ROLE_KEY nao resolve em producao mesmo apos a limpeza
// defensiva em src/lib/env.js. Nao expoe nenhum valor secreto: so
// confirma presenca/tamanho. Remover depois de diagnosticar.
export default function handler(req, res) {
  const url = resolveSupabaseUrl();
  const anon = resolveAnonKey();
  const service = resolveServiceKey();
  return res.status(200).json({
    url_presente: Boolean(process.env.SUPABASE_URL),
    url_resolvida_host: url ? new URL(url).host : null,
    anon_key_env_presente: Boolean(process.env.SUPABASE_ANON_KEY),
    anon_key_publishable_env_presente: Boolean(process.env.SUPABASE_PUBLISHABLE_KEY),
    anon_key_resolvida_tamanho: anon.length,
    service_role_key_env_presente: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    service_role_key_env_tamanho: String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').length,
    role_key_legado_env_presente: Boolean(process.env.SUPABASE_ROLE_KEY),
    service_key_resolvida_tamanho: service.length,
    vercel_env: process.env.VERCEL_ENV || null,
  });
}
