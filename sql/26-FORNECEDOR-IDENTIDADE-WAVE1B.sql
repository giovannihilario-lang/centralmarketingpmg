-- ============================================================
-- PMG CONNECT — WAVE 1B — IDENTIDADE CANÔNICA DE FORNECEDORES
-- Compatível com o cadastro existente em public.fornecedores.
-- NÃO reescreve registros históricos. public.fornecedores.id é o master ID.
-- ============================================================

create extension if not exists pgcrypto;
create extension if not exists unaccent with schema extensions;

create or replace function public.normalizar_identidade_fornecedor(p_tipo text, p_valor text)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when lower(coalesce(p_tipo, '')) = 'cnpj' then regexp_replace(coalesce(p_valor, ''), '[^0-9]+', '', 'g')
    when lower(coalesce(p_tipo, '')) = 'codigo' then upper(regexp_replace(trim(coalesce(p_valor, '')), '\s+', '', 'g'))
    else trim(regexp_replace(lower(extensions.unaccent(coalesce(p_valor, ''))), '[^a-z0-9]+', ' ', 'g'))
  end;
$$;

create table if not exists public.fornecedor_identidades (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id bigint not null references public.fornecedores(id) on delete cascade,
  tipo text not null,
  origem text not null default 'manual',
  valor_original text not null,
  valor_normalizado text not null,
  estado text not null default 'sugerido',
  confianca numeric(5,4),
  observacoes text,
  criado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  revisado_por uuid references public.colaboradores(id) on delete set null,
  revisado_em timestamptz,
  constraint fornecedor_identidades_tipo_valido check (tipo in ('codigo','cnpj','nome','alias')),
  constraint fornecedor_identidades_estado_valido check (estado in ('sugerido','confirmado','rejeitado')),
  constraint fornecedor_identidades_valor_valido check (length(trim(valor_original)) > 0 and length(trim(valor_normalizado)) > 0),
  constraint fornecedor_identidades_origem_valida check (length(trim(origem)) > 0),
  constraint fornecedor_identidades_confianca_valida check (confianca is null or confianca between 0 and 1),
  constraint fornecedor_identidades_revisao_consistente check (
    (estado = 'sugerido' and revisado_em is null)
    or (estado in ('confirmado','rejeitado') and revisado_em is not null)
  )
);

create unique index if not exists idx_fornecedor_identidades_ativas_unicas
  on public.fornecedor_identidades(lower(origem), tipo, valor_normalizado)
  where estado in ('sugerido','confirmado');

create index if not exists idx_fornecedor_identidades_fornecedor
  on public.fornecedor_identidades(fornecedor_id, estado, tipo);

create index if not exists idx_fornecedor_identidades_lookup
  on public.fornecedor_identidades(tipo, valor_normalizado, estado);

