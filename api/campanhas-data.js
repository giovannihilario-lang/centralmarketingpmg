/**
 * Esta rota não acessa o SQL Server pela Vercel.
 * A página de Campanhas segue o Dashboard Regional e usa a API Node local.
 */
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  return res.status(409).json({
    erro: 'Os dados comerciais de Campanhas são fornecidos pela API local da PMG.',
    codigo: 'USE_LOCAL_API',
    endpoint: 'http://localhost:3001/api/campanhas-data',
    dica: 'Abra o terminal na pasta do projeto, execute npm start e mantenha-o aberto.',
    escritaSupabase: false,
  });
}
