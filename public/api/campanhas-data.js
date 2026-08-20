/**
 * A interface de Campanhas é publicada na Vercel, mas os dados comerciais
 * precisam sair pela API Node local, como no Dashboard Regional. Esta rota
 * existe apenas para devolver uma explicação em JSON caso seja aberta por engano.
 */
export default function handler(req, res) {
  return res.status(409).json({
    erro: 'As consultas comerciais de Campanhas são executadas pela API local da PMG.',
    codigo: 'USE_LOCAL_API',
    origem: 'api/campanhas-data',
    urlLocal: 'http://localhost:3001/api/campanhas-data',
    dica: 'Execute npm start no computador da PMG e mantenha o terminal aberto.',
  });
}