create table if not exists public.fornecedor_qualidade_decisoes (
  issue_key text primary key,
  estado text not null,
  fornecedor_id bigint references public.fornecedores(id) on delete set null,
  observacoes text,
  criado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_por uuid references public.colaboradores(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  constraint fornecedor_qualidade_estado_valido check (estado in ('resolvido','ignorado')),
  constraint fornecedor_qualidade_key_valida check (length(trim(issue_key)) > 0)
);

create index if not exists idx_fornecedor_qualidade_estado
  on public.fornecedor_qualidade_decisoes(estado, atualizado_em desc);

alter table public.tarefas
  add column if not exists fornecedor_id bigint references public.fornecedores(id) on delete set null;

create index if not exists idx_tarefas_fornecedor
  on public.tarefas(fornecedor_id, atualizado_em desc)
  where fornecedor_id is not null;

alter table public.fornecedor_identidades enable row level security;
alter table public.fornecedor_qualidade_decisoes enable row level security;

drop policy if exists "equipe le identidades de fornecedores" on public.fornecedor_identidades;
create policy "equipe le identidades de fornecedores"
on public.fornecedor_identidades
for select
to authenticated
using (public.meu_colaborador_id() is not null);

drop policy if exists "equipe le decisoes de qualidade" on public.fornecedor_qualidade_decisoes;
create policy "equipe le decisoes de qualidade"
on public.fornecedor_qualidade_decisoes
for select
to authenticated
using (public.meu_colaborador_id() is not null);

revoke all on public.fornecedor_identidades from anon, authenticated;
revoke all on public.fornecedor_qualidade_decisoes from anon, authenticated;
grant select on public.fornecedor_identidades to authenticated;
grant select on public.fornecedor_qualidade_decisoes to authenticated;

create or replace function public.registrar_identidade_fornecedor_v1(
  p_fornecedor_id bigint,
  p_tipo text,
  p_valor_original text,
  p_origem text default 'manual',
  p_estado text default 'sugerido',
  p_confianca numeric default null,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_tipo text := lower(trim(coalesce(p_tipo, '')));
  v_origem text := lower(trim(coalesce(p_origem, 'manual')));
  v_estado text := lower(trim(coalesce(p_estado, 'sugerido')));
  v_valor text := trim(coalesce(p_valor_original, ''));
  v_normalizado text;
  v_existente public.fornecedor_identidades;
  v_id uuid;
begin
  if auth.uid() is null or v_ator is null then raise exception 'Usuário não autenticado no PMG Connect'; end if;
  if not exists (select 1 from public.fornecedores f where f.id = p_fornecedor_id) then raise exception 'Fornecedor canônico não encontrado'; end if;
  if v_tipo not in ('codigo','cnpj','nome','alias') then raise exception 'Tipo de identidade inválido'; end if;
  if v_estado not in ('sugerido','confirmado','rejeitado') then raise exception 'Estado de identidade inválido'; end if;
  if v_valor = '' then raise exception 'Valor de identidade obrigatório'; end if;
  if v_estado in ('confirmado','rejeitado') and not public.sou_gestor() then
    raise exception 'Somente gestores podem confirmar ou rejeitar identidades';
  end if;

  v_normalizado := public.normalizar_identidade_fornecedor(v_tipo, v_valor);
  if v_normalizado = '' then raise exception 'Identidade vazia após normalização'; end if;

  if v_tipo = 'cnpj' and v_estado = 'confirmado' and exists (
    select 1 from public.fornecedor_identidades i
    where i.tipo = 'cnpj' and i.valor_normalizado = v_normalizado
      and i.estado = 'confirmado' and i.fornecedor_id <> p_fornecedor_id
  ) then
    raise exception 'Este CNPJ já está confirmado para outro fornecedor canônico';
  end if;

  select * into v_existente
  from public.fornecedor_identidades i
  where lower(i.origem) = v_origem
    and i.tipo = v_tipo
    and i.valor_normalizado = v_normalizado
    and i.estado in ('sugerido','confirmado')
  limit 1;

  if found then
    if v_existente.fornecedor_id <> p_fornecedor_id then
      raise exception 'Esta identidade já está associada a outro fornecedor canônico';
    end if;
    if v_estado = 'confirmado' and v_existente.estado = 'sugerido' then
      update public.fornecedor_identidades
      set estado = 'confirmado', revisado_por = v_ator, revisado_em = now(),
          confianca = coalesce(p_confianca, confianca),
          observacoes = coalesce(nullif(trim(p_observacoes), ''), observacoes)
      where id = v_existente.id;
    end if;
    return v_existente.id;
  end if;

  insert into public.fornecedor_identidades(
    fornecedor_id, tipo, origem, valor_original, valor_normalizado, estado,
    confianca, observacoes, criado_por, revisado_por, revisado_em
  ) values (
    p_fornecedor_id, v_tipo, v_origem, v_valor, v_normalizado, v_estado,
    p_confianca, nullif(trim(p_observacoes), ''), v_ator,
    case when v_estado in ('confirmado','rejeitado') then v_ator else null end,
    case when v_estado in ('confirmado','rejeitado') then now() else null end
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.revisar_identidade_fornecedor_v1(
  p_identidade_id uuid,
  p_estado text,
  p_observacoes text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_estado text := lower(trim(coalesce(p_estado, '')));
  v_identidade public.fornecedor_identidades;
begin
  if auth.uid() is null or v_ator is null then raise exception 'Usuário não autenticado no PMG Connect'; end if;
  if not public.sou_gestor() then raise exception 'Somente gestores podem revisar identidades'; end if;
  if v_estado not in ('confirmado','rejeitado') then raise exception 'Revisão deve confirmar ou rejeitar a identidade'; end if;

  select * into v_identidade from public.fornecedor_identidades where id = p_identidade_id for update;
  if not found then raise exception 'Identidade não encontrada'; end if;
  if v_estado = 'confirmado' and v_identidade.tipo = 'cnpj' and exists (
    select 1 from public.fornecedor_identidades i
    where i.tipo = 'cnpj' and i.valor_normalizado = v_identidade.valor_normalizado
      and i.estado = 'confirmado' and i.fornecedor_id <> v_identidade.fornecedor_id
  ) then
    raise exception 'Este CNPJ já está confirmado para outro fornecedor canônico';
  end if;

  update public.fornecedor_identidades
  set estado = v_estado,
      revisado_por = v_ator,
      revisado_em = now(),
      observacoes = coalesce(nullif(trim(p_observacoes), ''), observacoes)
  where id = p_identidade_id;

  return p_identidade_id;
end;
$$;

create or replace function public.salvar_decisao_qualidade_fornecedor_v1(
  p_issue_key text,
  p_estado text,
  p_fornecedor_id bigint default null,
  p_observacoes text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_estado text := lower(trim(coalesce(p_estado, '')));
  v_key text := trim(coalesce(p_issue_key, ''));
begin
  if auth.uid() is null or v_ator is null then raise exception 'Usuário não autenticado no PMG Connect'; end if;
  if not public.sou_gestor() then raise exception 'Somente gestores podem encerrar alertas de qualidade'; end if;
  if v_key = '' then raise exception 'Chave do problema obrigatória'; end if;
  if v_estado not in ('resolvido','ignorado') then raise exception 'Estado de qualidade inválido'; end if;
  if p_fornecedor_id is not null and not exists (select 1 from public.fornecedores f where f.id = p_fornecedor_id) then
    raise exception 'Fornecedor canônico não encontrado';
  end if;

  insert into public.fornecedor_qualidade_decisoes(
    issue_key, estado, fornecedor_id, observacoes, criado_por, atualizado_por
  ) values (
    v_key, v_estado, p_fornecedor_id, nullif(trim(p_observacoes), ''), v_ator, v_ator
  )
  on conflict (issue_key) do update set
    estado = excluded.estado,
    fornecedor_id = excluded.fornecedor_id,
    observacoes = excluded.observacoes,
    atualizado_por = v_ator,
    atualizado_em = now();

  return v_key;
end;
$$;

create or replace function public.vincular_tarefa_fornecedor_v1(
  p_tarefa_id uuid,
  p_fornecedor_id bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_tarefa public.tarefas;
begin
  if auth.uid() is null or v_ator is null then raise exception 'Usuário não autenticado no PMG Connect'; end if;
  if p_fornecedor_id is not null and not exists (select 1 from public.fornecedores f where f.id = p_fornecedor_id) then
    raise exception 'Fornecedor canônico não encontrado';
  end if;

  select * into v_tarefa from public.tarefas where id = p_tarefa_id for update;
  if not found then raise exception 'Demanda não encontrada'; end if;

  if not public.sou_gestor()
     and v_tarefa.criado_por <> v_ator
     and coalesce(v_tarefa.responsavel_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_ator
     and not exists (
       select 1 from public.tarefa_executores e
       where e.tarefa_id = p_tarefa_id and e.colaborador_id = v_ator
     ) then
    raise exception 'Você não pode alterar o fornecedor desta demanda';
  end if;

  update public.tarefas
  set fornecedor_id = p_fornecedor_id,
      atualizado_em = now()
  where id = p_tarefa_id;

  return p_tarefa_id;
end;
$$;

revoke all on function public.normalizar_identidade_fornecedor(text, text) from public, anon, authenticated;
revoke all on function public.registrar_identidade_fornecedor_v1(bigint, text, text, text, text, numeric, text) from public, anon;
revoke all on function public.revisar_identidade_fornecedor_v1(uuid, text, text) from public, anon;
revoke all on function public.salvar_decisao_qualidade_fornecedor_v1(text, text, bigint, text) from public, anon;
revoke all on function public.vincular_tarefa_fornecedor_v1(uuid, bigint) from public, anon;

grant execute on function public.registrar_identidade_fornecedor_v1(bigint, text, text, text, text, numeric, text) to authenticated;
grant execute on function public.revisar_identidade_fornecedor_v1(uuid, text, text) to authenticated;
grant execute on function public.salvar_decisao_qualidade_fornecedor_v1(text, text, bigint, text) to authenticated;
grant execute on function public.vincular_tarefa_fornecedor_v1(uuid, bigint) to authenticated;

-- Novas tabelas no public podem não ser expostas automaticamente pela Data API
-- em projetos Supabase atuais. Estes GRANTs são intencionais e combinados com RLS.
-- Nenhuma escrita direta é concedida ao cliente.
