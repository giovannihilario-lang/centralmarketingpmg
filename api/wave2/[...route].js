import { WAVE2_ROUTES } from '../../src/lib/wave2.js';

// Catch-all para as rotas /api/wave2/* (portal do fornecedor, check-in de
// academia, upload interno). Antes deste arquivo elas só existiam como rotas
// Express dentro de server.js, que a Vercel nunca reconhece como Serverless
// Function (o server.js não exporta o app; só chama app.listen()), então em
// produção todo /api/wave2/* respondia 404 da própria plataforma. Um único
// arquivo catch-all evita criar 7 Serverless Functions (uma por rota), o que
// estouraria o limite de 12 funções do plano Hobby da Vercel.
export default async function handler(req, res) {
  const segments = Array.isArray(req.query.route) ? req.query.route : [req.query.route].filter(Boolean);
  const path = `/${segments.join('/')}`;
  const routeKey = `${req.method} ${path}`;
  const routeHandler = WAVE2_ROUTES[routeKey];

  if (!routeHandler) {
    return res.status(404).json({ message: `Rota não encontrada: ${req.method} /api/wave2${path}` });
  }

  return routeHandler(req, res);
}
