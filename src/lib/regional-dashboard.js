import { getPool, sql } from './db.js';

export { getPool, sql };

export const CACHE_TTL_MS = 180000; // 3 min
export const CACHE_TTL_CATALOGO_MS = 600000; // 10 min

export function querRefresh(req) {
  const v = String(req?.query?.p_refresh ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'sim';
}

export function cacheKeyQuery(query = {}) {
  const clean = {};
  Object.keys(query).sort().forEach((key) => {
    if (key === 'p_refresh') return;
    const value = query[key];
    if (value !== undefined && value !== null && value !== '') clean[key] = value;
  });
  return JSON.stringify(clean);
}

export function responderCache(req, res, cache, ttl = CACHE_TTL_MS) {
  if (querRefresh(req)) return false;
  const key = cacheKeyQuery(req.query);
  const cached = cache.get(key);
  if (!cached || Date.now() - cached.time >= ttl) return false;
  res.setHeader('X-PMG-Cache', 'HIT');
  res.status(200).json(cached.data);
  return true;
}

export function salvarCache(req, res, cache, data) {
  const key = cacheKeyQuery(req.query);
  cache.set(key, { time: Date.now(), data });
  res.setHeader('X-PMG-Cache', 'MISS');
}

// A base do Regional é centralizada aqui para que todos os endpoints usem
// exatamente os mesmos JOINs e nunca multipliquem valores por cadastros duplicados.
// ROW_NUMBER escolhe uma linha cadastral coerente por ID e evita misturar campos de registros diferentes.
// Os fatos (VendasProdutos) permanecem intactos.
export const CTE_BASE_REGIONAL = `
WITH VendasRank AS (
  SELECT
    [ID Pedido de Venda], [Data], [ID Cliente],
    ROW_NUMBER() OVER (
      PARTITION BY [ID Pedido de Venda]
      ORDER BY CASE WHEN [Data] IS NULL THEN 1 ELSE 0 END, [Data] DESC, [ID Cliente] DESC
    ) AS rn
  FROM dbo.Vendas
),
VendasUnicas AS (
  SELECT [ID Pedido de Venda], [Data], [ID Cliente]
  FROM VendasRank
  WHERE rn = 1
),
ClientesRank AS (
  SELECT
    [ID Cliente],
    NULLIF(LTRIM(RTRIM([Cidade])), '') AS [Cidade],
    NULLIF(UPPER(LTRIM(RTRIM([UF]))), '') AS [UF],
    NULLIF(LTRIM(RTRIM([Zona])), '') AS [Zona],
    NULLIF(LTRIM(RTRIM([Segmento])), '') AS [Segmento],
    ROW_NUMBER() OVER (
      PARTITION BY [ID Cliente]
      ORDER BY
        (CASE WHEN NULLIF(LTRIM(RTRIM([Cidade])), '') IS NULL THEN 0 ELSE 1 END +
         CASE WHEN NULLIF(LTRIM(RTRIM([UF])), '') IS NULL THEN 0 ELSE 1 END +
         CASE WHEN NULLIF(LTRIM(RTRIM([Zona])), '') IS NULL THEN 0 ELSE 1 END +
         CASE WHEN NULLIF(LTRIM(RTRIM([Segmento])), '') IS NULL THEN 0 ELSE 1 END) DESC,
        [Cidade], [UF], [Zona], [Segmento]
    ) AS rn
  FROM dbo.Clientes
),
ClientesUnicos AS (
  SELECT [ID Cliente], [Cidade], [UF], [Zona], [Segmento]
  FROM ClientesRank
  WHERE rn = 1
),
ProdutosRank AS (
  SELECT
    [ID Produto],
    NULLIF(LTRIM(RTRIM([Grupo])), '') AS [Grupo],
    NULLIF(LTRIM(RTRIM([Sub-grupo])), '') AS [Sub-grupo],
    NULLIF(LTRIM(RTRIM([Fornecedor])), '') AS [Fornecedor],
    ROW_NUMBER() OVER (
      PARTITION BY [ID Produto]
      ORDER BY
        (CASE WHEN NULLIF(LTRIM(RTRIM([Grupo])), '') IS NULL THEN 0 ELSE 1 END +
         CASE WHEN NULLIF(LTRIM(RTRIM([Sub-grupo])), '') IS NULL THEN 0 ELSE 1 END +
         CASE WHEN NULLIF(LTRIM(RTRIM([Fornecedor])), '') IS NULL THEN 0 ELSE 1 END) DESC,
        [Fornecedor], [Grupo], [Sub-grupo]
    ) AS rn
  FROM dbo.Produtos
),
ProdutosUnicos AS (
  SELECT [ID Produto], [Grupo], [Sub-grupo], [Fornecedor]
  FROM ProdutosRank
  WHERE rn = 1
)
`;

export const FROM_BASE_REGIONAL = `
FROM dbo.VendasProdutos vp
JOIN VendasUnicas v ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
JOIN ClientesUnicos c ON v.[ID Cliente] = c.[ID Cliente]
JOIN ProdutosUnicos p ON vp.[ID Produto] = p.[ID Produto]
`;

export function aplicarFiltrosRegionais(request, query = {}, { ignorar = [] } = {}) {
  const skip = new Set(ignorar);
  const filtros = ['1=1'];
  const {
    p_cidade, p_regiao, p_uf, p_segmento, p_grupo, p_fornecedor, p_subgrupo, p_de, p_ate,
  } = query;

  if (p_cidade && !skip.has('p_cidade')) {
    filtros.push("CONCAT(c.Cidade, ' / ', c.UF) = @cidade");
    request.input('cidade', sql.NVarChar(200), p_cidade);
  }
  if (p_regiao && !skip.has('p_regiao')) {
    filtros.push('c.Zona = @regiao');
    request.input('regiao', sql.NVarChar(200), p_regiao);
  }
  if (p_uf && !skip.has('p_uf')) {
    filtros.push('c.UF = @uf');
    request.input('uf', sql.NVarChar(10), String(p_uf).trim().toUpperCase());
  }
  if (p_segmento && !skip.has('p_segmento')) {
    filtros.push('c.Segmento = @segmento');
    request.input('segmento', sql.NVarChar(200), p_segmento);
  }
  if (p_grupo && !skip.has('p_grupo')) {
    filtros.push('p.Grupo = @grupo');
    request.input('grupo', sql.NVarChar(200), p_grupo);
  }
  if (p_subgrupo && !skip.has('p_subgrupo')) {
    filtros.push('p.[Sub-grupo] = @subgrupo');
    request.input('subgrupo', sql.NVarChar(200), p_subgrupo);
  }
  if (p_fornecedor && !skip.has('p_fornecedor')) {
    filtros.push('p.Fornecedor = @fornecedor');
    request.input('fornecedor', sql.NVarChar(200), p_fornecedor);
  }

  if (p_de && !skip.has('p_de')) {
    const data = primeiroDiaMes(p_de);
    if (data) {
      filtros.push('v.Data >= @de');
      request.input('de', sql.DateTime2, data);
    }
  }
  if (p_ate && !skip.has('p_ate')) {
    const data = primeiroDiaMesSeguinte(p_ate);
    if (data) {
      filtros.push('v.Data < @ate');
      request.input('ate', sql.DateTime2, data);
    }
  }

  return filtros.join(' AND ');
}

function primeiroDiaMes(valor) {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(String(valor || '').trim());
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
}

function primeiroDiaMesSeguinte(valor) {
  const d = primeiroDiaMes(valor);
  if (!d) return null;
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

export function erroApi(res, err) {
  console.error('[regional-api]', err);
  return res.status(500).json({ message: err.message, code: err.code || null });
}
