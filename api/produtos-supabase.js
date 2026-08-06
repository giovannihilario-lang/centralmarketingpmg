// Catálogo de produtos usado por campanhas.html e ferramentas/catalogo.html.
//
// Antes: lia de uma tabela "produtos" no Supabase, que era alimentada por
// api/sync-produtos.js a partir da API externa da PMG.
//
// Agora: busca direto na API externa da PMG a cada chamada, sem depender de
// nenhuma tabela no SQL Server (o catálogo de preço/imagem/descrição não
// existe nesse banco — só dados logísticos do ERP). Mantém o MESMO formato
// de resposta de antes, então o front-end não precisa mudar nada.

export default async function handler(req, res) {
  try {
    const apiUrl = process.env.PMG_API_URL;
    const auth = Buffer.from(`${process.env.PMG_USUARIO}:${process.env.PMG_SENHA}`).toString('base64');

    const upstream = await fetch(apiUrl, {
      headers: { Authorization: `Basic ${auth}` },
    });

    if (!upstream.ok) {
      const texto = await upstream.text();
      return res.status(upstream.status).json({ erro: `API PMG retornou ${upstream.status}`, detalhe: texto });
    }

    const produtos = await upstream.json();

    const idsRaw = String(req.query?.ids || '').trim();
    const ids = new Set(idsRaw.split(',').map((v) => String(v).trim()).filter(Boolean).slice(0, 500));
    const busca = String(req.query?.busca || '').trim().toLocaleLowerCase('pt-BR');
    const limite = Math.min(Math.max(Number.parseInt(req.query?.limite, 10) || 500, 1), 500);
    const filtrados = produtos.filter((p) => {
      if (ids.size && !ids.has(String(p.ID))) return false;
      if (busca && !`${p.ID} ${p.Nome || ''} ${p.Descricao || ''}`.toLocaleLowerCase('pt-BR').includes(busca)) return false;
      return true;
    }).slice(0, limite);

    const registros = filtrados.map((p) => ({
      id: p.ID,
      id_categoria: p.ID_Categoria,
      id_subcategoria: p.ID_SubCategoria,
      nome: p.Nome,
      preco_entrega: p.Preco_Entrega,
      preco_retira: p.Preco_Retira,
      imagem: p.Imagem?.replace(/\\/g, '/'),
      descricao: p.Descricao,
      oferta_retirada: p.Ofertas_para_retirar_em_nossa_loja === 'Sim',
      oferta_entrega: p.Ofertas_para_entregar_em_seu_estabelecimento === 'Sim',
      destaque: p.Produtos_em_destaque === 'Sim',
    }));

    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=300');
    return res.status(200).json(registros);
  } catch (err) {
    console.error('[PMG /api/produtos-supabase]', err);
    return res.status(500).json({ erro: err.message });
  }
}
