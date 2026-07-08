import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Fábrica de handler genérico para os "stores" do módulo de Campanhas.
 * Cada store vira uma tabela no Supabase com o formato:
 *   id text primary key, campanha_id text, data jsonb, created_at, updated_at
 * O objeto inteiro (igual ao que já era salvo no IndexedDB) fica no jsonb `data`,
 * então o front-end não precisa saber nada sobre colunas.
 *
 * comCampanhaId=false é usado só pela tabela "campanhas" (ela É a campanha,
 * não pertence a uma).
 */
export function criarHandlerCampanhas(tabela, comCampanhaId = true) {
  return async function handler(req, res) {
    const { id, campanhaId, all } = req.query;
    try {
      if (req.method === "GET") {
        let query = supabase.from(tabela).select("*").order("created_at", { ascending: false });
        if (id) query = query.eq("id", id);
        if (comCampanhaId && campanhaId) query = query.eq("campanha_id", campanhaId);
        const { data, error } = await query;
        if (error) throw error;
        return res.status(200).json((data || []).map(r => r.data));
      }

      if (req.method === "POST") {
        const body = req.body;
        const itens = Array.isArray(body) ? body : [body];
        if (!itens.length) return res.status(200).json({ ok: true, quantidade: 0 });
        const linhas = itens.map(obj => ({
          id: String(obj.id),
          ...(comCampanhaId ? { campanha_id: obj.campanhaId || null } : {}),
          data: obj,
          updated_at: new Date().toISOString(),
        }));
        const { error } = await supabase.from(tabela).upsert(linhas);
        if (error) throw error;
        return res.status(200).json({ ok: true, quantidade: linhas.length });
      }

      if (req.method === "DELETE") {
        if (all) {
          const { error } = await supabase.from(tabela).delete().neq("id", "__none__");
          if (error) throw error;
          return res.status(200).json({ ok: true });
        }
        if (!id) return res.status(400).json({ erro: "id obrigatório" });
        const { error } = await supabase.from(tabela).delete().eq("id", id);
        if (error) throw error;
        return res.status(200).json({ ok: true });
      }

      return res.status(405).json({ erro: "Método não permitido" });
    } catch (err) {
      console.error(`[campanhasStore:${tabela}]`, err);
      return res.status(500).json({ erro: err.message });
    }
  };
}
