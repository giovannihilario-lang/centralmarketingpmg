-- ============================================================
-- PMG CONNECT V3.8.1
-- ACADEMIA PMG — INSCRICOES, PRESENCAS E BONUS DE CAMPANHA
--
-- IMPORTANTE:
-- - NAO substitui academia_reservas.
-- - NAO altera forms_url das solicitacoes/reservas.
-- - O Forms de inscricao e um fluxo separado.
-- ============================================================

begin;

alter table if exists public.colaboradores
  add column if not exists pode_gerenciar_academia boolean not null default false;

create table if not exists public.academia_inscricoes (
  id uuid primary key default gen_random_uuid(),
  treinamento_id uuid references public.academia_reservas(id) on delete set null,
  forms_linha_chave text not null,
  nome_forms text not null,
  email text,
  telefone text,
  vendedor_raw text,
  vendedor_codigo text,
  vendedor_nome text,
  vinculo_status text not null default 'pendente',
  presente boolean not null default false,
  confirmado_por uuid references public.colaboradores(id) on delete set null,
  confirmado_em timestamptz,
  forms_payload jsonb not null default '{}'::jsonb,
  criado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint academia_inscricao_nome_nao_vazio check (length(trim(nome_forms)) > 0),
  constraint academia_inscricao_vinculo_valido check (vinculo_status in ('pendente','automatico','manual'))
);

create unique index if not exists idx_academia_inscricoes_forms_chave
  on public.academia_inscricoes(forms_linha_chave);
create index if not exists idx_academia_inscricoes_treinamento
  on public.academia_inscricoes(treinamento_id, criado_em desc);
create index if not exists idx_academia_inscricoes_vendedor_codigo
  on public.academia_inscricoes(vendedor_codigo)
  where vendedor_codigo is not null;
create index if not exists idx_academia_inscricoes_presente
  on public.academia_inscricoes(presente, treinamento_id);

-- Usa o mesmo trigger de atualizado_em ja existente no modulo de Demandas.
drop trigger if exists trg_academia_inscricoes_atualizado_em on public.academia_inscricoes;
create trigger trg_academia_inscricoes_atualizado_em
before update on public.academia_inscricoes
for each row execute function public.set_atualizado_em();

create or replace function public.posso_gerenciar_academia()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.sou_gestor()
    or exists (
      select 1
      from public.colaboradores c
      where c.id = public.meu_colaborador_id()
        and coalesce(c.pode_gerenciar_academia, false) = true
    );
$$;

