-- ============================================================
-- PMG CONNECT - CENTRAL UNIFICADA V1.6.0
-- Execute uma vez no SQL Editor depois dos scripts 06 a 12.
-- Remove separacoes por perfil apenas dentro da Central.
-- Login ativo e trilha de auditoria continuam obrigatorios.
-- ============================================================

begin;

-- A Central passa a oferecer as mesmas operacoes para toda a equipe ativa.
drop trigger if exists trg_gestor_importacoes on public.acompanhamento_importacoes;
drop trigger if exists trg_gestor_conferencias on public.acompanhamento_conferencias;
drop trigger if exists trg_gestor_excluir_pagamento on public.acompanhamento_pagamentos;
drop trigger if exists trg_proteger_arquivamento on public.acompanhamento_registros;

drop function if exists public.exigir_gestor_acompanhamento_v1();
drop function if exists public.proteger_arquivamento_acompanhamento_v1();

-- Qualquer pessoa autenticada e ativa pode retirar um PDF ainda pendente.
-- Documentos aprovados permanecem bloqueados para preservar a auditoria.
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
    select 1
    from public.acompanhamento_documentos_itens
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

-- O arquivo privado segue protegido pelo bucket; a equipe ativa pode remover
-- somente depois de a funcao acima liberar a exclusao da entrada pendente.
drop policy if exists "autor remove arquivos acompanhamento" on storage.objects;
drop policy if exists "equipe remove arquivos pendentes acompanhamento" on storage.objects;
create policy "equipe remove arquivos pendentes acompanhamento" on storage.objects
for delete to authenticated
using (
  bucket_id = 'acompanhamento'
  and public.acompanhamento_colaborador_ativo()
  and not exists (
    select 1
    from public.acompanhamento_documentos_entrada entrada
    join public.acompanhamento_documentos_itens item on item.entrada_id = entrada.id
    where entrada.caminho = storage.objects.name
      and item.status = 'aprovado'
  )
);

commit;

-- FIM
