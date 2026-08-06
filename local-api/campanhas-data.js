/**
 * PMG Connect — Campanhas API local 4.0
 *
 * Arquitetura igual ao Dashboard Regional:
 *   navegador/Vercel -> http://localhost:3001/api/campanhas-data -> SQL Server
 *
 * Diferença importante: dimensões estáticas (fornecedores, representantes e
 * produtos por fornecedor) usam cache em memória + cache em disco. A conexão
 * SQL é compartilhada pelo src/lib/db.js e é aquecida em segundo plano quando
 * o servidor inicia. Assim o clique em "Nova campanha" nunca depende do SQL.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getPool, resetPool, sql, diagnosticoConfiguracaoSql } from '../src/lib/db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_PATH = path.resolve(__dirname, '../data/campanhas-sql-cache.json');
const CACHE_VERSION = 2;
const TTL_DIMENSOES = 30 * 60 * 1000;
const TTL_PRODUTOS = 20 * 60 * 1000;

const state = {
  fornecedores: [],
  representantes: [],
  produtos: new Map(),
  atualizadoEm: null,
  carregadoDoDisco: false,
  aquecendo: false,
  ultimoErro: null,
};

const inflight = new Map();
let gravacaoPendente = null;

const text = (value) => String(value ?? '').trim();
const norm = (value) => text(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');
const unique = (arr) => [...new Set(arr.filter(Boolean))];
const nowIso = () => new Date().toISOString();

function numeroInteiro(value, fallback = 50, max = 5000) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(n, max);
}

function cacheKeyFornecedor(query = {}) {
  const id = Number.parseInt(query.fornecedorId, 10);
  if (Number.isFinite(id)) return `id:${id}`;
  return `nome:${norm(query.fornecedor)}`;
}

function produtoPublico(row) {
  return {
    id: Number(row.id ?? row.codigo),
    codigo: Number(row.codigo ?? row.id),
    nome: text(row.nome),
    unidade: text(row.unidade),
    fatorUnidade: Number(row.fatorUnidade) || 0,
    master: Number(row.master) || 0,
    tipoCarga: text(row.tipoCarga),
    grupo: text(row.grupo),
    subgrupo: text(row.subgrupo),
    fornecedorId: Number(row.fornecedorId) || null,
    fornecedor: text(row.fornecedor),
    fabricante: text(row.fabricante),
    status: text(row.status),
  };
}

async function carregarCacheDisco() {
  try {
    const raw = await fs.readFile(CACHE_PATH, 'utf8');
    const data = JSON.parse(raw);
    if (data?.version !== CACHE_VERSION) return;
    state.fornecedores = Array.isArray(data.fornecedores) ? data.fornecedores : [];
    state.representantes = Array.isArray(data.representantes) ? data.representantes : [];
    state.atualizadoEm = data.atualizadoEm || null;
    state.carregadoDoDisco = true;
  } catch (error) {
    if (error?.code !== 'ENOENT') console.warn('[campanhas] cache em disco:', error.message);
  }
}

const discoPronto = carregarCacheDisco();

async function salvarCacheDisco() {
  if (gravacaoPendente) return gravacaoPendente;
  gravacaoPendente = (async () => {
    try {
      await fs.mkdir(path.dirname(CACHE_PATH), { recursive: true });
      const payload = {
        version: CACHE_VERSION,
        atualizadoEm: state.atualizadoEm,
        fornecedores: state.fornecedores,
        representantes: state.representantes,
      };
      const temp = `${CACHE_PATH}.tmp`;
      await fs.writeFile(temp, JSON.stringify(payload), 'utf8');
      await fs.rename(temp, CACHE_PATH);
    } catch (error) {
      console.warn('[campanhas] não foi possível persistir o cache:', error.message);
    } finally {
      gravacaoPendente = null;
    }
  })();
  return gravacaoPendente;
}

async function executarSql(chave, fn, { retry = true } = {}) {
  if (inflight.has(chave)) return inflight.get(chave);
  const promise = (async () => {
    try {
      const pool = await getPool();
      return await fn(pool);
    } catch (error) {
      const code = error?.code || error?.originalError?.code;
      if (retry && ['ESOCKET', 'ECONNRESET', 'ETIMEOUT', 'ENOTOPEN', 'ECONNCLOSED'].includes(code)) {
        await resetPool();
        const pool = await getPool();
        return fn(pool);
      }
      throw error;
    } finally {
      inflight.delete(chave);
    }
  })();
  inflight.set(chave, promise);
  return promise;
}

async function consultarFornecedoresSql() {
  return executarSql('sql:fornecedores', async (pool) => {
    const result = await pool.request().query(`
      SELECT
        MIN([ID Fornecedor]) AS id,
        LTRIM(RTRIM([Fornecedor])) AS nome,
        COUNT_BIG(*) AS totalProdutos,
        SUM(CASE WHEN UPPER(LTRIM(RTRIM(ISNULL([Status], '')))) LIKE 'ATIV%' THEN 1 ELSE 0 END) AS produtosAtivos
      FROM dbo.Produtos
      WHERE NULLIF(LTRIM(RTRIM([Fornecedor])), '') IS NOT NULL
      GROUP BY LTRIM(RTRIM([Fornecedor]))
      ORDER BY LTRIM(RTRIM([Fornecedor]));
    `);
    return result.recordset.map((row) => ({
      id: Number(row.id) || null,
      nome: text(row.nome),
      totalProdutos: Number(row.totalProdutos) || 0,
      produtosAtivos: Number(row.produtosAtivos) || 0,
    })).filter((item) => item.nome);
  });
}

async function consultarRepresentantesSql() {
  return executarSql('sql:representantes', async (pool) => {
    const result = await pool.request().query(`
      SELECT
        LTRIM(RTRIM([Vendedor])) AS nome,
        COUNT(DISTINCT [ID Cliente]) AS clientesCarteira,
        COUNT(DISTINCT CASE
          WHEN UPPER(LTRIM(RTRIM(ISNULL([Status], '')))) LIKE 'ATIV%'
          THEN [ID Cliente]
        END) AS clientesAtivos
      FROM dbo.Clientes
      WHERE NULLIF(LTRIM(RTRIM([Vendedor])), '') IS NOT NULL
      GROUP BY LTRIM(RTRIM([Vendedor]))
      HAVING COUNT(DISTINCT CASE
        WHEN UPPER(LTRIM(RTRIM(ISNULL([Status], '')))) LIKE 'ATIV%'
        THEN [ID Cliente]
      END) > 0
      ORDER BY LTRIM(RTRIM([Vendedor]));
    `);
    return result.recordset.map((row) => ({
      id: `sql:${text(row.nome)}`,
      nome: text(row.nome),
      ativo: true,
      clientesCarteira: Number(row.clientesCarteira) || 0,
      clientesAtivos: Number(row.clientesAtivos) || 0,
      origem: 'dbo.Clientes',
    })).filter((item) => item.nome);
  });
}

async function aquecerDimensoes({ force = false } = {}) {
  await discoPronto;
  const atualizado = state.atualizadoEm ? new Date(state.atualizadoEm).getTime() : 0;
  const fresco = atualizado && Date.now() - atualizado < TTL_DIMENSOES;
  if (!force && fresco && state.fornecedores.length && state.representantes.length) return state;
  if (state.aquecendo && inflight.has('warmup')) return inflight.get('warmup');

  state.aquecendo = true;
  const promise = Promise.all([consultarFornecedoresSql(), consultarRepresentantesSql()])
    .then(([fornecedores, representantes]) => {
      state.fornecedores = fornecedores;
      state.representantes = representantes;
      state.atualizadoEm = nowIso();
      state.ultimoErro = null;
      void salvarCacheDisco();
      return state;
    })
    .catch((error) => {
      state.ultimoErro = { message: error.message, code: error.code || error.originalError?.code || null, at: nowIso() };
      if (!state.fornecedores.length && !state.representantes.length) throw error;
      return state;
    })
    .finally(() => {
      state.aquecendo = false;
      inflight.delete('warmup');
    });
  inflight.set('warmup', promise);
  return promise;
}

async function produtosDoFornecedor(query = {}, { force = false } = {}) {
  await discoPronto;
  const key = cacheKeyFornecedor(query);
  if (key === 'nome:' || key === 'id:NaN') {
    const error = new Error('Selecione um fornecedor antes de consultar produtos.');
    error.code = 'FORNECEDOR_AUSENTE';
    throw error;
  }
  const cached = state.produtos.get(key);
  if (!force && cached && Date.now() - cached.time < TTL_PRODUTOS) return cached.items;

  return executarSql(`sql:produtos:${key}`, async (pool) => {
    const request = pool.request();
    const fornecedorId = Number.parseInt(query.fornecedorId, 10);
    let where;
    if (Number.isFinite(fornecedorId)) {
      request.input('fornecedorId', sql.Int, fornecedorId);
      where = 'p.[ID Fornecedor] = @fornecedorId';
    } else {
      request.input('fornecedor', sql.NVarChar(220), text(query.fornecedor));
      where = 'LTRIM(RTRIM(p.[Fornecedor])) = @fornecedor';
    }
    const result = await request.query(`
      SELECT
        p.[ID Produto] AS id,
        p.[ID Produto] AS codigo,
        p.[Produto] AS nome,
        p.[Unidade] AS unidade,
        p.[Fator Unidade] AS fatorUnidade,
        p.[Master] AS master,
        p.[TipoCarga] AS tipoCarga,
        p.[Grupo] AS grupo,
        p.[Sub-grupo] AS subgrupo,
        p.[ID Fornecedor] AS fornecedorId,
        LTRIM(RTRIM(p.[Fornecedor])) AS fornecedor,
        p.[Fabricante] AS fabricante,
        p.[Status] AS status
      FROM dbo.Produtos p
      WHERE ${where}
      ORDER BY p.[Grupo], p.[Sub-grupo], p.[Produto];
    `);
    const items = result.recordset.map(produtoPublico).filter((item) => Number.isFinite(item.id));
    state.produtos.set(key, { time: Date.now(), items });
    return items;
  });
}

function filtrarFornecedores(query = {}) {
  const busca = norm(query.busca);
  const limite = numeroInteiro(query.limite, 24, 200);
  const lista = busca
    ? state.fornecedores.filter((item) => norm(`${item.nome} ${item.id ?? ''}`).includes(busca))
    : state.fornecedores;
  return lista.slice(0, limite);
}

function filtrarRepresentantes(query = {}) {
  const busca = norm(query.busca);
  const limite = numeroInteiro(query.limite, 300, 1000);
  return (busca ? state.representantes.filter((item) => norm(item.nome).includes(busca)) : state.representantes).slice(0, limite);
}

function filtrarProdutos(items, query = {}) {
  const busca = norm(query.busca);
  const grupo = norm(query.grupo);
  const subgrupo = norm(query.subgrupo);
  const status = norm(query.status);
  const somenteAtivos = text(query.ativos).toLowerCase() !== 'false';
  return items.filter((item) => {
    if (somenteAtivos && item.status && !norm(item.status).includes('ativ')) return false;
    if (grupo && norm(item.grupo) !== grupo) return false;
    if (subgrupo && norm(item.subgrupo) !== subgrupo) return false;
    if (status && norm(item.status) !== status) return false;
    if (busca && !norm(`${item.id} ${item.nome} ${item.fabricante} ${item.grupo} ${item.subgrupo}`).includes(busca)) return false;
    return true;
  });
}

function parseDate(value, field) {
  const raw = text(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const error = new Error(`Data inválida em ${field}.`);
    error.code = 'DATA_INVALIDA';
    throw error;
  }
  const [year, month, day] = raw.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

function uniqueIntegers(values, max = 1500) {
  return [...new Set((Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite))].slice(0, max);
}

function uniqueTexts(values, max = 500) {
  return [...new Set((Array.isArray(values) ? values : []).map(text).filter(Boolean))].slice(0, max);
}

function addIntParams(request, prefix, values) {
  return values.map((value, index) => {
    const name = `${prefix}${index}`;
    request.input(name, sql.Int, value);
    return `@${name}`;
  }).join(',');
}

function addTextParams(request, prefix, values) {
  return values.map((value, index) => {
    const name = `${prefix}${index}`;
    request.input(name, sql.NVarChar(200), value);
    return `@${name}`;
  }).join(',');
}

async function consultarApuracao(payload = {}) {
  const startedAt = Date.now();
  const campanhaInicio = parseDate(payload.campanhaInicio, 'campanhaInicio');
  const campanhaFim = parseDate(payload.campanhaFim, 'campanhaFim');
  const anteriorInicio = parseDate(payload.anteriorInicio, 'anteriorInicio');
  const anteriorFim = parseDate(payload.anteriorFim, 'anteriorFim');
  const produtos = uniqueIntegers(payload.produtos);
  const vendedores = uniqueTexts(payload.vendedores);
  const fornecedorId = Number.parseInt(payload.fornecedorId, 10);
  const fornecedor = text(payload.fornecedor);

  if (!produtos.length && !Number.isFinite(fornecedorId) && !fornecedor) {
    const error = new Error('Selecione o fornecedor ou os produtos participantes.');
    error.code = 'ESCOPO_AUSENTE';
    throw error;
  }

  return executarSql(`sql:apuracao:${Date.now()}`, async (pool) => {
    const request = pool.request();
    request.input('campanhaInicio', sql.DateTime2, campanhaInicio);
    request.input('campanhaFim', sql.DateTime2, campanhaFim);
    request.input('anteriorInicio', sql.DateTime2, anteriorInicio);
    request.input('anteriorFim', sql.DateTime2, anteriorFim);

    const filters = [];
    if (produtos.length) {
      filters.push(`vp.[ID Produto] IN (${addIntParams(request, 'produto', produtos)})`);
    } else if (Number.isFinite(fornecedorId)) {
      request.input('fornecedorId', sql.Int, fornecedorId);
      filters.push('p.[ID Fornecedor] = @fornecedorId');
    } else {
      request.input('fornecedor', sql.NVarChar(220), fornecedor);
      filters.push('LTRIM(RTRIM(p.[Fornecedor])) = @fornecedor');
    }
    if (vendedores.length) filters.push(`LTRIM(RTRIM(v.[Vendedor])) IN (${addTextParams(request, 'vendedor', vendedores)})`);

    const result = await request.query(`
      WITH VendedoresAtivos AS (
        SELECT DISTINCT LTRIM(RTRIM([Vendedor])) AS vendedor
        FROM dbo.Clientes
        WHERE NULLIF(LTRIM(RTRIM([Vendedor])), '') IS NOT NULL
          AND UPPER(LTRIM(RTRIM(ISNULL([Status], '')))) LIKE 'ATIV%'
      )
      SELECT
        CASE WHEN v.[Data] >= @campanhaInicio AND v.[Data] < @campanhaFim THEN 'campanha' ELSE 'anterior' END AS periodo,
        LTRIM(RTRIM(v.[Vendedor])) AS vendedor,
        v.[ID Cliente] AS clienteId,
        vp.[ID Produto] AS produtoId,
        MAX(p.[Produto]) AS produto,
        MAX(p.[Grupo]) AS grupo,
        MAX(p.[Sub-grupo]) AS subgrupo,
        COUNT(DISTINCT v.[ID Pedido de Venda]) AS pedidos,
        SUM(ISNULL(vp.[Qtde PC], 0)) AS pecas,
        SUM(ISNULL(vp.[Qtde Kg], 0)) AS kg,
        SUM(ISNULL(vp.[Valor], 0)) AS valor
      FROM dbo.Vendas v
      INNER JOIN VendedoresAtivos va ON va.vendedor = LTRIM(RTRIM(v.[Vendedor]))
      INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
      INNER JOIN dbo.Produtos p ON p.[ID Produto] = vp.[ID Produto]
      WHERE NULLIF(LTRIM(RTRIM(v.[Vendedor])), '') IS NOT NULL
        AND (
          (v.[Data] >= @campanhaInicio AND v.[Data] < @campanhaFim)
          OR (v.[Data] >= @anteriorInicio AND v.[Data] < @anteriorFim)
        )
        AND ${filters.join(' AND ')}
      GROUP BY
        CASE WHEN v.[Data] >= @campanhaInicio AND v.[Data] < @campanhaFim THEN 'campanha' ELSE 'anterior' END,
        LTRIM(RTRIM(v.[Vendedor])),
        v.[ID Cliente],
        vp.[ID Produto];

      WITH VendedoresAtivos AS (
        SELECT DISTINCT LTRIM(RTRIM([Vendedor])) AS vendedor
        FROM dbo.Clientes
        WHERE NULLIF(LTRIM(RTRIM([Vendedor])), '') IS NOT NULL
          AND UPPER(LTRIM(RTRIM(ISNULL([Status], '')))) LIKE 'ATIV%'
      )
      SELECT
        CASE WHEN v.[Data] >= @campanhaInicio AND v.[Data] < @campanhaFim THEN 'campanha' ELSE 'anterior' END AS periodo,
        LTRIM(RTRIM(v.[Vendedor])) AS vendedor,
        COUNT(DISTINCT v.[ID Pedido de Venda]) AS pedidos
      FROM dbo.Vendas v
      INNER JOIN VendedoresAtivos va ON va.vendedor = LTRIM(RTRIM(v.[Vendedor]))
      INNER JOIN dbo.VendasProdutos vp ON vp.[ID Pedido de Venda] = v.[ID Pedido de Venda]
      INNER JOIN dbo.Produtos p ON p.[ID Produto] = vp.[ID Produto]
      WHERE NULLIF(LTRIM(RTRIM(v.[Vendedor])), '') IS NOT NULL
        AND (
          (v.[Data] >= @campanhaInicio AND v.[Data] < @campanhaFim)
          OR (v.[Data] >= @anteriorInicio AND v.[Data] < @anteriorFim)
        )
        AND ${filters.join(' AND ')}
      GROUP BY
        CASE WHEN v.[Data] >= @campanhaInicio AND v.[Data] < @campanhaFim THEN 'campanha' ELSE 'anterior' END,
        LTRIM(RTRIM(v.[Vendedor]));
    `);

    const linhasRecordset = result.recordsets?.[0] || result.recordset || [];
    const pedidosRecordset = result.recordsets?.[1] || [];

    return {
      ok: true,
      fonte: 'SQL Server · Power BI',
      dataReferencia: 'dbo.Vendas.[Data]',
      vendedoresAtivos: true,
      intervalos: {
        campanha: { inicio: text(payload.campanhaInicio), fimExclusivo: text(payload.campanhaFim) },
        anterior: { inicio: text(payload.anteriorInicio), fimExclusivo: text(payload.anteriorFim) },
      },
      linhas: linhasRecordset.map((row) => ({
        periodo: row.periodo,
        vendedor: text(row.vendedor),
        clienteId: Number(row.clienteId),
        produtoId: Number(row.produtoId),
        produto: text(row.produto),
        grupo: text(row.grupo),
        subgrupo: text(row.subgrupo),
        pedidos: Number(row.pedidos) || 0,
        pecas: Number(row.pecas) || 0,
        kg: Number(row.kg) || 0,
        valor: Number(row.valor) || 0,
      })),
      pedidosPorVendedor: pedidosRecordset.map((row) => ({
        periodo: row.periodo,
        vendedor: text(row.vendedor),
        pedidos: Number(row.pedidos) || 0,
      })),
      duracaoMs: Date.now() - startedAt,
    };
  }, { retry: false });
}

function publicError(error) {
  const code = error?.code || error?.originalError?.code || 'CAMPANHAS_LOCAL_ERROR';
  const hints = {
    SQL_ENV_MISSING: 'Confira o arquivo .env do servidor local.',
    ELOGIN: 'Confira usuário, senha e permissão no banco powerbi.',
    ETIMEOUT: 'A conexão SQL excedeu o tempo configurado. A interface continuará responsiva; tente novamente.',
    FORNECEDOR_AUSENTE: 'Escolha um fornecedor antes de abrir o catálogo.',
  };
  return {
    erro: error?.message || 'Falha inesperada na API local de campanhas.',
    codigo: code,
    origem: 'local-api/campanhas-data',
    versao: '4.0.0',
    dica: hints[code] || 'Confira o terminal do servidor local para mais detalhes.',
  };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  const startedAt = Date.now();
  const recurso = text(req.query?.recurso || 'bootstrap');

  try {
    await discoPronto;
    if (req.method === 'OPTIONS') return res.status(204).end();

    if (recurso === 'diagnostico') {
      const sqlInfo = await executarSql('sql:diagnostico', async (pool) => {
        const result = await pool.request().query('SELECT 1 AS ok, DB_NAME() AS banco, GETDATE() AS dataServidor;');
        return result.recordset[0];
      });
      return res.status(200).json({
        ok: true,
        versao: '4.0.0',
        arquitetura: 'Vercel/interface + Node local/cache + SQL Server compartilhado',
        cache: {
          fornecedores: state.fornecedores.length,
          representantes: state.representantes.length,
          atualizadoEm: state.atualizadoEm,
          carregadoDoDisco: state.carregadoDoDisco,
        },
        sql: sqlInfo,
        configuracao: diagnosticoConfiguracaoSql(),
        duracaoMs: Date.now() - startedAt,
      });
    }

    if (recurso === 'refresh') {
      if (!['POST', 'GET'].includes(req.method)) return res.status(405).json({ erro: 'Método não permitido.' });
      await aquecerDimensoes({ force: true });
      state.produtos.clear();
      return res.status(200).json({ ok: true, atualizadoEm: state.atualizadoEm });
    }

    if (recurso === 'apuracao') {
      if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST para a apuração.', codigo: 'METODO_INVALIDO' });
      const data = await consultarApuracao(req.body || {});
      return res.status(200).json(data);
    }

    if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido.', codigo: 'METODO_INVALIDO' });

    if (recurso === 'bootstrap') {
      // Nunca segura a resposta esperando o Azure SQL. O aquecimento continua em
      // segundo plano e o frontend consulta novamente sem travar o modal.
      void aquecerDimensoes().catch((error) => console.warn('[campanhas] atualização de fundo:', error.message));
      const ready = Boolean(state.fornecedores.length && state.representantes.length);
      return res.status(200).json({
        ok: true,
        ready,
        warming: state.aquecendo || !ready,
        fornecedores: state.fornecedores,
        representantes: state.representantes,
        atualizadoEm: state.atualizadoEm,
        stale: Boolean(state.ultimoErro),
        ultimoErro: state.ultimoErro,
        duracaoMs: Date.now() - startedAt,
      });
    }

    if (recurso === 'fornecedores') {
      void aquecerDimensoes().catch(() => {});
      return res.status(200).json({
        items: filtrarFornecedores(req.query),
        total: state.fornecedores.length,
        ready: Boolean(state.fornecedores.length),
        warming: state.aquecendo || !state.fornecedores.length,
        atualizadoEm: state.atualizadoEm,
        stale: Boolean(state.ultimoErro),
        duracaoMs: Date.now() - startedAt,
      });
    }

    if (['representantes', 'vendedores'].includes(recurso)) {
      void aquecerDimensoes().catch(() => {});
      return res.status(200).json({
        items: filtrarRepresentantes(req.query),
        total: state.representantes.length,
        ready: Boolean(state.representantes.length),
        warming: state.aquecendo || !state.representantes.length,
        atualizadoEm: state.atualizadoEm,
        stale: Boolean(state.ultimoErro),
        duracaoMs: Date.now() - startedAt,
      });
    }

    if (recurso === 'produtos' || recurso === 'filtros-produtos') {
      const all = await produtosDoFornecedor(req.query);
      if (recurso === 'filtros-produtos') {
        return res.status(200).json({
          grupos: unique(all.map((item) => item.grupo)).sort((a, b) => a.localeCompare(b, 'pt-BR')),
          subgrupos: unique(all.map((item) => item.subgrupo)).sort((a, b) => a.localeCompare(b, 'pt-BR')),
          status: unique(all.map((item) => item.status)).sort((a, b) => a.localeCompare(b, 'pt-BR')),
          total: all.length,
          duracaoMs: Date.now() - startedAt,
        });
      }
      const filtered = filtrarProdutos(all, req.query);
      const total = filtered.length;
      const page = numeroInteiro(req.query.pagina, 1, 10000);
      const limit = text(req.query.todos).toLowerCase() === 'true' ? 5000 : numeroInteiro(req.query.limite, 60, 300);
      const start = (page - 1) * limit;
      return res.status(200).json({
        items: filtered.slice(start, start + limit),
        total,
        pagina: page,
        limite: limit,
        temMais: start + limit < total,
        filtros: {
          grupos: unique(all.map((item) => item.grupo)).sort((a, b) => a.localeCompare(b, 'pt-BR')),
          subgrupos: unique(all.map((item) => item.subgrupo)).sort((a, b) => a.localeCompare(b, 'pt-BR')),
          status: unique(all.map((item) => item.status)).sort((a, b) => a.localeCompare(b, 'pt-BR')),
        },
        cache: state.produtos.has(cacheKeyFornecedor(req.query)),
        duracaoMs: Date.now() - startedAt,
      });
    }

    return res.status(404).json({ erro: `Recurso desconhecido: ${recurso}`, codigo: 'RECURSO_DESCONHECIDO' });
  } catch (error) {
    console.error(`[campanhas:${recurso}]`, error);
    const data = publicError(error);
    const status = ['SQL_ENV_MISSING', 'ETIMEOUT'].includes(data.codigo) ? 503 : 500;
    return res.status(status).json(data);
  }
}

// Aquecimento assíncrono. Não bloqueia o início do servidor Express.
setTimeout(() => {
  void aquecerDimensoes().then(() => {
    console.log(`[campanhas] cache pronto: ${state.fornecedores.length} fornecedores, ${state.representantes.length} representantes ativos.`);
  }).catch((error) => {
    console.warn('[campanhas] aquecimento inicial falhou:', error.message);
  });
}, 120);
