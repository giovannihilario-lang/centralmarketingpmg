// Antes: rodava via cron (ver vercel.json) e copiava o catálogo da API
// externa da PMG pra uma tabela "produtos" no Supabase, como cache.
//
// Agora: como o catálogo passou a ser buscado direto da API externa em
// api/produtos-supabase.js (sem cache em banco), esse endpoint não tem
// mais trabalho a fazer. Deixei aqui só pra não quebrar o agendamento
// antigo (se ainda existir em algum lugar) — pode ser removido com
// segurança quando quiser.
export default async function handler(req, res) {
  return res.status(200).json({
    sucesso: true,
    mensagem: 'Sincronização não é mais necessária: o catálogo é buscado direto da API externa em /api/produtos-supabase.',
  });
}
