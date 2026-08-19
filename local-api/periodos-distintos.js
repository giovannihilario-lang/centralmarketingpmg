import {
  getPool, CTE_BASE_REGIONAL, FROM_BASE_REGIONAL, aplicarFiltrosRegionais,
  responderCache, salvarCache, erroApi, CACHE_TTL_CATALOGO_MS,
} from '../src/lib/regional-dashboard.js';

const cache = new Map();

export default async function handler(req, res) {
  try {
    if (responderCache(req, res, cache, CACHE_TTL_CATALOGO_MS)) return;
    const pool = await getPool();
    const request = pool.request();
    // Sem filtros dimensionais não há motivo para atravessar VendasProdutos,
    // Clientes e Produtos só para descobrir quais meses existem. Ler apenas
    // dbo.Vendas torna a primeira abertura do Regional muito mais barata.
    const filtrosDimensionais = ['p_cidade','p_regiao','p_uf','p_segmento','p_grupo','p_fornecedor','p_subgrupo','p_produto'];
    const temFiltroDimensional = filtrosDimensionais.some((key) => String(req.query?.[key] ?? '').trim());

    let query;
    if (!temFiltroDimensional) {
      query = `
        SELECT DISTINCT
          YEAR(v.[Data]) AS ano,
          RIGHT('0' + CAST(MONTH(v.[Data]) AS varchar(2)), 2) AS mes
        FROM dbo.Vendas v
        WHERE v.[Data] IS NOT NULL
        ORDER BY ano, mes
      `;
    } else {
      // Datas são ignoradas de propósito: este endpoint responde quais meses existem
      // dentro dos demais filtros. O frontend restringe ao intervalo selecionado quando necessário.
      const where = aplicarFiltrosRegionais(request, req.query, { ignorar: ['p_de', 'p_ate'] });
      query = `
        ${CTE_BASE_REGIONAL}
        SELECT DISTINCT
          YEAR(v.Data) AS ano,
          RIGHT('0' + CAST(MONTH(v.Data) AS varchar(2)), 2) AS mes
        ${FROM_BASE_REGIONAL}
        WHERE ${where} AND v.Data IS NOT NULL
        ORDER BY ano, mes
      `;
    }
    const result = await request.query(query);
    const data = result.recordset;
    salvarCache(req, res, cache, data);
    return res.status(200).json(data);
  } catch (err) {
    return erroApi(res, err);
  }
}
