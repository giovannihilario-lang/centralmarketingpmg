import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    if (req.method === "GET") {
      const { data, error } = await supabase
        .from("campanhas")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      return res.status(200).json(data);
    }

    return res.status(405).json({
      erro: "Método não permitido"
    });

  } catch (err) {
    return res.status(500).json({
      erro: err.message
    });
  }
}