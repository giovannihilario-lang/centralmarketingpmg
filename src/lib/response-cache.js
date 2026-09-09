// Cache em memória (por processo) para respostas dos endpoints locais que
// escaneiam o snapshot comercial diário inteiro (`forEachRegionalFact`).
//
// Por quê: cada troca de filtro no Dashboard Regional dispara ~14 requisições
// em paralelo (KPIs, evolução, ranking, 6 catálogos de chip, etc.) e, sem
// cache, CADA uma faz sua própria varredura completa do snapshot (o arquivo
// local chega a 140+MB comprimidos) — tudo isso no mesmo processo Node de
// thread única, então as "14 em paralelo" na prática competem por CPU e
// travam a página por vários segundos. O snapshot só é atualizado uma vez por
// dia (ver ensureDailySnapshot), então cachear a resposta por alguns minutos
// não arrisca mostrar dado desatualizado dentro da mesma sessão de trabalho.
//
// Também deduplica requisições idênticas em voo (in-flight): se duas
// requisições pedem a mesma chave antes da primeira terminar, a segunda
// aguarda o mesmo resultado em vez de escanear o snapshot de novo.

const CACHE = new Map();
const MAX_ENTRIES = 400;

export function cacheKeyFor(prefix, query) {
  const entries = Object.entries(query || {})
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([a], [b]) => a.localeCompare(b));
  return `${prefix}|${JSON.stringify(entries)}`;
}

export async function withResponseCache(key, ttlMs, factory) {
  const now = Date.now();
  const hit = CACHE.get(key);
  if (hit) {
    if (hit.pending) return hit.pending;
    if (hit.expires > now) return hit.value;
  }

  const pending = (async () => factory())();
  CACHE.set(key, { pending, expires: 0 });
  try {
    const value = await pending;
    CACHE.set(key, { value, expires: Date.now() + ttlMs });
    if (CACHE.size > MAX_ENTRIES) {
      const first = CACHE.keys().next().value;
      CACHE.delete(first);
    }
    return value;
  } catch (error) {
    CACHE.delete(key);
    throw error;
  }
}
