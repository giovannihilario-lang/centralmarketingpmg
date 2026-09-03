-- ============================================================
-- PMG CONNECT — ROLLBACK WAVE 1B — IDENTIDADE DE FORNECEDORES
-- ATENÇÃO: remove vínculos/aliases criados pela Wave 1B.
-- Os valores históricos originais de Central/Documentos/Campanhas não são alterados.
-- ============================================================

revoke all on function public.vincular_tarefa_fornecedor_v1(uuid, bigint) from public, anon, authenticated;
revoke all on function public.salvar_decisao_qualidade_fornecedor_v1(text, text, bigint, text) from public, anon, authenticated;
revoke all on function public.revisar_identidade_fornecedor_v1(uuid, text, text) from public, anon, authenticated;
revoke all on function public.registrar_identidade_fornecedor_v1(bigint, text, text, text, text, numeric, text) from public, anon, authenticated;

drop function if exists public.vincular_tarefa_fornecedor_v1(uuid, bigint);
drop function if exists public.salvar_decisao_qualidade_fornecedor_v1(text, text, bigint, text);
drop function if exists public.revisar_identidade_fornecedor_v1(uuid, text, text);
drop function if exists public.registrar_identidade_fornecedor_v1(bigint, text, text, text, text, numeric, text);

drop index if exists public.idx_tarefas_fornecedor;
alter table public.tarefas drop column if exists fornecedor_id;

drop table if exists public.fornecedor_qualidade_decisoes;
drop table if exists public.fornecedor_identidades;

drop function if exists public.normalizar_identidade_fornecedor(text, text);

-- A extensão unaccent não é removida porque pode estar sendo usada por outros módulos.
