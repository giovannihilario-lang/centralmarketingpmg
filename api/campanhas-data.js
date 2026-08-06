export const config = { maxDuration: 60 };

function texto(valor) {
  return String(valor ?? '').trim();
}

function erroPublico(erro) {
  const codigo = erro?.code || erro?.originalError?.code || 'SQL_ERROR';
  const mensagem = erro?.message || 'Falha inesperada ao consultar o SQL Server';
  return {
    erro: mensagem,
    codigo,
    origem: 'api/campanhas-data',
    dica: codigo === 'SQL_ENV_MISSING'
      ? 'Confira as variáveis SQL_* ou AZURE_SQL_* na Vercel e faça um novo deploy.'
      : 'Abra os Runtime Logs do deployment para consultar o erro completo.',
  };
}

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');

  try {
    const servicos = await import('../src/campanhas/sql-service.js');
    const recurso = texto(req.query.recurso);
    if (!recurso) return res.status(400).json({ erro: "Informe o parâmetro 'recurso'" });

    if (recurso === 'apuracao') {
      if (req.method !== 'POST') return res.status(405).json({ erro: 'Use POST para apuração' });
      return res.status(200).json(await servicos.consultarApuracao(req.body || {}));
    }

    if (req.method !== 'GET') return res.status(405).json({ erro: 'Método não permitido' });

    switch (recurso) {
      case 'produtos':
        return res.status(200).json(await servicos.listarProdutos(req.query));
      case 'filtros-produtos':
        return res.status(200).json(await servicos.listarFiltrosProdutos(req.query));
      case 'fornecedores':
        return res.status(200).json(await servicos.listarFornecedores(req.query));
      case 'vendedores':
      case 'representantes':
        return res.status(200).json(await servicos.listarVendedores(req.query));
      case 'diagnostico':
        return res.status(200).json(await servicos.diagnosticoSql());
      default:
        return res.status(404).json({ erro: `Recurso desconhecido: ${recurso}` });
    }
  } catch (erro) {
    console.error('[api/campanhas-data]', erro);
    return res.status(500).json(erroPublico(erro));
  }
}
