import { createClient } from "@supabase/supabase-js";

export default async function handler(req, res) {
  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const auth = Buffer.from(
      `${process.env.PMG_USUARIO}:${process.env.PMG_SENHA}`
    ).toString("base64");

    const response = await fetch(
      process.env.PMG_API_URL,
      {
        headers: {
          Authorization: `Basic ${auth}`
        }
      }
    );

    const produtos = await response.json();

    const registros = produtos.map(p => ({
      id: p.ID,
      id_categoria: p.ID_Categoria,
      id_subcategoria: p.ID_SubCategoria,

      nome: p.Nome,

      preco_entrega: p.Preco_Entrega,
      preco_retira: p.Preco_Retira,

      imagem: p.Imagem?.replace(/\\/g, "/"),
      descricao: p.Descricao,

      oferta_retirada:
        p.Ofertas_para_retirar_em_nossa_loja === "Sim",

      oferta_entrega:
        p.Ofertas_para_entregar_em_seu_estabelecimento === "Sim",

      destaque:
        p.Produtos_em_destaque === "Sim",

      atualizado_em: new Date()
    }));

    const { error } = await supabase
      .from("produtos")
      .upsert(registros);

    if (error) throw error;

    return res.status(200).json({
      sucesso: true,
      quantidade: registros.length
    });

  } catch (err) {
    return res.status(500).json({
      erro: err.message
    });
  }
}