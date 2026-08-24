-- ============================================================
-- PMG CONNECT - EXCLUSAO SEGURA DE DOCUMENTOS PENDENTES V1.6.0
-- Execute uma vez no SQL Editor depois do SQL 08.
-- Pode ser executado novamente com seguranca.
-- ============================================================

create or replace function public.excluir_entrada_documento_v1(p_entrada_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_caminho text;
begin
  if v_ator is null then raise exception 'Usuario nao encontrado ou inativo'; end if;

  select caminho
    into v_caminho
  from public.acompanhamento_documentos_entrada
  where id = p_entrada_id
  for update;

  if v_caminho is null then raise exception 'Documento nao encontrado'; end if;
  if exists (
    select 1 from public.acompanhamento_documentos_itens
    where entrada_id = p_entrada_id and status = 'aprovado'
  ) then
    raise exception 'Documento ja vinculado a um lancamento. O historico nao pode ser excluido';
  end if;

  delete from public.acompanhamento_documentos_entrada where id = p_entrada_id;
  return v_caminho;
end;
$$;

revoke all on function public.excluir_entrada_documento_v1(uuid) from public;
grant execute on function public.excluir_entrada_documento_v1(uuid) to authenticated;

-- FIM
