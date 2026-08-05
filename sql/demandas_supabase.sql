-- ============================================================
-- PMG CONNECT — MÓDULO DE DEMANDAS
-- Supabase / PostgreSQL
-- ============================================================
-- Execute este arquivo no SQL Editor do Supabase.
-- O script é idempotente: pode ser executado novamente durante ajustes.
-- ============================================================

create extension if not exists pgcrypto;

-- O pg_cron é usado para gerar as notificações de prazo próximo.
-- Em projetos onde a criação por SQL estiver bloqueada, habilite
-- "Cron" em Database > Integrations e execute o bloco de agendamento
-- localizado no fim deste arquivo novamente.
do $$
begin
  execute 'create extension if not exists pg_cron with schema extensions';
exception
  when insufficient_privilege then
    raise notice 'pg_cron não foi habilitado por falta de permissão. Ative Cron no painel do Supabase.';
  when others then
    raise notice 'Não foi possível habilitar pg_cron automaticamente: %', sqlerrm;
end
$$;

-- ============================================================
-- ENUMS
-- ============================================================

do $$
begin
  create type public.status_tarefa as enum ('nova', 'andamento', 'revisao', 'concluida');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.prioridade_tarefa as enum ('baixa', 'media', 'alta', 'urgente');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.tipo_notificacao as enum ('nova_tarefa', 'prazo_proximo', 'comentario', 'status_mudou');
exception when duplicate_object then null;
end
$$;

do $$
begin
  create type public.role_colaborador as enum ('gestor', 'colaborador');
exception when duplicate_object then null;
end
$$;

-- ============================================================
-- TABELAS
-- ============================================================

create table if not exists public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete cascade,
  nome text not null,
  foto_url text,
  cargo text,
  role public.role_colaborador not null default 'colaborador',
  ativo boolean not null default true,
  perfil_configurado boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint colaboradores_nome_nao_vazio check (length(trim(nome)) > 0)
);

create table if not exists public.tarefas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  status public.status_tarefa not null default 'nova',
  prioridade public.prioridade_tarefa not null default 'media',
  responsavel_id uuid references public.colaboradores(id) on delete set null,
  criado_por uuid references public.colaboradores(id) on delete restrict not null,
  prazo date,
  tags text[] not null default '{}'::text[],
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  arquivada_em timestamptz,
  arquivada_por uuid references public.colaboradores(id) on delete set null,
  constraint tarefas_titulo_nao_vazio check (length(trim(titulo)) > 0),
  constraint tarefas_arquivamento_consistente check (
    (arquivada_em is null and arquivada_por is null)
    or arquivada_em is not null
  )
);

create table if not exists public.comentarios (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid references public.tarefas(id) on delete cascade not null,
  colaborador_id uuid references public.colaboradores(id) on delete restrict not null,
  texto text not null,
  criado_em timestamptz not null default now(),
  constraint comentarios_texto_nao_vazio check (length(trim(texto)) > 0)
);

create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid references public.tarefas(id) on delete cascade,
  colaborador_id uuid references public.colaboradores(id) on delete cascade not null,
  tipo public.tipo_notificacao not null,
  lida boolean not null default false,
  chave_deduplicacao text unique,
  push_enviada_em timestamptz,
  criado_em timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid references public.colaboradores(id) on delete cascade not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Compatibilidade para quem já executou versões anteriores do schema.
alter table public.colaboradores add column if not exists auth_user_id uuid;
alter table public.colaboradores add column if not exists perfil_configurado boolean not null default false;
alter table public.colaboradores add column if not exists atualizado_em timestamptz not null default now();
alter table public.tarefas add column if not exists arquivada_em timestamptz;
alter table public.tarefas add column if not exists arquivada_por uuid references public.colaboradores(id) on delete set null;
alter table public.notificacoes add column if not exists chave_deduplicacao text;
alter table public.notificacoes add column if not exists push_enviada_em timestamptz;
alter table public.push_subscriptions add column if not exists atualizado_em timestamptz not null default now();

