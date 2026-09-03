-- PMG Connect · acesso restrito Marcos
-- marcos@pmg.com.br: troca obrigatória de senha no primeiro acesso
-- e acesso funcional limitado à Central de Acompanhamento.

begin;

alter table public.colaboradores
  add column if not exists acesso_restrito text,
  add column if not exists trocar_senha_primeiro_acesso boolean not null default false;

alter table public.colaboradores
  drop constraint if exists colaboradores_acesso_restrito_check;
alter table public.colaboradores
  add constraint colaboradores_acesso_restrito_check
  check (acesso_restrito is null or acesso_restrito in ('acompanhamento'));

-- Garante o perfil caso a conta Auth já exista mas ainda nunca tenha entrado.
insert into public.colaboradores (auth_user_id, nome, cargo, role, ativo, perfil_configurado, acesso_restrito, trocar_senha_primeiro_acesso)
select u.id, 'Marcos', 'Acompanhamento', 'colaborador'::public.role_colaborador, true, true, 'acompanhamento', true
from auth.users u
where lower(u.email) = 'marcos@pmg.com.br'
on conflict (auth_user_id) do update
set nome = coalesce(nullif(public.colaboradores.nome,''), 'Marcos'),
    ativo = true,
    acesso_restrito = 'acompanhamento',
    trocar_senha_primeiro_acesso = true,
    atualizado_em = now();

create or replace function public.concluir_primeiro_acesso_restrito()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
begin
  if v_uid is null then raise exception 'Usuário não autenticado'; end if;
  select lower(email) into v_email from auth.users where id = v_uid;
  if v_email <> 'marcos@pmg.com.br' then raise exception 'Operação não autorizada'; end if;

  update public.colaboradores
  set trocar_senha_primeiro_acesso = false,
      acesso_restrito = 'acompanhamento',
      atualizado_em = now()
  where auth_user_id = v_uid;

  return found;
end;
$$;

revoke all on function public.concluir_primeiro_acesso_restrito() from public, anon;
grant execute on function public.concluir_primeiro_acesso_restrito() to authenticated;

commit;
