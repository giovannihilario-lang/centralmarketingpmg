import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  try {
    let todos = [];
    let from = 0;
    const PAGE_SIZE = 1000;

    while (true) {
      const { data, error } = await supabase
        .from("produtos")
        .select("*")
        .order("nome")
        .range(from, from + PAGE_SIZE - 1);

      if (error) throw error;
      if (!data || data.length === 0) break;

      todos = todos.concat(data);
      if (data.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return res.status(200).json(todos);

  } catch (err) {
    return res.status(500).json({ erro: err.message });
  }
}