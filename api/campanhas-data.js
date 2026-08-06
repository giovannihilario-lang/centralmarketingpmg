import {
  listarProdutos,
  listarFiltrosProdutos,
  listarFornecedores,
  listarVendedores,
  consultarApuracao,
  diagnosticoSql,
} from '../src/campanhas/sql-service.js';

function texto(valor) {
  return String(valor ?? '').trim();
}

export default async function handler(req, res) {
  try {
    const recurso = texto(req.query.recurso);
    if (!recurso) return res.status(400).json({ erro: "Informe o parâmetro 'recurso'" });

    if (recurso === 'apuracao') {
      if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST para apuração' });
      return res.status(200).json(await consultarApuracao(req.body || {}));
    }

    if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido' });

    switch (recurso) {
      case 'produtos':
        return res.status(200).json(await listarProdutos(req.query));
      case 'filtros-produtos':
        return res.status(200).json(await listarFiltrosProdutos(req.query));
      case 'fornecedores':
        return res.status(200).json(await listarFornecedores(req.query));
      case 'vendedores':
        return res.status(200).json(await listarVendedores(req.query));
      case 'diagnostico':
        return res.status(200).json(await diagnosticoSql());
      default:
        return res.status(404).json({ erro: `Recurso desconhecido: ${recurso}` });
    }
  } catch (erro) {
    console.error('[api/campanhas-data]', erro);
    return res.status(500).json({ erro: erro.message });
  }
}
