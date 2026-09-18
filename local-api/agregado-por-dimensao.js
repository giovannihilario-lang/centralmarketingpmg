import { forEachRegionalFact } from '../src/lib/daily-commercial-snapshot.js';
import { erroApi } from '../src/lib/regional-dashboard.js';
import { cacheKeyFor, withResponseCache } from '../src/lib/response-cache.js';

const CACHE_MS = 5 * 60_000;
// Zona e Cidade são texto livre digitado por gente — a mesma cidade/zona
// aparece com casing diferente em pedidos diferentes ("São Paulo" e "SAO
// PAULO", "Nova Zona" e "NOVA ZONA" — confirmado no snapshot real), o que
// divide o faturamento de UM lugar em duas linhas separadas e quebra
// qualquer comparação de crescimento/queda por esse lugar (aparecia como
// dois estados/cidades "bugados" na Apresentação 1). Uniformiza pra Title
// Case sem acento antes de agrupar — sem acento pra não depender de qual
// grafia "ganha" por sorte — então as duas variantes caem no mesmo balde.
const titleCase = (value) => String(value || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\b\p{L}/gu, (c) => c.toUpperCase());
const DIMENSOES = {
  Regiao: ({ client }) => titleCase(client.z),
  UF: ({ client }) => client.uf,
  // Cidade sozinha repete nome entre estados (ex.: duas "Bonito" diferentes)
  // — "Cidade (UF)" desambigua sem precisar de outra coluna no snapshot.
  Cidade: ({ client }) => client.ci ? `${titleCase(client.ci)} (${client.uf})` : '',
  Segmento: ({ client }) => client.se,
  Grupo: ({ product }) => product.g,
  Fornecedor: ({ product }) => product.sn,
  SubGrupo: ({ product }) => product.sg,
};
const METRICAS = {
  Valor: ({ line }) => Number(line.v) || 0,
  'Qtde Kg': ({ line }) => Number(line.kg) || 0,
};

export default async function handler(req, res) {
  try {
    const dim = DIMENSOES[req.query.p_dimensao];
    const metric = METRICAS[req.query.p_metrica];
    if (!dim) return res.status(400).json({ message: `Dimensão inválida: ${req.query.p_dimensao}` });
    if (!metric) return res.status(400).json({ message: `Métrica inválida: ${req.query.p_metrica}` });
    const limit = Math.max(1, Math.min(1000, Number.parseInt(req.query.p_limit, 10) || 10));
    const data = await withResponseCache(cacheKeyFor('agregado-por-dimensao', req.query), CACHE_MS, async () => {
      const map = new Map();
      await forEachRegionalFact(req.query, (fact) => {
        const key = String(dim(fact) ?? '').trim();
        if (!key) return;
        map.set(key, (map.get(key) || 0) + metric(fact));
      });
      const totalGeral = [...map.values()].reduce((sum, value) => sum + value, 0);
      return [...map.entries()]
        .map(([chave, total]) => ({ chave, total, total_geral: totalGeral }))
        .sort((a, b) => b.total - a.total)
        .slice(0, limit);
    });
    res.setHeader('X-PMG-Data-Source', 'DAILY-SNAPSHOT');
    return res.status(200).json(data);
  } catch (err) { return erroApi(res, err); }
}