-- Garante a FK para instalações que já possuíam a tabela colaboradores.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.colaboradores'::regclass
      and contype = 'f'
      and conkey = array[(
        select attnum from pg_attribute
        where attrelid = 'public.colaboradores'::regclass
          and attname = 'auth_user_id'
      )]::smallint[]
  ) then
    alter table public.colaboradores
      add constraint colaboradores_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete cascade;
  end if;
end
$$;

drop index if exists public.idx_colaboradores_auth_user_id;
create unique index idx_colaboradores_auth_user_id
  on public.colaboradores(auth_user_id);

create unique index if not exists idx_notificacoes_chave_deduplicacao
  on public.notificacoes(chave_deduplicacao)
  where chave_deduplicacao is not null;

create index if not exists idx_tarefas_responsavel on public.tarefas(responsavel_id);
create index if not exists idx_tarefas_criado_por on public.tarefas(criado_por);
create index if not exists idx_tarefas_status on public.tarefas(status);
create index if not exists idx_tarefas_prazo on public.tarefas(prazo) where prazo is not null;
create index if not exists idx_tarefas_ativas on public.tarefas(status, prioridade, prazo) where arquivada_em is null;
create index if not exists idx_notificacoes_colaborador on public.notificacoes(colaborador_id, lida, criado_em desc);
create index if not exists idx_notificacoes_push_pendente on public.notificacoes(criado_em) where push_enviada_em is null;
create index if not exists idx_comentarios_tarefa on public.comentarios(tarefa_id, criado_em);
create index if not exists idx_push_subscriptions_colaborador on public.push_subscriptions(colaborador_id);

-- ============================================================
-- FUNÇÕES AUXILIARES DE IDENTIDADE
-- ============================================================

create or replace function public.meu_colaborador_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
  from public.colaboradores c
  where c.auth_user_id = auth.uid()
    and c.ativo = true
  limit 1;
$$;

create or replace function public.sou_gestor()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1
      from public.colaboradores c
      where c.auth_user_id = auth.uid()
        and c.ativo = true
        and c.role = 'gestor'::public.role_colaborador
    ),
    false
  );
$$;

-- Garante o perfil para usuários já existentes no Auth e também para
-- contas criadas antes da instalação deste módulo.
create or replace function public.garantir_meu_perfil()
returns public.colaboradores
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := coalesce(auth.jwt() ->> 'email', 'colaborador');
  v_colaborador public.colaboradores;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  insert into public.colaboradores (
    auth_user_id,
    nome,
    cargo,
    role,
    perfil_configurado
  )
  values (
    v_uid,
    initcap(replace(split_part(v_email, '@', 1), '.', ' ')),
    'Marketing',
    'colaborador'::public.role_colaborador,
    false
  )
  on conflict (auth_user_id) do nothing;

  select c.*
  into v_colaborador
  from public.colaboradores c
  where c.auth_user_id = v_uid;

  return v_colaborador;
end;
$$;

