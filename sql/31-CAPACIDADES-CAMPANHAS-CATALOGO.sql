-- 31-CAPACIDADES-CAMPANHAS-CATALOGO.sql
--
-- Achado da revisao de seguranca de 2026-09-08: escritas em
-- local-api/campanhas-storage.js e local-api/catalogo-estado.js exigiam
-- apenas uma sessao valida (qualquer colaborador logado), sem checar papel
-- ou permissao, diferente do padrao granular ja usado no modulo Wave2
-- (pode_gerenciar_fornecedores, pode_aprovar_materiais, etc).
--
-- Estas duas colunas novas seguem o mesmo padrao. O default TRUE preserva o
-- comportamento atual para os colaboradores ja ativos (ninguem perde acesso
-- ao aplicar esta migracao); um gestor pode revogar por pessoa depois,
-- editando a linha em "colaboradores" no Supabase (mesma forma como as
-- colunas pode_* do Wave2 ja sao geridas hoje, sem tela dedicada).
ALTER TABLE colaboradores
  ADD COLUMN IF NOT EXISTS pode_gerenciar_campanhas boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS pode_gerenciar_catalogo boolean NOT NULL DEFAULT true;
