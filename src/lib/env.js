// Leitura defensiva de variaveis de ambiente do Supabase.
//
// api/notificar-demandas.js ja precisou disso: no painel da Vercel e comum
// colar sem querer o valor entre aspas, com espaco/quebra de linha sobrando,
// ou o "NOME_DA_VARIAVEL=" grudado junto com o valor. Quando isso acontece
// aqui, process.env.SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY
// fica com lixo e os clients do Supabase falham silenciosamente (ou com
// "URL invalida"), mesmo com a variavel "configurada" no painel.
export function cleanEnvValue(value, expectedName = '') {
  let text = String(value == null ? '' : value).trim();
  if (!text) return '';

  const assignment = text.match(/^(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.+)$/is);
  if (assignment && (!expectedName || assignment[1].toUpperCase() === expectedName.toUpperCase())) {
    text = assignment[2].trim();
  }

  if (
    text.length >= 2 &&
    ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'")))
  ) {
    text = text.slice(1, -1).trim();
  }

  return text;
}

// URL e chave publishable do projeto Supabase do PMG Connect. Nao sao
// segredo (o mesmo par ja vai embutido no bundle do frontend, visivel a
// qualquer visitante); usados aqui so como fallback caso a variavel de
// ambiente falhe em chegar na funcao (ja aconteceu antes, ver
// api/notificar-demandas.js), pra login/leitura nao pararem por causa
// disso. NUNCA fazer o mesmo com a service role key (essa e secreta).
const PUBLIC_SUPABASE_URL = 'https://scokolfzvtzohrzdgisz.supabase.co';
const PUBLIC_SUPABASE_ANON_KEY = 'sb_publishable_inJrO1hMCTys3g7FAyjV3w_4TVfLOok';

function normalizeSupabaseUrl(value) {
  let text = cleanEnvValue(value, 'SUPABASE_URL');
  if (!text) return '';

  if (!/^https?:\/\//i.test(text) && /^[a-z0-9.-]+(?::\d+)?(?:\/.*)?$/i.test(text)) {
    text = `https://${text}`;
  }

  try {
    const parsed = new URL(text);
    if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname) return '';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return '';
  }
}

export function resolveSupabaseUrl() {
  return normalizeSupabaseUrl(process.env.SUPABASE_URL) || PUBLIC_SUPABASE_URL;
}

export function resolveAnonKey() {
  return cleanEnvValue(process.env.SUPABASE_ANON_KEY, 'SUPABASE_ANON_KEY')
    || cleanEnvValue(process.env.SUPABASE_PUBLISHABLE_KEY, 'SUPABASE_PUBLISHABLE_KEY')
    || PUBLIC_SUPABASE_ANON_KEY;
}

export function resolveServiceKey() {
  return cleanEnvValue(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY')
    || cleanEnvValue(process.env.SUPABASE_ROLE_KEY, 'SUPABASE_ROLE_KEY');
}
