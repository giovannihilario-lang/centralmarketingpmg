// Compatibilidade: a implementação ativa e única do Dashboard Regional vive em /local-api.
// Este reexport evita que duas cópias da mesma regra SQL voltem a divergir.
export { default } from '../../local-api/evolucao-mensal.js';
