import agregadoCidades from '../src/regional-api/agregado-cidades.js';
import agregadoPorDimensao from '../src/regional-api/agregado-por-dimensao.js';
import cidadesExistentes from '../src/regional-api/cidades-existentes.js';
import evolucaoMensal from '../src/regional-api/evolucao-mensal.js';
import heatmapUfMes from '../src/regional-api/heatmap-uf-mes.js';
import kpis from '../src/regional-api/kpis.js';
import periodosDistintos from '../src/regional-api/periodos-distintos.js';
import valoresDistintos from '../src/regional-api/valores-distintos.js';

const ROTAS = Object.freeze({
  'agregado-cidades': agregadoCidades,
  'agregado-por-dimensao': agregadoPorDimensao,
  'cidades-existentes': cidadesExistentes,
  'evolucao-mensal': evolucaoMensal,
  'heatmap-uf-mes': heatmapUfMes,
  kpis,
  'periodos-distintos': periodosDistintos,
  'valores-distintos': valoresDistintos,
});

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ message: 'Método não permitido' });
  }

  const rota = String(req.query?.rota || '').trim();
  const rotaHandler = ROTAS[rota];

  if (!rotaHandler) {
    return res.status(404).json({
      message: 'Rota regional não encontrada',
      rota,
      rotasDisponiveis: Object.keys(ROTAS),
    });
  }

  try {
    return await rotaHandler(req, res);
  } catch (error) {
    console.error(`[regional:${rota}]`, error);
    return res.status(500).json({
      message: error?.message || 'Erro interno na API regional',
      code: error?.code || null,
    });
  }
}
