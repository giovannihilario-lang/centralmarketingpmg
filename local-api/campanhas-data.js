import {
  listarProdutos,
  listarFiltrosProdutos,
  listarFornecedores,
  listarVendedores,
  consultarApuracao,
  diagnosticoSql,
} from '../src/campanhas/sql-service.js';
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

async function responderSql(req, res, recurso) {
  if (recurso === 'apuracao') {
    if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST para apuração' });
    return res.status(200).json(await consultarApuracao(req.body || {}));
  }

  if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido para este recurso' });

  switch (recurso) {
    case 'produtos':
      return res.status(200).json(await listarProdutos(req.query));
    case 'filtros-produtos':
      return res.status(200).json(await listarFiltrosProdutos(req.query));
    case 'fornecedores':
      return res.status(200).json(await listarFornecedores(req.query));
    case 'vendedores':
    case 'representantes':
      return res.status(200).json(await listarVendedores(req.query));
    case 'diagnostico':
      return res.status(200).json({ ...(await diagnosticoSql()), persistenciaCampanhas: DATA_FILE });
    default:
      return res.status(404).json({ erro: `Recurso desconhecido: ${recurso}` });
  }
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

    return await responderSql(req, res, recurso);
  } catch (erro) {
    console.error('[campanhas-data]', erro);
    return res.status(500).json({ erro: erro.message || 'Falha ao consultar o SQL Server', codigo: erro.code || erro.originalError?.code || 'SQL_ERROR', origem: 'local-api/campanhas-data' });
  }
}
