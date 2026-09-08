import { WAVE2_ROUTES } from '../src/lib/wave2.js';

// Rota unica para /api/wave2/* (portal do fornecedor, check-in de academia,
// upload interno). O catch-all "[...param].js" e sintaxe do Next.js e a
// Vercel nao reconhece isso fora de um projeto Next (confirmado ao vivo:
// um arquivo api/wave2/[...route].js foi publicado no deploy mas a rota
// continuou 404). A solucao sem framework e um rewrite em vercel.json que
// aponta /api/wave2/:route* para este arquivo unico, repassando o caminho
// como query string. Um unico arquivo evita criar 7 Serverless Functions
// (uma por rota), o que estouraria o limite de 12 do plano Hobby.
export default async function handler(req, res) {
  const raw = req.query.route;
  const routeValue = Array.isArray(raw) ? raw.join('/') : String(raw || '');
  const path = `/${routeValue}`;
  const routeKey = `${req.method} ${path}`;
  const routeHandler = WAVE2_ROUTES[routeKey];

  if (!routeHandler) {
    return res.status(404).json({ message: `Rota nao encontrada: ${req.method} /api/wave2${path}` });
  }

  return routeHandler(req, res);
}
