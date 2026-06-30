import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method === 'GET') {
    const { data, error } = await supabase
      .from('catalogo_estado')
      .select('estado')
      .eq('id', 1)
      .single();
    if (error) return res.status(500).json({ erro: error.message });
    return res.status(200).json(data.estado);
  }

  if (req.method === 'POST') {
    const { error } = await supabase
      .from('catalogo_estado')
      .update({ estado: req.body, atualizado_em: new Date() })
      .eq('id', 1);
    if (error) return res.status(500).json({ erro: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ erro: 'Método não permitido' });
}