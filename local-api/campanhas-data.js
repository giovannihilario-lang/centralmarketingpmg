import { getPool, sql } from '../src/lib/db.js';
import {
  listar,
  salvar,
  remover,
  DATA_FILE,
} from '../src/campanhas/json-store.js';

const TABELAS_JSON = new Set([
  'campanhas',
  'campanhas_representantes',
  'campanhas_vendas',
  'campanhas_regras',
  'campanhas_regras_produto',
  'campanhas_mapeamentos',
  'campanhas_apuracoes',
]);

function texto(valor) {
  return String(valor ?? '').trim();
}

function numeroInteiro(valor, padrao, maximo = 1000) {
  const convertido = Number.parseInt(valor, 10);
  if (!Number.isFinite(convertido) || convertido <= 0) return padrao;
  return Math.min(convertido, maximo);
}

async function tratarPersistenciaJson(req, res, tabela) {
  if (!TABELAS_JSON.has(tabela)) {
    return res.status(400).json({ erro: "Parâmetro 'tabela' inválido" });
  }

  if (req.method === 'GET') {
    const dados = await listar(tabela, {
      id: req.query.id,
      campanhaId: req.query.campanhaId,
    });
    return res.status(200).json(dados);
  }

  if (req.method === 'POST') {
    const itens = Array.isArray(req.body) ? req.body : [req.body];
    if (!itens.length || itens.some((item) => !item || !item.id)) {
      return res.status(400).json({ erro: 'Registro sem id' });
    }
    await salvar(tabela, itens);
    return res.status(200).json({ ok: true, quantidade: itens.length });
  }

  if (req.method === 'DELETE') {
    await remover(tabela, {
      id: req.query.id,
      todos: Boolean(req.query.all),
    });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ erro: 'Método não permitido' });
}

async function listarProdutos(req, res) {
  const pool = await getPool();
  const request = pool.request();
  const filtros = [];

  const busca = texto(req.query.busca);
  const fornecedor = texto(req.query.fornecedor);
  const grupo = texto(req.query.grupo);
  const subgrupo = texto(req.query.subgrupo);
  const status = texto(req.query.status);
  const limite = numeroInteiro(req.query.limite, 150, 800);

  if (busca) {
    request.input('busca', sql.NVarChar(200), `%${busca}%`);
    filtros.push(`(
      CAST(p.[ID Produto] AS varchar(30)) LIKE @busca
      OR p.[Produto] LIKE @busca
      OR p.[Fornecedor] LIKE @busca
      OR p.[Grupo] LIKE @busca
      OR p.[Sub-grupo] LIKE @busca
      OR p.[Fabricante] LIKE @busca
    )`);
  }

  if (fornecedor) {
    request.input('fornecedor', sql.NVarChar(200), fornecedor);
    filtros.push('p.[Fornecedor] = @fornecedor');
  }

  if (grupo) {
    request.input('grupo', sql.NVarChar(200), grupo);
    filtros.push('p.[Grupo] = @grupo');
  }

  if (subgrupo) {
    request.input('subgrupo', sql.NVarChar(200), subgrupo);
    filtros.push('p.[Sub-grupo] = @subgrupo');
  }

  if (status) {
    request.input('status', sql.NVarChar(80), status);
    filtros.push('p.[Status] = @status');
  }

  request.input('limite', sql.Int, limite);
  const whereSql = filtros.length ? `WHERE ${filtros.join(' AND ')}` : '';

  const resultado = await request.query(`
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
      p.[Fornecedor] AS fornecedor,
      p.[Fabricante] AS fabricante,
      p.[Status] AS status
    FROM dbo.Produtos p
    ${whereSql}
    ORDER BY p.[Fornecedor], p.[Grupo], p.[Produto]
    OFFSET 0 ROWS FETCH NEXT @limite ROWS ONLY;
  `);

  return res.status(200).json(resultado.recordset);
}

async function listarFiltrosProdutos(_req, res) {
  const pool = await getPool();

  const [fornecedores, grupos, subgrupos, status] = await Promise.all([
    pool.request().query(`
      SELECT DISTINCT [Fornecedor] AS valor
      FROM dbo.Produtos
      WHERE NULLIF(LTRIM(RTRIM([Fornecedor])), '') IS NOT NULL
      ORDER BY [Fornecedor]
    `),
    pool.request().query(`
      SELECT DISTINCT [Grupo] AS valor
      FROM dbo.Produtos
      WHERE NULLIF(LTRIM(RTRIM([Grupo])), '') IS NOT NULL
      ORDER BY [Grupo]
    `),
    pool.request().query(`
      SELECT DISTINCT [Sub-grupo] AS valor
      FROM dbo.Produtos
      WHERE NULLIF(LTRIM(RTRIM([Sub-grupo])), '') IS NOT NULL
      ORDER BY [Sub-grupo]
    `),
    pool.request().query(`
      SELECT DISTINCT [Status] AS valor
      FROM dbo.Produtos
      WHERE NULLIF(LTRIM(RTRIM([Status])), '') IS NOT NULL
      ORDER BY [Status]
    `),
  ]);

  const valores = (resultado) => resultado.recordset.map((item) => item.valor);

  return res.status(200).json({
    fornecedores: valores(fornecedores),
    grupos: valores(grupos),
    subgrupos: valores(subgrupos),
    status: valores(status),
  });
}

async function listarVendedores(_req, res) {
  const pool = await getPool();
  const resultado = await pool.request().query(`
    SELECT DISTINCT LTRIM(RTRIM([Vendedor])) AS vendedor
    FROM dbo.Vendas
    WHERE NULLIF(LTRIM(RTRIM([Vendedor])), '') IS NOT NULL
    ORDER BY LTRIM(RTRIM([Vendedor]));
  `);
  return res.status(200).json(resultado.recordset);
}

async function diagnostico(_req, res) {
  const pool = await getPool();
  const resultado = await pool.request().query(`
    SELECT
      DB_NAME() AS banco,
      SUSER_SNAME() AS usuario,
      GETDATE() AS dataServidor;
  `);
  return res.status(200).json({
    ok: true,
    persistenciaCampanhas: DATA_FILE,
    sql: resultado.recordset[0],
  });
}

export default async function handler(req, res) {
  try {
    const tabela = texto(req.query.tabela);
    if (tabela) return await tratarPersistenciaJson(req, res, tabela);

    const recurso = texto(req.query.recurso);
    if (!recurso) {
      return res.status(400).json({
        erro: "Informe 'tabela' para os dados da campanha ou 'recurso' para consultar o SQL Server",
      });
    }

    if (req.method !== 'GET') {
      return res.status(405).json({ erro: 'Método não permitido para este recurso' });
    }

    switch (recurso) {
      case 'produtos':
        return await listarProdutos(req, res);
      case 'filtros-produtos':
        return await listarFiltrosProdutos(req, res);
      case 'vendedores':
        return await listarVendedores(req, res);
      case 'diagnostico':
        return await diagnostico(req, res);
      default:
        return res.status(404).json({ erro: `Recurso desconhecido: ${recurso}` });
    }
  } catch (erro) {
    console.error('[campanhas-data]', erro);
    return res.status(500).json({ erro: erro.message });
  }
}
