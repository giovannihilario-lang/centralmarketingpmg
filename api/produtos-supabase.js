import { requireSupabaseUser, sendAuthError } from '../src/lib/supabase-auth.js';

/**
 * Catálogo visual PMG — somente leitura.
 * O nome da rota foi mantido por compatibilidade, mas nenhuma informação é
 * gravada no Supabase. A API externa da PMG é cacheada em memória para que as
 * imagens de Campanhas não provoquem uma nova carga completa a cada lote.
 */

let catalogCache = null;
let catalogCachedAt = 0;
let catalogInFlight = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

async function carregarCatalogo({ force = false } = {}) {
  if (!force && catalogCache && Date.now() - catalogCachedAt < CACHE_TTL_MS) return catalogCache;
  if (catalogInFlight) return catalogInFlight;

  catalogInFlight = (async () => {
    const apiUrl = process.env.PMG_API_URL;
    const usuario = process.env.PMG_USUARIO;
    const senha = process.env.PMG_SENHA;
    if (!apiUrl || !usuario || !senha) {
      const error = new Error('Configuração da API visual PMG incompleta.');
      error.code = 'PMG_CATALOG_ENV_MISSING';
      throw error;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30000);
    try {
      const auth = Buffer.from(`${usuario}:${senha}`).toString('base64');
      const response = await fetch(apiUrl, { headers:{ Authorization:`Basic ${auth}` }, signal:controller.signal });
      const raw = await response.text();
      if (!response.ok) throw new Error(`API PMG retornou ${response.status}: ${raw.slice(0,180)}`);
      const parsed = raw ? JSON.parse(raw) : [];
      catalogCache = Array.isArray(parsed) ? parsed : [];
      catalogCachedAt = Date.now();
      return catalogCache;
    } finally {
      clearTimeout(timer);
      catalogInFlight = null;
    }
  })();

  return catalogInFlight;
}

export default async function handler(req, res) {
  try { await requireSupabaseUser(req); } catch (error) { return sendAuthError(res, error); }
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  try {
    const produtos = await carregarCatalogo({ force:String(req.query?.refresh || '').toLowerCase() === 'true' });
    const idsRaw = String(req.query?.ids || '').trim();
    const ids = new Set(idsRaw.split(',').map((value) => String(value).trim()).filter(Boolean).slice(0,500));
    const busca = String(req.query?.busca || '').trim().toLocaleLowerCase('pt-BR');
    const limite = Math.min(Math.max(Number.parseInt(req.query?.limite,10) || 100,1),500);

    const items = produtos.filter((produto) => {
      if (ids.size && !ids.has(String(produto.ID))) return false;
      if (busca && !`${produto.ID} ${produto.Nome || ''} ${produto.Descricao || ''}`.toLocaleLowerCase('pt-BR').includes(busca)) return false;
      return true;
    }).slice(0,limite).map((produto) => ({
      id:produto.ID,
      id_categoria:produto.ID_Categoria,
      id_subcategoria:produto.ID_SubCategoria,
      nome:produto.Nome,
      preco_entrega:produto.Preco_Entrega,
      preco_retira:produto.Preco_Retira,
      imagem:produto.Imagem?.replace(/\\/g,'/') || '',
      descricao:produto.Descricao || '',
      oferta_retirada:produto.Ofertas_para_retirar_em_nossa_loja === 'Sim',
      oferta_entrega:produto.Ofertas_para_entregar_em_seu_estabelecimento === 'Sim',
      destaque:produto.Produtos_em_destaque === 'Sim',
    }));

    res.setHeader('Cache-Control','s-maxage=600, stale-while-revalidate=900');
    res.setHeader('X-PMG-Catalog-Cache', catalogCache ? 'memory' : 'miss');
    return res.status(200).json(items);
  } catch (error) {
    console.error('[produtos-supabase]',error);
    return res.status(error?.name === 'AbortError' ? 504 : 500).json({
      erro:error?.name === 'AbortError' ? 'A API visual PMG excedeu 30 segundos.' : error.message,
      codigo:error.code || error.name || 'PMG_CATALOG_ERROR',
    });
  }
}