-- Cria automaticamente um perfil básico para novos usuários do Supabase Auth.
create or replace function public.handle_novo_usuario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.colaboradores (
    auth_user_id,
    nome,
    cargo,
    role,
    perfil_configurado
  )
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'nome'), ''),
      initcap(replace(split_part(coalesce(new.email, 'colaborador'), '@', 1), '.', ' '))
    ),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'cargo'), ''), 'Marketing'),
    'colaborador'::public.role_colaborador,
    false
  )
  on conflict (auth_user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists trg_auth_novo_usuario on auth.users;
create trigger trg_auth_novo_usuario
after insert on auth.users
for each row execute function public.handle_novo_usuario();

-- ============================================================
-- TRIGGERS DE DATA
-- ============================================================

create or replace function public.set_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_tarefas_atualizado_em on public.tarefas;
create trigger trg_tarefas_atualizado_em
before update on public.tarefas
for each row execute function public.set_atualizado_em();

drop trigger if exists trg_colaboradores_atualizado_em on public.colaboradores;
create trigger trg_colaboradores_atualizado_em
before update on public.colaboradores
for each row execute function public.set_atualizado_em();

drop trigger if exists trg_push_subscriptions_atualizado_em on public.push_subscriptions;
create trigger trg_push_subscriptions_atualizado_em
before update on public.push_subscriptions
for each row execute function public.set_atualizado_em();

-- ============================================================
-- TRIGGERS DE NOTIFICAÇÃO
-- ============================================================

create or replace function public.notificar_tarefa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator_id uuid := public.meu_colaborador_id();
begin
  if tg_op = 'INSERT' then
    if new.responsavel_id is not null
       and new.responsavel_id is distinct from v_ator_id then
      insert into public.notificacoes (tarefa_id, colaborador_id, tipo)
      values (new.id, new.responsavel_id, 'nova_tarefa'::public.tipo_notificacao);
    end if;

  elsif tg_op = 'UPDATE' then
    if new.arquivada_em is null then
      if new.responsavel_id is distinct from old.responsavel_id
         and new.responsavel_id is not null
         and new.responsavel_id is distinct from v_ator_id then
        insert into public.notificacoes (tarefa_id, colaborador_id, tipo)
        values (new.id, new.responsavel_id, 'nova_tarefa'::public.tipo_notificacao);
      end if;

      if new.status is distinct from old.status
         and new.criado_por is distinct from v_ator_id then
        insert into public.notificacoes (tarefa_id, colaborador_id, tipo)
        values (new.id, new.criado_por, 'status_mudou'::public.tipo_notificacao);
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notificar_tarefa on public.tarefas;
create trigger trg_notificar_tarefa
after insert or update on public.tarefas
for each row execute function public.notificar_tarefa();

create or replace function public.notificar_comentario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_responsavel_id uuid;
  v_criado_por uuid;
begin
  select t.responsavel_id, t.criado_por
  into v_responsavel_id, v_criado_por
  from public.tarefas t
  where t.id = new.tarefa_id
    and t.arquivada_em is null;

  if v_responsavel_id is not null
     and v_responsavel_id <> new.colaborador_id then
    insert into public.notificacoes (tarefa_id, colaborador_id, tipo)
    values (new.tarefa_id, v_responsavel_id, 'comentario'::public.tipo_notificacao);
  end if;

  if v_criado_por is not null
     and v_criado_por <> new.colaborador_id
     and v_criado_por is distinct from v_responsavel_id then
    insert into public.notificacoes (tarefa_id, colaborador_id, tipo)
    values (new.tarefa_id, v_criado_por, 'comentario'::public.tipo_notificacao);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_notificar_comentario on public.comentarios;
create trigger trg_notificar_comentario
after insert on public.comentarios
for each row execute function public.notificar_comentario();

-- ============================================================
-- RPC: PERFIL
-- ============================================================

create or replace function public.atualizar_meu_perfil(
  p_nome text,
  p_cargo text
)
returns public.colaboradores
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_colaborador public.colaboradores;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado';
  end if;

  if p_nome is null or length(trim(p_nome)) < 2 then
    raise exception 'Informe um nome válido';
  end if;

  perform public.garantir_meu_perfil();

  update public.colaboradores c
  set nome = trim(p_nome),
      cargo = nullif(trim(p_cargo), ''),
      perfil_configurado = true
  where c.auth_user_id = v_uid
    and c.ativo = true
  returning c.* into v_colaborador;

  if v_colaborador.id is null then
    raise exception 'Colaborador não encontrado ou inativo';
  end if;

  return v_colaborador;
end;
$$;

-- ============================================================
-- RPCs DE TAREFAS
-- ============================================================

-- Remove assinaturas antigas e a versão atual antes de recriar.
-- Isso evita o erro 42P13 quando uma execução anterior criou parâmetros com DEFAULT.
drop function if exists public.criar_tarefa(text, text, public.prioridade_tarefa, uuid, uuid, date, text[]);
drop function if exists public.criar_tarefa(text, text, public.prioridade_tarefa, uuid, date, text[]);
drop function if exists public.adicionar_comentario(uuid, uuid, text);

create or replace function public.criar_tarefa(
  p_titulo text,
  p_descricao text,
  p_prioridade public.prioridade_tarefa,
  p_responsavel_id uuid,
  p_prazo date,
  p_tags text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tarefa_id uuid;
  v_criado_por uuid := public.meu_colaborador_id();
begin
  if not public.sou_gestor() then
    raise exception 'Somente gestores podem criar tarefas';
  end if;

  if p_titulo is null or length(trim(p_titulo)) = 0 then
    raise exception 'O título da tarefa é obrigatório';
  end if;

  if p_responsavel_id is not null
     and not exists (
       select 1 from public.colaboradores c
       where c.id = p_responsavel_id and c.ativo = true
     ) then
    raise exception 'O responsável informado não existe ou está inativo';
  end if;

  insert into public.tarefas (
    titulo, descricao, prioridade, responsavel_id, criado_por, prazo, tags
  )
  values (
    trim(p_titulo),
    nullif(trim(p_descricao), ''),
    coalesce(p_prioridade, 'media'::public.prioridade_tarefa),
    p_responsavel_id,
    v_criado_por,
    p_prazo,
    coalesce(p_tags, '{}'::text[])
  )
  returning id into v_tarefa_id;

  return v_tarefa_id;
end;
$$;

create or replace function public.atualizar_status(
  p_tarefa_id uuid,
  p_status public.status_tarefa
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator_id uuid := public.meu_colaborador_id();
  v_responsavel_id uuid;
  v_arquivada_em timestamptz;
begin
  if v_ator_id is null then
    raise exception 'Colaborador não encontrado ou inativo';
  end if;

  if p_status is null then
    raise exception 'O status é obrigatório';
  end if;

  select t.responsavel_id, t.arquivada_em
  into v_responsavel_id, v_arquivada_em
  from public.tarefas t
  where t.id = p_tarefa_id;

  if not found then
    raise exception 'Tarefa não encontrada';
  end if;

  if v_arquivada_em is not null then
    raise exception 'Não é possível alterar uma tarefa arquivada';
  end if;

  if not public.sou_gestor()
     and v_ator_id is distinct from v_responsavel_id then
    raise exception 'Você só pode alterar tarefas atribuídas a você';
  end if;

  update public.tarefas
  set status = p_status
  where id = p_tarefa_id;
end;
$$;

create or replace function public.atribuir_tarefa(
  p_tarefa_id uuid,
  p_responsavel_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sou_gestor() then
    raise exception 'Somente gestores podem atribuir tarefas';
  end if;

  if not exists (
    select 1 from public.tarefas t
    where t.id = p_tarefa_id and t.arquivada_em is null
  ) then
    raise exception 'Tarefa não encontrada ou arquivada';
  end if;

  if p_responsavel_id is not null
     and not exists (
       select 1 from public.colaboradores c
       where c.id = p_responsavel_id and c.ativo = true
     ) then
    raise exception 'O responsável informado não existe ou está inativo';
  end if;

  update public.tarefas
  set responsavel_id = p_responsavel_id
  where id = p_tarefa_id;
end;
$$;

create or replace function public.adicionar_comentario(
  p_tarefa_id uuid,
  p_texto text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_comentario_id uuid;
  v_colaborador_id uuid := public.meu_colaborador_id();
begin
  if v_colaborador_id is null then
    raise exception 'Colaborador não encontrado ou inativo';
  end if;

  if p_texto is null or length(trim(p_texto)) = 0 then
    raise exception 'O comentário não pode estar vazio';
  end if;

  if not exists (
    select 1 from public.tarefas t
    where t.id = p_tarefa_id and t.arquivada_em is null
  ) then
    raise exception 'Tarefa não encontrada ou arquivada';
  end if;

  insert into public.comentarios (tarefa_id, colaborador_id, texto)
  values (p_tarefa_id, v_colaborador_id, trim(p_texto))
  returning id into v_comentario_id;

  return v_comentario_id;
end;
$$;

create or replace function public.arquivar_tarefa(p_tarefa_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator_id uuid := public.meu_colaborador_id();
begin
  if not public.sou_gestor() then
    raise exception 'Somente gestores podem arquivar tarefas';
  end if;

  update public.tarefas
  set arquivada_em = now(),
      arquivada_por = v_ator_id
  where id = p_tarefa_id
    and arquivada_em is null;

  if not found then
    raise exception 'Tarefa não encontrada ou já arquivada';
  end if;
end;
$$;

create or replace function public.restaurar_tarefa(p_tarefa_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sou_gestor() then
    raise exception 'Somente gestores podem restaurar tarefas';
  end if;

  update public.tarefas
  set arquivada_em = null,
      arquivada_por = null
  where id = p_tarefa_id
    and arquivada_em is not null;

  if not found then
    raise exception 'Tarefa não encontrada ou não está arquivada';
  end if;
end;
$$;

-- ============================================================
-- RPCs DE NOTIFICAÇÕES E PUSH
-- ============================================================

create or replace function public.marcar_notificacao_lida(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_colaborador_id uuid := public.meu_colaborador_id();
begin
  update public.notificacoes n
  set lida = true
  where n.id = p_id
    and n.colaborador_id = v_colaborador_id;

  if not found then
    raise exception 'Notificação não encontrada ou acesso negado';
  end if;
end;
$$;

create or replace function public.marcar_todas_notificacoes_lidas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_colaborador_id uuid := public.meu_colaborador_id();
begin
  update public.notificacoes n
  set lida = true
  where n.colaborador_id = v_colaborador_id
    and n.lida = false;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

create or replace function public.registrar_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_colaborador_id uuid := public.meu_colaborador_id();
begin
  if v_colaborador_id is null then
    raise exception 'Colaborador não encontrado ou inativo';
  end if;

  if nullif(trim(p_endpoint), '') is null
     or nullif(trim(p_p256dh), '') is null
     or nullif(trim(p_auth), '') is null then
    raise exception 'Inscrição push inválida';
  end if;

  insert into public.push_subscriptions (colaborador_id, endpoint, p256dh, auth)
  values (v_colaborador_id, p_endpoint, p_p256dh, p_auth)
  on conflict (endpoint) do update
    set colaborador_id = excluded.colaborador_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        atualizado_em = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.remover_push_subscription(p_endpoint text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_colaborador_id uuid := public.meu_colaborador_id();
begin
  delete from public.push_subscriptions s
  where s.endpoint = p_endpoint
    and s.colaborador_id = v_colaborador_id;
end;
$$;

-- ============================================================
-- AUTOMAÇÃO: PRAZO PRÓXIMO
-- ============================================================

create or replace function public.gerar_notificacoes_prazo_proximo()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  insert into public.notificacoes (
    tarefa_id,
    colaborador_id,
    tipo,
    chave_deduplicacao
  )
  select
    t.id,
    coalesce(t.responsavel_id, t.criado_por),
    'prazo_proximo'::public.tipo_notificacao,
    concat('prazo:', t.id, ':', coalesce(t.responsavel_id, t.criado_por), ':', v_hoje)
  from public.tarefas t
  where t.arquivada_em is null
    and t.status <> 'concluida'::public.status_tarefa
    and t.prazo is not null
    and t.prazo between v_hoje and (v_hoje + 1)
  on conflict (chave_deduplicacao) do nothing;

  get diagnostics v_total = row_count;
  return v_total;
end;
$$;

-- Agenda diariamente às 11:00 UTC, equivalente a 08:00 em São Paulo.
do $$
declare
  v_jobid bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for v_jobid in
      select jobid from cron.job where jobname = 'pmg-demandas-prazo-proximo'
    loop
      perform cron.unschedule(v_jobid);
    end loop;

    perform cron.schedule(
      'pmg-demandas-prazo-proximo',
      '0 11 * * *',
      'select public.gerar_notificacoes_prazo_proximo();'
    );
  else
    raise notice 'Cron não agendado. Habilite pg_cron e execute novamente este bloco.';
  end if;
exception
  when undefined_table or invalid_schema_name or undefined_function then
    raise notice 'Cron não agendado. Habilite a integração Cron no Supabase e execute novamente este bloco.';
end
$$;

-- ============================================================
-- RLS
-- ============================================================

alter table public.colaboradores enable row level security;
alter table public.tarefas enable row level security;
alter table public.comentarios enable row level security;
alter table public.notificacoes enable row level security;
alter table public.push_subscriptions enable row level security;

-- Remove políticas antigas e versões anteriores.
drop policy if exists "leitura livre colaboradores" on public.colaboradores;
drop policy if exists "leitura livre tarefas" on public.tarefas;
drop policy if exists "leitura livre comentarios" on public.comentarios;
drop policy if exists "insert via rpc apenas" on public.comentarios;
drop policy if exists "update via rpc apenas" on public.tarefas;
drop policy if exists "insert via rpc apenas" on public.tarefas;
drop policy if exists "ve suas notificacoes" on public.notificacoes;
drop policy if exists "atualiza suas notificacoes" on public.notificacoes;
drop policy if exists "gerencia sua subscription" on public.push_subscriptions;
drop policy if exists "colaboradores autenticados leem equipe" on public.colaboradores;
drop policy if exists "autenticados leem tarefas" on public.tarefas;
drop policy if exists "autenticados leem comentarios" on public.comentarios;
drop policy if exists "usuario le notificacoes" on public.notificacoes;
drop policy if exists "usuario le subscriptions" on public.push_subscriptions;

create policy "colaboradores autenticados leem equipe"
on public.colaboradores
for select
to authenticated
using (true);

create policy "autenticados leem tarefas"
on public.tarefas
for select
to authenticated
using (
  arquivada_em is null
  or public.sou_gestor()
);

create policy "autenticados leem comentarios"
on public.comentarios
for select
to authenticated
using (
  exists (
    select 1
    from public.tarefas t
    where t.id = tarefa_id
      and (t.arquivada_em is null or public.sou_gestor())
  )
);

create policy "usuario le notificacoes"
on public.notificacoes
for select
to authenticated
using (colaborador_id = public.meu_colaborador_id());

create policy "usuario le subscriptions"
on public.push_subscriptions
for select
to authenticated
using (colaborador_id = public.meu_colaborador_id());

-- ============================================================
-- PERMISSÕES
-- ============================================================

revoke all privileges on table public.colaboradores from anon, authenticated;
revoke all privileges on table public.tarefas from anon, authenticated;
revoke all privileges on table public.comentarios from anon, authenticated;
revoke all privileges on table public.notificacoes from anon, authenticated;
revoke all privileges on table public.push_subscriptions from anon, authenticated;

grant select (id, nome, foto_url, cargo, role, ativo, perfil_configurado, criado_em, atualizado_em)
  on table public.colaboradores to authenticated;
grant select on table public.tarefas to authenticated;
grant select on table public.comentarios to authenticated;
grant select on table public.notificacoes to authenticated;
grant select on table public.push_subscriptions to authenticated;

grant usage on type public.status_tarefa to authenticated;
grant usage on type public.prioridade_tarefa to authenticated;
grant usage on type public.tipo_notificacao to authenticated;
grant usage on type public.role_colaborador to authenticated;

-- Funções auxiliares não devem ficar abertas ao papel anônimo.
revoke all on function public.meu_colaborador_id() from public, anon;
revoke all on function public.sou_gestor() from public, anon;
revoke all on function public.garantir_meu_perfil() from public, anon;
revoke all on function public.atualizar_meu_perfil(text, text) from public, anon;
revoke all on function public.criar_tarefa(text, text, public.prioridade_tarefa, uuid, date, text[]) from public, anon;
revoke all on function public.atualizar_status(uuid, public.status_tarefa) from public, anon;
revoke all on function public.atribuir_tarefa(uuid, uuid) from public, anon;
revoke all on function public.adicionar_comentario(uuid, text) from public, anon;
revoke all on function public.arquivar_tarefa(uuid) from public, anon;
revoke all on function public.restaurar_tarefa(uuid) from public, anon;
revoke all on function public.marcar_notificacao_lida(uuid) from public, anon;
revoke all on function public.marcar_todas_notificacoes_lidas() from public, anon;
revoke all on function public.registrar_push_subscription(text, text, text) from public, anon;
revoke all on function public.remover_push_subscription(text) from public, anon;
revoke all on function public.gerar_notificacoes_prazo_proximo() from public, anon, authenticated;
revoke all on function public.handle_novo_usuario() from public, anon, authenticated;
revoke all on function public.set_atualizado_em() from public, anon, authenticated;
revoke all on function public.notificar_tarefa() from public, anon, authenticated;
revoke all on function public.notificar_comentario() from public, anon, authenticated;

grant execute on function public.meu_colaborador_id() to authenticated;
grant execute on function public.sou_gestor() to authenticated;
grant execute on function public.garantir_meu_perfil() to authenticated;
grant execute on function public.atualizar_meu_perfil(text, text) to authenticated;
grant execute on function public.criar_tarefa(text, text, public.prioridade_tarefa, uuid, date, text[]) to authenticated;
grant execute on function public.atualizar_status(uuid, public.status_tarefa) to authenticated;
grant execute on function public.atribuir_tarefa(uuid, uuid) to authenticated;
grant execute on function public.adicionar_comentario(uuid, text) to authenticated;
grant execute on function public.arquivar_tarefa(uuid) to authenticated;
grant execute on function public.restaurar_tarefa(uuid) to authenticated;
grant execute on function public.marcar_notificacao_lida(uuid) to authenticated;
grant execute on function public.marcar_todas_notificacoes_lidas() to authenticated;
grant execute on function public.registrar_push_subscription(text, text, text) to authenticated;
grant execute on function public.remover_push_subscription(text) to authenticated;

-- ============================================================
-- REALTIME
-- ============================================================

alter table public.tarefas replica identity full;
alter table public.comentarios replica identity full;
alter table public.notificacoes replica identity full;

do $$
declare
  v_tabela text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_tabela in array array['tarefas', 'comentarios', 'notificacoes']
    loop
      if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_tabela
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_tabela);
      end if;
    end loop;
  end if;
end
$$;

-- ============================================================
-- CONFIGURAÇÃO INICIAL
-- ============================================================
-- 1. Crie os usuários do Marketing em Authentication > Users.
-- 2. Cada usuário ganhará um perfil automaticamente no primeiro login.
-- 3. Promova os gestores pelo e-mail, depois que eles tiverem entrado:
--
-- update public.colaboradores c
-- set role = 'gestor'::public.role_colaborador
-- from auth.users u
-- where c.auth_user_id = u.id
--   and u.email in ('gestor1@pmg.com.br', 'gestor2@pmg.com.br');
--
-- 4. Os avatares personalizados podem ser adicionados posteriormente:
--
-- update public.colaboradores
-- set foto_url = '/avatares/nome-do-colaborador.png'
-- where auth_user_id = 'UUID-DO-USUARIO';
-- ============================================================
