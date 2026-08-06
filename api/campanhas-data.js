// Esta rota não acessa o SQL Server pela Vercel.
// O Dashboard Regional e Campanhas usam o Node local da PMG em localhost:3001.
export default function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(503).json({
    erro: 'A consulta comercial de Campanhas é executada pela API local da PMG.',
    codigo: 'SQL_API_LOCAL_REQUIRED',
    origem: 'api/campanhas-data',
    endpointLocal: 'http://localhost:3001/api/campanhas-data',
    instrucao: 'No computador da PMG, abra o terminal na pasta do projeto e execute npm start.',
    escritaSupabase: false,
  });
}
