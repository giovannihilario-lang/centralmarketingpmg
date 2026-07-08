import { criarHandlerCampanhas } from "./_lib/campanhasStore.js";

// Tabela "campanhas" — a própria campanha, não pertence a nenhuma outra.
export default criarHandlerCampanhas("campanhas", false);