create or replace function public.importar_inscricao_academia_forms(
  p_chave text,
  p_treinamento_id uuid,
  p_nome text,
  p_email text,
  p_telefone text,
  p_vendedor_raw text,
  p_vendedor_codigo text,
  p_vendedor_nome text,
  p_vinculo_status text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := public.meu_colaborador_id();
  v_id uuid;
  v_status text := case when p_vinculo_status in ('automatico','manual') then p_vinculo_status else 'pendente' end;
begin
  if not public.posso_gerenciar_academia() then
    raise exception 'Voce nao tem permissao para importar inscricoes da Academia PMG';
  end if;
  if p_chave is null or length(trim(p_chave)) = 0 then
    raise exception 'A inscricao precisa de uma chave de identificacao';
  end if;
  if p_nome is null or length(trim(p_nome)) = 0 then
    raise exception 'Informe o nome do participante';
  end if;
  if p_treinamento_id is not null and not exists (
    select 1 from public.academia_reservas r where r.id = p_treinamento_id
  ) then
    raise exception 'Treinamento nao encontrado';
  end if;

  insert into public.academia_inscricoes as atual (
    treinamento_id, forms_linha_chave, nome_forms, email, telefone,
    vendedor_raw, vendedor_codigo, vendedor_nome, vinculo_status,
    forms_payload, criado_por
  ) values (
    p_treinamento_id, trim(p_chave), trim(p_nome),
    nullif(trim(coalesce(p_email,'')),''),
    nullif(trim(coalesce(p_telefone,'')),''),
    nullif(trim(coalesce(p_vendedor_raw,'')),''),
    nullif(trim(coalesce(p_vendedor_codigo,'')),''),
    nullif(trim(coalesce(p_vendedor_nome,'')),''),
    v_status, coalesce(p_payload,'{}'::jsonb), v_usuario
  )
  on conflict (forms_linha_chave) do update set
    treinamento_id = coalesce(excluded.treinamento_id, atual.treinamento_id),
    nome_forms = excluded.nome_forms,
    email = excluded.email,
    telefone = excluded.telefone,
    vendedor_raw = case
      when atual.vinculo_status = 'manual' then atual.vendedor_raw
      else coalesce(excluded.vendedor_raw, atual.vendedor_raw)
    end,
    vendedor_codigo = case
      when atual.vinculo_status = 'manual' then atual.vendedor_codigo
      else coalesce(excluded.vendedor_codigo, atual.vendedor_codigo)
    end,
    vendedor_nome = case
      when atual.vinculo_status = 'manual' then atual.vendedor_nome
      else coalesce(excluded.vendedor_nome, atual.vendedor_nome)
    end,
    vinculo_status = case
      when atual.vinculo_status = 'manual' then 'manual'
      when excluded.vendedor_nome is not null then v_status
      else atual.vinculo_status
    end,
    forms_payload = excluded.forms_payload,
    atualizado_em = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.vincular_inscricao_academia(
  p_id uuid,
  p_vendedor_codigo text,
  p_vendedor_nome text,
  p_vendedor_raw text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.posso_gerenciar_academia() then
    raise exception 'Voce nao tem permissao para vincular representantes';
  end if;
  if not exists (select 1 from public.academia_inscricoes where id = p_id) then
    raise exception 'Inscricao nao encontrada';
  end if;

  update public.academia_inscricoes
  set vendedor_codigo = nullif(trim(coalesce(p_vendedor_codigo,'')),''),
      vendedor_nome = nullif(trim(coalesce(p_vendedor_nome,'')),''),
      vendedor_raw = nullif(trim(coalesce(p_vendedor_raw,'')),''),
      vinculo_status = case when nullif(trim(coalesce(p_vendedor_nome,'')),'') is null then 'pendente' else 'manual' end,
      atualizado_em = now()
  where id = p_id;
end;
$$;

create or replace function public.vincular_treinamento_inscricao_academia(
  p_id uuid,
  p_treinamento_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.posso_gerenciar_academia() then
    raise exception 'Voce nao tem permissao para alterar o treinamento da inscricao';
  end if;
  if p_treinamento_id is not null and not exists (
    select 1 from public.academia_reservas r where r.id = p_treinamento_id
  ) then
    raise exception 'Treinamento nao encontrado';
  end if;

  update public.academia_inscricoes
  set treinamento_id = p_treinamento_id,
      atualizado_em = now()
  where id = p_id;
  if not found then raise exception 'Inscricao nao encontrada'; end if;
end;
$$;

create or replace function public.atualizar_presenca_academia(
  p_id uuid,
  p_presente boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := public.meu_colaborador_id();
begin
  if not public.posso_gerenciar_academia() then
    raise exception 'Voce nao tem permissao para confirmar presencas';
  end if;

  update public.academia_inscricoes
  set presente = coalesce(p_presente,false),
      confirmado_por = case when coalesce(p_presente,false) then v_usuario else null end,
      confirmado_em = case when coalesce(p_presente,false) then now() else null end,
      atualizado_em = now()
  where id = p_id;
  if not found then raise exception 'Inscricao nao encontrada'; end if;
end;
$$;

alter table public.academia_inscricoes enable row level security;

drop policy if exists "autenticados leem inscricoes academia" on public.academia_inscricoes;
create policy "autenticados leem inscricoes academia"
on public.academia_inscricoes for select to authenticated using (true);

revoke all privileges on table public.academia_inscricoes from anon, authenticated;
grant select on table public.academia_inscricoes to authenticated;

revoke all on function public.posso_gerenciar_academia() from public, anon;
revoke all on function public.importar_inscricao_academia_forms(text, uuid, text, text, text, text, text, text, text, jsonb) from public, anon;
revoke all on function public.vincular_inscricao_academia(uuid, text, text, text) from public, anon;
revoke all on function public.vincular_treinamento_inscricao_academia(uuid, uuid) from public, anon;
revoke all on function public.atualizar_presenca_academia(uuid, boolean) from public, anon;

grant execute on function public.posso_gerenciar_academia() to authenticated;
grant execute on function public.importar_inscricao_academia_forms(text, uuid, text, text, text, text, text, text, text, jsonb) to authenticated;
grant execute on function public.vincular_inscricao_academia(uuid, text, text, text) to authenticated;
grant execute on function public.vincular_treinamento_inscricao_academia(uuid, uuid) to authenticated;
grant execute on function public.atualizar_presenca_academia(uuid, boolean) to authenticated;

alter table public.academia_inscricoes replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'academia_inscricoes'
     ) then
    alter publication supabase_realtime add table public.academia_inscricoes;
  end if;
end
$$;

commit;

select
  count(*) as inscricoes,
  count(*) filter (where presente) as presencas_confirmadas,
  count(*) filter (where vendedor_nome is null) as vinculos_pendentes
from public.academia_inscricoes;
