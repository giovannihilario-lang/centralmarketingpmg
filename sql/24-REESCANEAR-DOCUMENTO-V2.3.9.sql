-- PMG Connect V2.3.9 — executar uma vez no SQL Editor do Supabase.
-- Reexecutável. Não altera lançamentos financeiros, permissões de tabelas ou PDFs.
-- Requer a Caixa de Entrada já instalada pelo SQL 08.
begin;

create or replace function public.reescanear_documento_v1(
  p_entrada_id uuid,
  p_resultado jsonb,
  p_versao_esperada timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_entrada public.acompanhamento_documentos_entrada%rowtype;
begin
  if v_ator is null then raise exception 'Usuário não encontrado ou inativo'; end if;
  if p_versao_esperada is null then
    raise exception 'Atualize a página antes de reescanear o documento';
  end if;
  if jsonb_typeof(p_resultado -> 'documentos') is distinct from 'array' then
    raise exception 'A nova leitura não contém documentos válidos';
  end if;
  if jsonb_array_length(p_resultado -> 'documentos') = 0 then
    raise exception 'A nova leitura está vazia; a anterior será mantida';
  end if;

  -- A aprovação trava o item antes de atualizar a entrada; manter a mesma ordem.
  perform id from public.acompanhamento_documentos_itens
    where entrada_id = p_entrada_id order by id for update;
  select * into v_entrada from public.acompanhamento_documentos_entrada
    where id = p_entrada_id for update;
  if not found then raise exception 'Documento não encontrado'; end if;
  if v_entrada.status not in ('aguardando_conferencia', 'erro', 'analisando') then
    raise exception 'Documento fora da etapa de leitura; conferência protegida';
  end if;
  if v_entrada.atualizado_em is distinct from p_versao_esperada then
    raise exception 'O documento mudou durante a leitura. Atualize a página e confira a versão atual';
  end if;
  if not exists (select 1 from public.acompanhamento_documentos_itens where entrada_id = p_entrada_id)
    or exists (
      select 1 from public.acompanhamento_documentos_itens
      where entrada_id = p_entrada_id
        and (status <> 'aguardando_conferencia' or conferido_em is not null
          or registro_id is not null or pagamento_id is not null)
    ) then
    raise exception 'A leitura não pode ser substituída após o início da conferência';
  end if;

  -- Tudo abaixo pertence à mesma transação: qualquer erro restaura a leitura anterior.
  update public.acompanhamento_documentos_entrada
    set status = 'analisando', atualizado_por = v_ator
    where id = p_entrada_id;
  return public.registrar_analise_documento_v1(p_entrada_id, p_resultado);
end;
$$;

revoke all on function public.reescanear_documento_v1(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.reescanear_documento_v1(uuid, jsonb, timestamptz) to authenticated;
comment on function public.reescanear_documento_v1(uuid, jsonb, timestamptz)
  is 'Substitui somente uma extração inteiramente pendente, com controle de versão e conferência humana obrigatória.';

notify pgrst, 'reload schema';
commit;
