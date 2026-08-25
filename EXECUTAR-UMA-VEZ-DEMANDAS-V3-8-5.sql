-- ============================================================
-- PMG CONNECT | DEMANDAS V3.8.5 | INSTALADOR CONSOLIDADO
-- EXECUTE ESTE ARQUIVO UMA ÚNICA VEZ NO SQL EDITOR DO SUPABASE.
--
-- Substitui a cadeia confusa de SQL 09/10/11/13/14/15/16 para o
-- frontend atual. Não apaga tarefas, comentários ou histórico.
-- É idempotente e pode ser reaplicado em caso de interrupção.
-- ============================================================


-- ==================== CORE V3.8.5 ====================
-- ============================================================
-- PMG CONNECT | DEMANDAS V3.8.5
-- CORE DE COMPATIBILIDADE
-- Recorrencias + multiplos responsaveis + modos de responsabilidade
-- + alteracao de urgencia.
--
-- Objetivo: tornar o pacote atual autossuficiente. Versoes anteriores do
-- frontend referenciavam migracoes 09/10/11/V3.6.2 que nao estavam no ZIP.
-- Este arquivo recompõe essas estruturas de forma idempotente.
-- ============================================================

create extension if not exists pgcrypto;

begin;

-- ------------------------------------------------------------
-- COLUNAS DE COMPATIBILIDADE NAS TAREFAS
-- ------------------------------------------------------------
alter table public.tarefas add column if not exists recorrencia_id uuid;
alter table public.tarefas add column if not exists recorrencia_data date;
alter table public.tarefas add column if not exists modo_responsabilidade text not null default 'compartilhada';

update public.tarefas
set modo_responsabilidade = 'compartilhada'
where modo_responsabilidade is null
   or modo_responsabilidade not in ('compartilhada', 'primeiro_cumprir');

alter table public.tarefas drop constraint if exists tarefas_modo_responsabilidade_check;
alter table public.tarefas add constraint tarefas_modo_responsabilidade_check
  check (modo_responsabilidade in ('compartilhada', 'primeiro_cumprir'));

create index if not exists idx_tarefas_recorrencia_id
  on public.tarefas(recorrencia_id)
  where recorrencia_id is not null;
create index if not exists idx_tarefas_recorrencia_data
  on public.tarefas(recorrencia_data)
  where recorrencia_data is not null;

-- ------------------------------------------------------------
-- SERIES RECORRENTES
-- ------------------------------------------------------------
create table if not exists public.demandas_recorrentes (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descricao text,
  prioridade public.prioridade_tarefa not null default 'media',
  responsavel_id uuid references public.colaboradores(id) on delete set null,
  criado_por uuid references public.colaboradores(id) on delete set null,
  tags text[] not null default '{}'::text[],
  tamanho text not null default 'media',
  estimativa_horas numeric(8,2),
  alerta_para_todos boolean not null default false,
  projeto text,
  checklist jsonb not null default '[]'::jsonb,
  dependencias uuid[] not null default '{}'::uuid[],
  frequencia text not null default 'dias_uteis',
  dias_semana integer[] not null default '{}'::integer[],
  data_inicio date not null default current_date,
  data_fim date,
  horario_prazo time without time zone not null default '17:00',
  horario_alerta time without time zone not null default '09:00',
  alerta_diario boolean not null default true,
  ativa boolean not null default true,
  encerrada_em timestamptz,
  modo_responsabilidade text not null default 'compartilhada',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Compatibilidade com tabelas de recorrencia que possam ter sido criadas
-- por uma versao anterior fora deste ZIP.
alter table public.demandas_recorrentes add column if not exists titulo text;
alter table public.demandas_recorrentes add column if not exists descricao text;
alter table public.demandas_recorrentes add column if not exists prioridade public.prioridade_tarefa not null default 'media';
alter table public.demandas_recorrentes add column if not exists responsavel_id uuid references public.colaboradores(id) on delete set null;
alter table public.demandas_recorrentes add column if not exists criado_por uuid references public.colaboradores(id) on delete set null;
alter table public.demandas_recorrentes add column if not exists tags text[] not null default '{}'::text[];
alter table public.demandas_recorrentes add column if not exists tamanho text not null default 'media';
alter table public.demandas_recorrentes add column if not exists estimativa_horas numeric(8,2);
alter table public.demandas_recorrentes add column if not exists alerta_para_todos boolean not null default false;
alter table public.demandas_recorrentes add column if not exists projeto text;
alter table public.demandas_recorrentes add column if not exists checklist jsonb not null default '[]'::jsonb;
alter table public.demandas_recorrentes add column if not exists dependencias uuid[] not null default '{}'::uuid[];
alter table public.demandas_recorrentes add column if not exists frequencia text not null default 'dias_uteis';
alter table public.demandas_recorrentes add column if not exists dias_semana integer[] not null default '{}'::integer[];
alter table public.demandas_recorrentes add column if not exists data_inicio date not null default current_date;
alter table public.demandas_recorrentes add column if not exists data_fim date;
alter table public.demandas_recorrentes add column if not exists horario_prazo time without time zone not null default '17:00';
alter table public.demandas_recorrentes add column if not exists horario_alerta time without time zone not null default '09:00';
alter table public.demandas_recorrentes add column if not exists alerta_diario boolean not null default true;
alter table public.demandas_recorrentes add column if not exists ativa boolean not null default true;
alter table public.demandas_recorrentes add column if not exists encerrada_em timestamptz;
alter table public.demandas_recorrentes add column if not exists modo_responsabilidade text not null default 'compartilhada';
alter table public.demandas_recorrentes add column if not exists criado_em timestamptz not null default now();
alter table public.demandas_recorrentes add column if not exists atualizado_em timestamptz not null default now();

update public.demandas_recorrentes
set modo_responsabilidade = 'compartilhada'
where modo_responsabilidade is null
   or modo_responsabilidade not in ('compartilhada', 'primeiro_cumprir');

alter table public.demandas_recorrentes drop constraint if exists demandas_recorrentes_frequencia_check;
alter table public.demandas_recorrentes add constraint demandas_recorrentes_frequencia_check
  check (frequencia in ('diaria','dias_uteis','semanal','personalizada','mensal'));
alter table public.demandas_recorrentes drop constraint if exists demandas_recorrentes_modo_check;
alter table public.demandas_recorrentes add constraint demandas_recorrentes_modo_check
  check (modo_responsabilidade in ('compartilhada', 'primeiro_cumprir'));
alter table public.demandas_recorrentes drop constraint if exists demandas_recorrentes_periodo_check;
alter table public.demandas_recorrentes add constraint demandas_recorrentes_periodo_check
  check (data_fim is null or data_fim >= data_inicio);
alter table public.demandas_recorrentes drop constraint if exists demandas_recorrentes_checklist_array;
alter table public.demandas_recorrentes add constraint demandas_recorrentes_checklist_array
  check (jsonb_typeof(checklist) = 'array');

create index if not exists idx_demandas_recorrentes_ativas
  on public.demandas_recorrentes(ativa, data_inicio, data_fim)
  where encerrada_em is null;
create index if not exists idx_demandas_recorrentes_responsavel
  on public.demandas_recorrentes(responsavel_id);

-- FK de tarefas para recorrencia. Adicionada depois da tabela para ser
-- compatível com instalações onde a coluna já existia sem constraint.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tarefas'::regclass
      and conname = 'tarefas_recorrencia_id_fkey'
  ) then
    alter table public.tarefas
      add constraint tarefas_recorrencia_id_fkey
      foreign key (recorrencia_id) references public.demandas_recorrentes(id)
      on delete set null;
  end if;
end
$$;

create table if not exists public.demandas_recorrentes_ocorrencias (
  id uuid primary key default gen_random_uuid(),
  recorrencia_id uuid references public.demandas_recorrentes(id) on delete cascade not null,
  data_referencia date not null,
  tarefa_id uuid references public.tarefas(id) on delete set null,
  estado text not null default 'gerada',
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (recorrencia_id, data_referencia)
);

alter table public.demandas_recorrentes_ocorrencias add column if not exists recorrencia_id uuid references public.demandas_recorrentes(id) on delete cascade;
alter table public.demandas_recorrentes_ocorrencias add column if not exists data_referencia date;
alter table public.demandas_recorrentes_ocorrencias add column if not exists tarefa_id uuid references public.tarefas(id) on delete set null;
alter table public.demandas_recorrentes_ocorrencias add column if not exists estado text not null default 'gerada';
alter table public.demandas_recorrentes_ocorrencias add column if not exists criado_em timestamptz not null default now();
alter table public.demandas_recorrentes_ocorrencias add column if not exists atualizado_em timestamptz not null default now();

alter table public.demandas_recorrentes_ocorrencias drop constraint if exists demandas_recorrentes_ocorrencias_estado_check;
alter table public.demandas_recorrentes_ocorrencias add constraint demandas_recorrentes_ocorrencias_estado_check
  check (estado in ('gerada','pulada','nao_realizada'));
create unique index if not exists idx_recorrencia_ocorrencia_unica
  on public.demandas_recorrentes_ocorrencias(recorrencia_id, data_referencia);
create index if not exists idx_recorrencia_ocorrencias_tarefa
  on public.demandas_recorrentes_ocorrencias(tarefa_id)
  where tarefa_id is not null;

-- ------------------------------------------------------------
-- MULTIPLOS RESPONSAVEIS
-- ------------------------------------------------------------
create table if not exists public.tarefa_responsaveis (
  tarefa_id uuid references public.tarefas(id) on delete cascade not null,
  colaborador_id uuid references public.colaboradores(id) on delete cascade not null,
  principal boolean not null default false,
  adicionado_em timestamptz not null default now(),
  primary key (tarefa_id, colaborador_id)
);

create table if not exists public.demanda_recorrente_responsaveis (
  recorrencia_id uuid references public.demandas_recorrentes(id) on delete cascade not null,
  colaborador_id uuid references public.colaboradores(id) on delete cascade not null,
  principal boolean not null default false,
  adicionado_em timestamptz not null default now(),
  primary key (recorrencia_id, colaborador_id)
);

create index if not exists idx_tarefa_responsaveis_colaborador
  on public.tarefa_responsaveis(colaborador_id, tarefa_id);
create index if not exists idx_recorrencia_responsaveis_colaborador
  on public.demanda_recorrente_responsaveis(colaborador_id, recorrencia_id);

-- Backfill das responsabilidades simples existentes.
insert into public.tarefa_responsaveis(tarefa_id, colaborador_id, principal)
select t.id, t.responsavel_id, true
from public.tarefas t
where t.responsavel_id is not null
on conflict (tarefa_id, colaborador_id) do update
set principal = excluded.principal;

insert into public.demanda_recorrente_responsaveis(recorrencia_id, colaborador_id, principal)
select r.id, r.responsavel_id, true
from public.demandas_recorrentes r
where r.responsavel_id is not null
on conflict (recorrencia_id, colaborador_id) do update
set principal = excluded.principal;

-- ------------------------------------------------------------
-- RLS: frontend precisa ler as estruturas; escritas passam por RPC.
-- ------------------------------------------------------------
alter table public.demandas_recorrentes enable row level security;
alter table public.demandas_recorrentes_ocorrencias enable row level security;
alter table public.tarefa_responsaveis enable row level security;
alter table public.demanda_recorrente_responsaveis enable row level security;

revoke all on table public.demandas_recorrentes from anon;
revoke all on table public.demandas_recorrentes_ocorrencias from anon;
revoke all on table public.tarefa_responsaveis from anon;
revoke all on table public.demanda_recorrente_responsaveis from anon;
grant select on table public.demandas_recorrentes to authenticated;
grant select on table public.demandas_recorrentes_ocorrencias to authenticated;
grant select on table public.tarefa_responsaveis to authenticated;
grant select on table public.demanda_recorrente_responsaveis to authenticated;

drop policy if exists demandas_recorrentes_select_pmg on public.demandas_recorrentes;
create policy demandas_recorrentes_select_pmg on public.demandas_recorrentes
  for select to authenticated
  using (public.meu_colaborador_id() is not null);

drop policy if exists recorrencias_ocorrencias_select_pmg on public.demandas_recorrentes_ocorrencias;
create policy recorrencias_ocorrencias_select_pmg on public.demandas_recorrentes_ocorrencias
  for select to authenticated
  using (public.meu_colaborador_id() is not null);

drop policy if exists tarefa_responsaveis_select_pmg on public.tarefa_responsaveis;
create policy tarefa_responsaveis_select_pmg on public.tarefa_responsaveis
  for select to authenticated
  using (public.meu_colaborador_id() is not null);

drop policy if exists recorrencia_responsaveis_select_pmg on public.demanda_recorrente_responsaveis;
create policy recorrencia_responsaveis_select_pmg on public.demanda_recorrente_responsaveis
  for select to authenticated
  using (public.meu_colaborador_id() is not null);

-- ------------------------------------------------------------
-- HELPERS
-- ------------------------------------------------------------
create or replace function public.recorrencia_aplica_em_v385(
  p_frequencia text,
  p_dias_semana integer[],
  p_data_inicio date,
  p_data date
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_iso integer;
  v_start_day integer;
  v_last_day integer;
begin
  if p_data is null or p_data_inicio is null or p_data < p_data_inicio then return false; end if;
  v_iso := extract(isodow from p_data)::integer;

  case p_frequencia
    when 'diaria' then return true;
    when 'dias_uteis' then return v_iso between 1 and 5;
    when 'personalizada' then return v_iso = any(coalesce(p_dias_semana, '{}'::integer[]));
    when 'semanal' then
      if cardinality(coalesce(p_dias_semana, '{}'::integer[])) > 0 then
        return v_iso = any(p_dias_semana);
      end if;
      return mod((p_data - p_data_inicio), 7) = 0;
    when 'mensal' then
      v_start_day := extract(day from p_data_inicio)::integer;
      v_last_day := extract(day from (date_trunc('month', p_data)::date + interval '1 month - 1 day'))::integer;
      return extract(day from p_data)::integer = least(v_start_day, v_last_day);
    else return false;
  end case;
end;
$$;

-- ------------------------------------------------------------
-- MULTIPLOS RESPONSAVEIS: RPCs
-- ------------------------------------------------------------
drop function if exists public.definir_responsaveis_tarefa_v1(uuid, uuid[]);
create function public.definir_responsaveis_tarefa_v1(
  p_tarefa_id uuid,
  p_responsaveis uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.definir_responsaveis_tarefa_modo_v1(p_tarefa_id, p_responsaveis, 'compartilhada');
end;
$$;

drop function if exists public.definir_responsaveis_tarefa_modo_v1(uuid, uuid[], text);
create function public.definir_responsaveis_tarefa_modo_v1(
  p_tarefa_id uuid,
  p_responsaveis uuid[],
  p_modo text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_idx integer := 0;
  v_status public.status_tarefa;
  v_atual uuid;
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem alterar responsáveis'; end if;
  if p_modo not in ('compartilhada','primeiro_cumprir') then raise exception 'Modo de responsabilidade inválido'; end if;

  select t.status, t.responsavel_id into v_status, v_atual
  from public.tarefas t where t.id = p_tarefa_id and t.arquivada_em is null for update;
  if not found then raise exception 'Demanda não encontrada ou arquivada'; end if;

  select coalesce(array_agg(x.id order by x.ord), '{}'::uuid[])
  into v_ids
  from (
    select distinct on (u.id) u.id, u.ord
    from unnest(coalesce(p_responsaveis, '{}'::uuid[])) with ordinality as u(id, ord)
    join public.colaboradores c on c.id = u.id and c.ativo = true
    where u.id is not null
    order by u.id, u.ord
  ) x;

  if p_modo = 'primeiro_cumprir' and cardinality(v_ids) < 2 then
    raise exception 'Primeiro a cumprir exige pelo menos duas pessoas candidatas';
  end if;

  delete from public.tarefa_responsaveis where tarefa_id = p_tarefa_id;
  foreach v_id in array v_ids loop
    v_idx := v_idx + 1;
    insert into public.tarefa_responsaveis(tarefa_id, colaborador_id, principal)
    values(p_tarefa_id, v_id, v_idx = 1);
  end loop;

  update public.tarefas
  set modo_responsabilidade = p_modo,
      responsavel_id = case
        when p_modo = 'primeiro_cumprir' and v_status = 'nova'::public.status_tarefa then null
        when p_modo = 'primeiro_cumprir' and v_atual = any(v_ids) then v_atual
        when cardinality(v_ids) > 0 then v_ids[1]
        else null
      end
  where id = p_tarefa_id;
end;
$$;

drop function if exists public.definir_responsaveis_recorrencia_v1(uuid, uuid[], boolean);
create function public.definir_responsaveis_recorrencia_v1(
  p_recorrencia_id uuid,
  p_responsaveis uuid[],
  p_aplicar_ocorrencias boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.definir_responsaveis_recorrencia_modo_v1(
    p_recorrencia_id, p_responsaveis, 'compartilhada', p_aplicar_ocorrencias
  );
end;
$$;

drop function if exists public.definir_responsaveis_recorrencia_modo_v1(uuid, uuid[], text, boolean);
create function public.definir_responsaveis_recorrencia_modo_v1(
  p_recorrencia_id uuid,
  p_responsaveis uuid[],
  p_modo text,
  p_aplicar_ocorrencias boolean default true
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_id uuid;
  v_idx integer := 0;
  v_task uuid;
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem alterar responsáveis da recorrência'; end if;
  if p_modo not in ('compartilhada','primeiro_cumprir') then raise exception 'Modo de responsabilidade inválido'; end if;
  if not exists (select 1 from public.demandas_recorrentes r where r.id = p_recorrencia_id) then
    raise exception 'Recorrência não encontrada';
  end if;

  select coalesce(array_agg(x.id order by x.ord), '{}'::uuid[])
  into v_ids
  from (
    select distinct on (u.id) u.id, u.ord
    from unnest(coalesce(p_responsaveis, '{}'::uuid[])) with ordinality as u(id, ord)
    join public.colaboradores c on c.id = u.id and c.ativo = true
    where u.id is not null
    order by u.id, u.ord
  ) x;

  if p_modo = 'primeiro_cumprir' and cardinality(v_ids) < 2 then
    raise exception 'Primeiro a cumprir exige pelo menos duas pessoas candidatas';
  end if;

  delete from public.demanda_recorrente_responsaveis where recorrencia_id = p_recorrencia_id;
  foreach v_id in array v_ids loop
    v_idx := v_idx + 1;
    insert into public.demanda_recorrente_responsaveis(recorrencia_id, colaborador_id, principal)
    values(p_recorrencia_id, v_id, v_idx = 1);
  end loop;

  update public.demandas_recorrentes
  set modo_responsabilidade = p_modo,
      responsavel_id = case when p_modo = 'primeiro_cumprir' then null when cardinality(v_ids) > 0 then v_ids[1] else null end,
      atualizado_em = now()
  where id = p_recorrencia_id;

  if coalesce(p_aplicar_ocorrencias, true) then
    for v_task in
      select t.id
      from public.tarefas t
      where t.recorrencia_id = p_recorrencia_id
        and t.arquivada_em is null
        and t.status in ('nova'::public.status_tarefa, 'andamento'::public.status_tarefa)
    loop
      perform public.definir_responsaveis_tarefa_modo_v1(v_task, v_ids, p_modo);
    end loop;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- PROCESSADOR DE RECORRENCIAS
-- ------------------------------------------------------------
drop function if exists public.processar_recorrencias_demanda();
create function public.processar_recorrencias_demanda()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := public.meu_colaborador_id();
  v_series record;
  v_data date;
  v_inicio date;
  v_fim date;
  v_task_id uuid;
  v_due timestamptz;
  v_remind timestamptz;
  v_primary uuid;
  v_created integer := 0;
  v_resp record;
  v_dep uuid;
  v_creator uuid;
begin
  if v_me is null then return 0; end if;

  for v_series in
    select r.* from public.demandas_recorrentes r
    where r.ativa = true and r.encerrada_em is null
      and r.data_inicio <= current_date
      and (r.data_fim is null or r.data_fim >= least(r.data_inicio, current_date))
  loop
    -- Limita a recomposição a 62 dias para não transformar uma abertura de
    -- página em escavação arqueológica de calendário.
    v_inicio := greatest(v_series.data_inicio, current_date - 62);
    v_fim := least(coalesce(v_series.data_fim, current_date), current_date);
    if v_fim < v_inicio then continue; end if;

    for v_data in select generate_series(v_inicio, v_fim, interval '1 day')::date loop
      if not public.recorrencia_aplica_em_v385(v_series.frequencia, v_series.dias_semana, v_series.data_inicio, v_data) then
        continue;
      end if;

      if exists (
        select 1 from public.demandas_recorrentes_ocorrencias o
        where o.recorrencia_id = v_series.id and o.data_referencia = v_data
      ) then
        continue;
      end if;

      if v_data < current_date then
        insert into public.demandas_recorrentes_ocorrencias(recorrencia_id, data_referencia, estado)
        values(v_series.id, v_data, 'nao_realizada')
        on conflict (recorrencia_id, data_referencia) do nothing;
        v_created := v_created + 1;
        continue;
      end if;

      select rr.colaborador_id into v_primary
      from public.demanda_recorrente_responsaveis rr
      where rr.recorrencia_id = v_series.id
      order by rr.principal desc, rr.adicionado_em, rr.colaborador_id
      limit 1;
      v_primary := coalesce(v_primary, v_series.responsavel_id);
      if v_series.modo_responsabilidade = 'primeiro_cumprir' then v_primary := null; end if;

      v_due := ((v_data::text || ' ' || coalesce(v_series.horario_prazo, '17:00'::time)::text)::timestamp at time zone 'America/Sao_Paulo');
      v_remind := case when v_series.alerta_diario
        then ((v_data::text || ' ' || coalesce(v_series.horario_alerta, '09:00'::time)::text)::timestamp at time zone 'America/Sao_Paulo')
        else null end;
      v_creator := coalesce(v_series.criado_por, v_me);

      insert into public.tarefas(
        titulo, descricao, status, prioridade, responsavel_id, criado_por,
        prazo, tags, prazo_em, lembrar_em, tamanho, estimativa_horas,
        alerta_para_todos, projeto, checklist, recorrencia_id,
        recorrencia_data, modo_responsabilidade
      ) values (
        v_series.titulo, v_series.descricao, 'nova'::public.status_tarefa,
        v_series.prioridade, v_primary, v_creator,
        (v_due at time zone 'America/Sao_Paulo')::date,
        coalesce(v_series.tags, '{}'::text[]), v_due, v_remind,
        coalesce(v_series.tamanho, 'media'), v_series.estimativa_horas,
        coalesce(v_series.alerta_para_todos, false), v_series.projeto,
        coalesce(v_series.checklist, '[]'::jsonb), v_series.id, v_data,
        coalesce(v_series.modo_responsabilidade, 'compartilhada')
      ) returning id into v_task_id;

      for v_resp in
        select rr.colaborador_id, rr.principal
        from public.demanda_recorrente_responsaveis rr
        where rr.recorrencia_id = v_series.id
        order by rr.principal desc, rr.adicionado_em
      loop
        insert into public.tarefa_responsaveis(tarefa_id, colaborador_id, principal)
        values(v_task_id, v_resp.colaborador_id, v_resp.principal)
        on conflict (tarefa_id, colaborador_id) do update set principal = excluded.principal;
      end loop;
      if not exists (select 1 from public.tarefa_responsaveis tr where tr.tarefa_id = v_task_id)
         and v_primary is not null then
        insert into public.tarefa_responsaveis(tarefa_id, colaborador_id, principal)
        values(v_task_id, v_primary, true)
        on conflict do nothing;
      end if;

      foreach v_dep in array coalesce(v_series.dependencias, '{}'::uuid[]) loop
        if v_dep is null then continue; end if;
        if exists (select 1 from public.tarefas d where d.id = v_dep and d.arquivada_em is null) then
          insert into public.dependencias_tarefa(tarefa_id, depende_de_tarefa_id, criado_por)
          values(v_task_id, v_dep, v_creator)
          on conflict do nothing;
        end if;
      end loop;

      insert into public.demandas_recorrentes_ocorrencias(recorrencia_id, data_referencia, tarefa_id, estado)
      values(v_series.id, v_data, v_task_id, 'gerada')
      on conflict (recorrencia_id, data_referencia) do nothing;

      v_created := v_created + 1;
    end loop;
  end loop;

  return v_created;
end;
$$;

-- ------------------------------------------------------------
-- CRUD DE RECORRENCIA
-- ------------------------------------------------------------
drop function if exists public.criar_demanda_recorrente_v1(text,text,public.prioridade_tarefa,uuid,text[],text,numeric,boolean,text,jsonb,uuid[],text,integer[],date,date,time,time,boolean);
create function public.criar_demanda_recorrente_v1(
  p_titulo text,
  p_descricao text,
  p_prioridade public.prioridade_tarefa,
  p_responsavel_id uuid,
  p_tags text[],
  p_tamanho text,
  p_estimativa_horas numeric,
  p_alerta_para_todos boolean,
  p_projeto text,
  p_checklist jsonb,
  p_dependencias uuid[],
  p_frequencia text,
  p_dias_semana integer[],
  p_data_inicio date,
  p_data_fim date,
  p_horario_prazo time,
  p_horario_alerta time,
  p_alerta_diario boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_me uuid := public.meu_colaborador_id();
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem criar recorrências'; end if;
  if p_titulo is null or length(trim(p_titulo)) = 0 then raise exception 'Informe o título'; end if;
  if p_frequencia not in ('diaria','dias_uteis','semanal','personalizada','mensal') then raise exception 'Frequência inválida'; end if;
  if p_data_inicio is null then raise exception 'Informe a data inicial'; end if;
  if p_data_fim is not null and p_data_fim < p_data_inicio then raise exception 'A data final não pode ser anterior ao início'; end if;
  if jsonb_typeof(coalesce(p_checklist, '[]'::jsonb)) <> 'array' then raise exception 'Checklist inválido'; end if;
  if p_responsavel_id is not null and not exists(select 1 from public.colaboradores c where c.id=p_responsavel_id and c.ativo) then raise exception 'Responsável inválido'; end if;

  insert into public.demandas_recorrentes(
    titulo, descricao, prioridade, responsavel_id, criado_por, tags, tamanho,
    estimativa_horas, alerta_para_todos, projeto, checklist, dependencias,
    frequencia, dias_semana, data_inicio, data_fim, horario_prazo,
    horario_alerta, alerta_diario, ativa, modo_responsabilidade
  ) values (
    trim(p_titulo), nullif(trim(p_descricao), ''), coalesce(p_prioridade,'media'::public.prioridade_tarefa),
    p_responsavel_id, v_me, coalesce(p_tags,'{}'::text[]), coalesce(p_tamanho,'media'),
    p_estimativa_horas, coalesce(p_alerta_para_todos,false), nullif(trim(p_projeto),''),
    coalesce(p_checklist,'[]'::jsonb), coalesce(p_dependencias,'{}'::uuid[]), p_frequencia,
    coalesce(p_dias_semana,'{}'::integer[]), p_data_inicio, p_data_fim,
    coalesce(p_horario_prazo,'17:00'::time), coalesce(p_horario_alerta,'09:00'::time),
    coalesce(p_alerta_diario,true), true, 'compartilhada'
  ) returning id into v_id;

  if p_responsavel_id is not null then
    insert into public.demanda_recorrente_responsaveis(recorrencia_id,colaborador_id,principal)
    values(v_id,p_responsavel_id,true) on conflict do nothing;
  end if;

  perform public.processar_recorrencias_demanda();
  return v_id;
end;
$$;

drop function if exists public.editar_demanda_recorrente_v1(uuid,text,text,public.prioridade_tarefa,uuid,text[],text,numeric,text,jsonb,text,integer[],date,date,time,time,boolean);
create function public.editar_demanda_recorrente_v1(
  p_id uuid,
  p_titulo text,
  p_descricao text,
  p_prioridade public.prioridade_tarefa,
  p_responsavel_id uuid,
  p_tags text[],
  p_tamanho text,
  p_estimativa_horas numeric,
  p_projeto text,
  p_checklist jsonb,
  p_frequencia text,
  p_dias_semana integer[],
  p_data_inicio date,
  p_data_fim date,
  p_horario_prazo time,
  p_horario_alerta time,
  p_alerta_diario boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem editar recorrências'; end if;
  if p_titulo is null or length(trim(p_titulo)) = 0 then raise exception 'Informe o título'; end if;
  if p_frequencia not in ('diaria','dias_uteis','semanal','personalizada','mensal') then raise exception 'Frequência inválida'; end if;
  if p_data_inicio is null then raise exception 'Informe a data inicial'; end if;
  if p_data_fim is not null and p_data_fim < p_data_inicio then raise exception 'Período inválido'; end if;
  if jsonb_typeof(coalesce(p_checklist, '[]'::jsonb)) <> 'array' then raise exception 'Checklist inválido'; end if;

  update public.demandas_recorrentes
  set titulo=trim(p_titulo), descricao=nullif(trim(p_descricao),''),
      prioridade=coalesce(p_prioridade,'media'::public.prioridade_tarefa),
      responsavel_id=p_responsavel_id, tags=coalesce(p_tags,'{}'::text[]),
      tamanho=coalesce(p_tamanho,'media'), estimativa_horas=p_estimativa_horas,
      projeto=nullif(trim(p_projeto),''), checklist=coalesce(p_checklist,'[]'::jsonb),
      frequencia=p_frequencia, dias_semana=coalesce(p_dias_semana,'{}'::integer[]),
      data_inicio=p_data_inicio, data_fim=p_data_fim,
      horario_prazo=coalesce(p_horario_prazo,'17:00'::time),
      horario_alerta=coalesce(p_horario_alerta,'09:00'::time),
      alerta_diario=coalesce(p_alerta_diario,true), atualizado_em=now()
  where id=p_id;
  if not found then raise exception 'Recorrência não encontrada'; end if;
end;
$$;

drop function if exists public.converter_tarefa_em_recorrente_v1(uuid,text,integer[],date,date,time,time,boolean);
create function public.converter_tarefa_em_recorrente_v1(
  p_tarefa_id uuid,
  p_frequencia text,
  p_dias_semana integer[],
  p_data_inicio date,
  p_data_fim date,
  p_horario_prazo time,
  p_horario_alerta time,
  p_alerta_diario boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_task public.tarefas%rowtype;
  v_id uuid;
  v_deps uuid[];
  v_resp record;
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem converter demandas em recorrentes'; end if;
  select * into v_task from public.tarefas where id=p_tarefa_id and arquivada_em is null for update;
  if not found then raise exception 'Demanda não encontrada ou arquivada'; end if;
  if v_task.recorrencia_id is not null then return v_task.recorrencia_id; end if;

  select coalesce(array_agg(d.depende_de_tarefa_id), '{}'::uuid[]) into v_deps
  from public.dependencias_tarefa d where d.tarefa_id=p_tarefa_id;

  insert into public.demandas_recorrentes(
    titulo,descricao,prioridade,responsavel_id,criado_por,tags,tamanho,estimativa_horas,
    alerta_para_todos,projeto,checklist,dependencias,frequencia,dias_semana,data_inicio,
    data_fim,horario_prazo,horario_alerta,alerta_diario,ativa,modo_responsabilidade
  ) values (
    v_task.titulo,v_task.descricao,v_task.prioridade,v_task.responsavel_id,v_task.criado_por,
    coalesce(v_task.tags,'{}'::text[]),coalesce(v_task.tamanho,'media'),v_task.estimativa_horas,
    coalesce(v_task.alerta_para_todos,false),v_task.projeto,coalesce(v_task.checklist,'[]'::jsonb),
    coalesce(v_deps,'{}'::uuid[]),p_frequencia,coalesce(p_dias_semana,'{}'::integer[]),
    p_data_inicio,p_data_fim,coalesce(p_horario_prazo,'17:00'::time),
    coalesce(p_horario_alerta,'09:00'::time),coalesce(p_alerta_diario,true),true,
    coalesce(v_task.modo_responsabilidade,'compartilhada')
  ) returning id into v_id;

  for v_resp in select * from public.tarefa_responsaveis where tarefa_id=p_tarefa_id loop
    insert into public.demanda_recorrente_responsaveis(recorrencia_id,colaborador_id,principal)
    values(v_id,v_resp.colaborador_id,v_resp.principal) on conflict do nothing;
  end loop;
  if not exists(select 1 from public.demanda_recorrente_responsaveis where recorrencia_id=v_id)
     and v_task.responsavel_id is not null then
    insert into public.demanda_recorrente_responsaveis(recorrencia_id,colaborador_id,principal)
    values(v_id,v_task.responsavel_id,true) on conflict do nothing;
  end if;

  update public.tarefas
  set recorrencia_id=v_id, recorrencia_data=p_data_inicio
  where id=p_tarefa_id;
  insert into public.demandas_recorrentes_ocorrencias(recorrencia_id,data_referencia,tarefa_id,estado)
  values(v_id,p_data_inicio,p_tarefa_id,'gerada')
  on conflict (recorrencia_id,data_referencia) do update set tarefa_id=excluded.tarefa_id, estado='gerada', atualizado_em=now();

  return v_id;
end;
$$;

drop function if exists public.alternar_demanda_recorrente(uuid, boolean);
create function public.alternar_demanda_recorrente(p_id uuid, p_ativa boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem pausar ou retomar recorrências'; end if;
  update public.demandas_recorrentes
  set ativa=coalesce(p_ativa,false), atualizado_em=now()
  where id=p_id and encerrada_em is null;
  if not found then raise exception 'Recorrência não encontrada ou já encerrada'; end if;
end;
$$;

drop function if exists public.encerrar_demanda_recorrente(uuid);
create function public.encerrar_demanda_recorrente(p_id uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem encerrar recorrências'; end if;
  update public.demandas_recorrentes
  set ativa=false, encerrada_em=coalesce(encerrada_em,now()), atualizado_em=now()
  where id=p_id;
  if not found then raise exception 'Recorrência não encontrada'; end if;
end;
$$;

drop function if exists public.pular_ocorrencia_recorrente(uuid, date);
create function public.pular_ocorrencia_recorrente(p_id uuid, p_data date)
returns void language plpgsql security definer set search_path='' as $$
declare
  v_task uuid;
  v_status public.status_tarefa;
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem pular ocorrências'; end if;
  if not exists(select 1 from public.demandas_recorrentes where id=p_id) then raise exception 'Recorrência não encontrada'; end if;

  select o.tarefa_id into v_task from public.demandas_recorrentes_ocorrencias o
  where o.recorrencia_id=p_id and o.data_referencia=p_data for update;
  if v_task is not null then
    select status into v_status from public.tarefas where id=v_task;
    if v_status is distinct from 'nova'::public.status_tarefa then
      raise exception 'A ocorrência já foi iniciada e não pode ser pulada';
    end if;
    update public.tarefas set arquivada_em=now(), arquivada_por=public.meu_colaborador_id() where id=v_task;
  end if;

  insert into public.demandas_recorrentes_ocorrencias(recorrencia_id,data_referencia,tarefa_id,estado)
  values(p_id,p_data,v_task,'pulada')
  on conflict (recorrencia_id,data_referencia)
  do update set estado='pulada', atualizado_em=now();
end;
$$;

drop function if exists public.transferir_demanda_recorrente_v1(uuid,uuid,uuid,boolean,text);
create function public.transferir_demanda_recorrente_v1(
  p_id uuid,
  p_tarefa_id uuid,
  p_novo_responsavel_id uuid,
  p_aplicar_ocorrencia_atual boolean default true,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_old uuid;
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem transferir recorrências'; end if;
  if not exists(select 1 from public.colaboradores c where c.id=p_novo_responsavel_id and c.ativo) then raise exception 'Novo responsável inválido'; end if;
  select responsavel_id into v_old from public.demandas_recorrentes where id=p_id for update;
  if not found then raise exception 'Recorrência não encontrada'; end if;

  delete from public.demanda_recorrente_responsaveis where recorrencia_id=p_id;
  insert into public.demanda_recorrente_responsaveis(recorrencia_id,colaborador_id,principal)
  values(p_id,p_novo_responsavel_id,true);
  update public.demandas_recorrentes
  set responsavel_id=p_novo_responsavel_id, modo_responsabilidade='compartilhada', atualizado_em=now()
  where id=p_id;

  if coalesce(p_aplicar_ocorrencia_atual,true) and p_tarefa_id is not null then
    delete from public.tarefa_responsaveis where tarefa_id=p_tarefa_id;
    insert into public.tarefa_responsaveis(tarefa_id,colaborador_id,principal)
    values(p_tarefa_id,p_novo_responsavel_id,true) on conflict do nothing;
    update public.tarefas
    set responsavel_id=p_novo_responsavel_id, modo_responsabilidade='compartilhada', ultima_transferencia_em=now()
    where id=p_tarefa_id;
    if to_regclass('public.transferencias_tarefa') is not null then
      insert into public.transferencias_tarefa(tarefa_id,de_colaborador_id,para_colaborador_id,transferido_por,observacao)
      values(p_tarefa_id,v_old,p_novo_responsavel_id,public.meu_colaborador_id(),nullif(trim(p_observacao),''));
    end if;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- ALTERACAO RAPIDA DE URGENCIA
-- ------------------------------------------------------------
drop function if exists public.alterar_urgencia_tarefa_v1(uuid, public.prioridade_tarefa, boolean, boolean);
create function public.alterar_urgencia_tarefa_v1(
  p_tarefa_id uuid,
  p_prioridade public.prioridade_tarefa,
  p_alerta_para_todos boolean,
  p_aplicar_recorrencia boolean default false
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_rec uuid;
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem alterar a urgência'; end if;
  select recorrencia_id into v_rec from public.tarefas where id=p_tarefa_id and arquivada_em is null for update;
  if not found then raise exception 'Demanda não encontrada ou arquivada'; end if;

  update public.tarefas
  set prioridade=p_prioridade,
      alerta_para_todos=case when p_prioridade='imediata'::public.prioridade_tarefa then coalesce(p_alerta_para_todos,false) else false end
  where id=p_tarefa_id;

  if coalesce(p_aplicar_recorrencia,false) and v_rec is not null then
    update public.demandas_recorrentes
    set prioridade=p_prioridade,
        alerta_para_todos=case when p_prioridade='imediata'::public.prioridade_tarefa then coalesce(p_alerta_para_todos,false) else false end,
        atualizado_em=now()
    where id=v_rec;
  end if;
end;
$$;

-- ------------------------------------------------------------
-- STATUS COMPATIVEL COM MULTIPLOS RESPONSAVEIS / PRIMEIRO A CUMPRIR
-- ------------------------------------------------------------
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
  v_ator uuid := public.meu_colaborador_id();
  v_responsavel uuid;
  v_arquivada timestamptz;
  v_prioridade public.prioridade_tarefa;
  v_alerta boolean;
  v_modo text;
  v_gestor boolean := public.sou_gestor();
  v_assignee boolean := false;
begin
  if v_ator is null then raise exception 'Colaborador não encontrado ou inativo'; end if;
  if p_status is null then raise exception 'O status é obrigatório'; end if;

  select t.responsavel_id,t.arquivada_em,t.prioridade,coalesce(t.alerta_para_todos,false),coalesce(t.modo_responsabilidade,'compartilhada')
  into v_responsavel,v_arquivada,v_prioridade,v_alerta,v_modo
  from public.tarefas t where t.id=p_tarefa_id for update;
  if not found then raise exception 'Tarefa não encontrada'; end if;
  if v_arquivada is not null then raise exception 'Não é possível alterar uma tarefa arquivada'; end if;

  if p_status in ('andamento'::public.status_tarefa,'revisao'::public.status_tarefa)
     and public.tarefa_tem_dependencias_pendentes(p_tarefa_id) then
    raise exception 'Esta demanda está bloqueada por outra entrega. Conclua as dependências antes de avançar.';
  end if;

  v_assignee := v_responsavel = v_ator or exists(
    select 1 from public.tarefa_responsaveis tr
    where tr.tarefa_id=p_tarefa_id and tr.colaborador_id=v_ator
  );

  -- Primeiro a cumprir: o primeiro candidato que iniciar assume a demanda.
  if not v_gestor and v_modo='primeiro_cumprir' and v_responsavel is null
     and p_status='andamento'::public.status_tarefa and v_assignee then
    update public.tarefas set responsavel_id=v_ator,status='andamento'::public.status_tarefa,
      avaliacao_status='nao_solicitada' where id=p_tarefa_id;
    delete from public.tarefa_responsaveis where tarefa_id=p_tarefa_id;
    insert into public.tarefa_responsaveis(tarefa_id,colaborador_id,principal)
    values(p_tarefa_id,v_ator,true) on conflict do nothing;
    return;
  end if;

  -- Demanda imediata enviada para todos continua podendo ser assumida.
  if not v_gestor and v_responsavel is null and v_prioridade='imediata'::public.prioridade_tarefa
     and v_alerta and p_status='andamento'::public.status_tarefa then
    update public.tarefas set responsavel_id=v_ator,status='andamento'::public.status_tarefa,
      avaliacao_status='nao_solicitada' where id=p_tarefa_id;
    insert into public.tarefa_responsaveis(tarefa_id,colaborador_id,principal)
    values(p_tarefa_id,v_ator,true)
    on conflict (tarefa_id,colaborador_id) do update set principal=true;
    return;
  end if;

  if not v_gestor and not v_assignee then raise exception 'Você só pode alterar demandas atribuídas a você'; end if;
  if p_status='concluida'::public.status_tarefa then raise exception 'A conclusão precisa ser avaliada por um gestor'; end if;

  update public.tarefas
  set status=p_status,
      avaliacao_status=case when p_status='revisao'::public.status_tarefa then 'pendente' else 'nao_solicitada' end,
      avaliacao_observacao=case when p_status='revisao'::public.status_tarefa then null else avaliacao_observacao end,
      avaliado_por=case when p_status='revisao'::public.status_tarefa then null else avaliado_por end,
      avaliado_em=case when p_status='revisao'::public.status_tarefa then null else avaliado_em end,
      concluida_em=case when p_status <> 'concluida'::public.status_tarefa then null else concluida_em end
  where id=p_tarefa_id;
end;
$$;

-- ------------------------------------------------------------
-- PRIVILEGIOS
-- ------------------------------------------------------------
revoke all on function public.recorrencia_aplica_em_v385(text,integer[],date,date) from public, anon;
revoke all on function public.processar_recorrencias_demanda() from public, anon;
revoke all on function public.criar_demanda_recorrente_v1(text,text,public.prioridade_tarefa,uuid,text[],text,numeric,boolean,text,jsonb,uuid[],text,integer[],date,date,time,time,boolean) from public, anon;
revoke all on function public.editar_demanda_recorrente_v1(uuid,text,text,public.prioridade_tarefa,uuid,text[],text,numeric,text,jsonb,text,integer[],date,date,time,time,boolean) from public, anon;
revoke all on function public.converter_tarefa_em_recorrente_v1(uuid,text,integer[],date,date,time,time,boolean) from public, anon;
revoke all on function public.alternar_demanda_recorrente(uuid,boolean) from public, anon;
revoke all on function public.encerrar_demanda_recorrente(uuid) from public, anon;
revoke all on function public.pular_ocorrencia_recorrente(uuid,date) from public, anon;
revoke all on function public.transferir_demanda_recorrente_v1(uuid,uuid,uuid,boolean,text) from public, anon;
revoke all on function public.definir_responsaveis_tarefa_v1(uuid,uuid[]) from public, anon;
revoke all on function public.definir_responsaveis_tarefa_modo_v1(uuid,uuid[],text) from public, anon;
revoke all on function public.definir_responsaveis_recorrencia_v1(uuid,uuid[],boolean) from public, anon;
revoke all on function public.definir_responsaveis_recorrencia_modo_v1(uuid,uuid[],text,boolean) from public, anon;
revoke all on function public.alterar_urgencia_tarefa_v1(uuid,public.prioridade_tarefa,boolean,boolean) from public, anon;

grant execute on function public.processar_recorrencias_demanda() to authenticated;
grant execute on function public.criar_demanda_recorrente_v1(text,text,public.prioridade_tarefa,uuid,text[],text,numeric,boolean,text,jsonb,uuid[],text,integer[],date,date,time,time,boolean) to authenticated;
grant execute on function public.editar_demanda_recorrente_v1(uuid,text,text,public.prioridade_tarefa,uuid,text[],text,numeric,text,jsonb,text,integer[],date,date,time,time,boolean) to authenticated;
grant execute on function public.converter_tarefa_em_recorrente_v1(uuid,text,integer[],date,date,time,time,boolean) to authenticated;
grant execute on function public.alternar_demanda_recorrente(uuid,boolean) to authenticated;
grant execute on function public.encerrar_demanda_recorrente(uuid) to authenticated;
grant execute on function public.pular_ocorrencia_recorrente(uuid,date) to authenticated;
grant execute on function public.transferir_demanda_recorrente_v1(uuid,uuid,uuid,boolean,text) to authenticated;
grant execute on function public.definir_responsaveis_tarefa_v1(uuid,uuid[]) to authenticated;
grant execute on function public.definir_responsaveis_tarefa_modo_v1(uuid,uuid[],text) to authenticated;
grant execute on function public.definir_responsaveis_recorrencia_v1(uuid,uuid[],boolean) to authenticated;
grant execute on function public.definir_responsaveis_recorrencia_modo_v1(uuid,uuid[],text,boolean) to authenticated;
grant execute on function public.alterar_urgencia_tarefa_v1(uuid,public.prioridade_tarefa,boolean,boolean) to authenticated;

commit;

notify pgrst, 'reload schema';

-- Diagnostico do core. Todos devem ser TRUE.
select
  to_regclass('public.demandas_recorrentes') is not null as recorrencias_ok,
  to_regclass('public.demandas_recorrentes_ocorrencias') is not null as ocorrencias_ok,
  to_regclass('public.tarefa_responsaveis') is not null as tarefa_responsaveis_ok,
  to_regclass('public.demanda_recorrente_responsaveis') is not null as recorrencia_responsaveis_ok,
  to_regprocedure('public.processar_recorrencias_demanda()') is not null as processar_ok,
  to_regprocedure('public.criar_demanda_recorrente_v1(text,text,public.prioridade_tarefa,uuid,text[],text,numeric,boolean,text,jsonb,uuid[],text,integer[],date,date,time without time zone,time without time zone,boolean)') is not null as criar_recorrencia_ok,
  to_regprocedure('public.definir_responsaveis_tarefa_modo_v1(uuid,uuid[],text)') is not null as responsaveis_modo_ok,
  to_regprocedure('public.alterar_urgencia_tarefa_v1(uuid,public.prioridade_tarefa,boolean,boolean)') is not null as urgencia_ok;


-- ==================== UX V3.8.1 ====================
-- ============================================================
-- PMG CONNECT — DEMANDAS V3.8.1
-- UX operacional + autoria simplificada + menções + anexos
-- + agrupamento de recorrências com múltiplos horários por dia
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) AUTORIA DA ENTREGA
-- Regra V3.8.1:
--   1 executor  -> gestor valida e a demanda encerra imediatamente.
--   2+ executores -> todos os executores confirmam a autoria.
-- O papel (gestor/colaborador) NÃO altera esta regra.
-- ------------------------------------------------------------

create table if not exists public.tarefa_autoria_revisoes (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  gestor_id uuid not null references public.colaboradores(id) on delete restrict,
  status text not null default 'aguardando',
  observacao_gestor text,
  criado_em timestamptz not null default now(),
  finalizado_em timestamptz
);

create table if not exists public.tarefa_autoria_confirmacoes (
  id uuid primary key default gen_random_uuid(),
  revisao_id uuid not null references public.tarefa_autoria_revisoes(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  resposta text not null default 'pendente',
  observacao text,
  criado_em timestamptz not null default now(),
  respondido_em timestamptz
);

create table if not exists public.tarefa_executores (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  revisao_id uuid references public.tarefa_autoria_revisoes(id) on delete set null,
  confirmado_em timestamptz not null default now(),
  confirmado_por uuid references public.colaboradores(id) on delete set null
);

alter table public.tarefa_autoria_revisoes add column if not exists observacao_gestor text;
alter table public.tarefa_autoria_revisoes add column if not exists finalizado_em timestamptz;
alter table public.tarefa_autoria_confirmacoes add column if not exists observacao text;
alter table public.tarefa_autoria_confirmacoes add column if not exists respondido_em timestamptz;
alter table public.tarefa_executores add column if not exists revisao_id uuid references public.tarefa_autoria_revisoes(id) on delete set null;
alter table public.tarefa_executores add column if not exists confirmado_por uuid references public.colaboradores(id) on delete set null;
alter table public.tarefa_executores add column if not exists confirmado_em timestamptz not null default now();

create index if not exists idx_autoria_revisoes_tarefa on public.tarefa_autoria_revisoes(tarefa_id, criado_em desc);
create index if not exists idx_autoria_confirmacoes_revisao on public.tarefa_autoria_confirmacoes(revisao_id, colaborador_id);
create index if not exists idx_tarefa_executores_tarefa on public.tarefa_executores(tarefa_id, colaborador_id);

alter table public.tarefa_autoria_revisoes enable row level security;
alter table public.tarefa_autoria_confirmacoes enable row level security;
alter table public.tarefa_executores enable row level security;

drop policy if exists "equipe le revisoes de autoria" on public.tarefa_autoria_revisoes;
create policy "equipe le revisoes de autoria" on public.tarefa_autoria_revisoes
for select to authenticated using (auth.uid() is not null);

drop policy if exists "equipe le confirmacoes de autoria" on public.tarefa_autoria_confirmacoes;
create policy "equipe le confirmacoes de autoria" on public.tarefa_autoria_confirmacoes
for select to authenticated using (auth.uid() is not null);

drop policy if exists "equipe le executores" on public.tarefa_executores;
create policy "equipe le executores" on public.tarefa_executores
for select to authenticated using (auth.uid() is not null);

create or replace function public.solicitar_confirmacao_autoria_v1(
  p_tarefa_id uuid,
  p_executores uuid[],
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gestor uuid := public.meu_colaborador_id();
  v_executores uuid[];
  v_qtd integer;
  v_revisao uuid;
  v_executor uuid;
begin
  if not public.sou_gestor() then
    raise exception 'Somente gestores podem validar a conclusão';
  end if;

  if not exists (
    select 1 from public.tarefas t
    where t.id = p_tarefa_id
      and t.arquivada_em is null
      and t.status = 'revisao'::public.status_tarefa
  ) then
    raise exception 'A demanda não está aguardando avaliação';
  end if;

  select coalesce(array_agg(x.id order by x.id), '{}'::uuid[])
    into v_executores
  from (
    select distinct c.id
    from unnest(coalesce(p_executores, '{}'::uuid[])) e(id)
    join public.colaboradores c on c.id = e.id and c.ativo = true
  ) x;

  v_qtd := coalesce(array_length(v_executores, 1), 0);
  if v_qtd = 0 then
    raise exception 'Selecione pelo menos uma pessoa que realizou a demanda';
  end if;

  -- Remove apenas confirmações ainda abertas de uma tentativa anterior.
  -- Revisões encerradas permanecem no histórico.
  delete from public.tarefa_autoria_revisoes r
  where r.tarefa_id = p_tarefa_id and r.status = 'aguardando';

  -- Trabalho individual: validar e encerrar sem popup de autoria.
  if v_qtd = 1 then
    perform public.avaliar_conclusao(p_tarefa_id, true, p_observacao);

    delete from public.tarefa_executores where tarefa_id = p_tarefa_id;
    insert into public.tarefa_executores(tarefa_id, colaborador_id, confirmado_em, confirmado_por)
    values (p_tarefa_id, v_executores[1], now(), v_gestor);

    return jsonb_build_object(
      'concluida', true,
      'confirmacao_necessaria', false,
      'executores', v_executores
    );
  end if;

  -- Trabalho compartilhado: todos os participantes confirmam.
  insert into public.tarefa_autoria_revisoes(tarefa_id, gestor_id, status, observacao_gestor)
  values (p_tarefa_id, v_gestor, 'aguardando', nullif(trim(coalesce(p_observacao, '')), ''))
  returning id into v_revisao;

  foreach v_executor in array v_executores loop
    insert into public.tarefa_autoria_confirmacoes(revisao_id, colaborador_id, resposta)
    values (v_revisao, v_executor, 'pendente');

    insert into public.notificacoes(tarefa_id, colaborador_id, tipo, mensagem, chave_deduplicacao)
    values (
      p_tarefa_id,
      v_executor,
      'avaliacao_pendente'::public.tipo_notificacao,
      'Confirme sua participação nesta entrega compartilhada',
      concat('autoria-confirmar:', v_revisao, ':', v_executor)
    ) on conflict (chave_deduplicacao) do nothing;
  end loop;

  update public.tarefas
  set avaliacao_status = 'confirmacao_autoria',
      avaliacao_observacao = nullif(trim(coalesce(p_observacao, '')), ''),
      avaliado_por = v_gestor,
      avaliado_em = now()
  where id = p_tarefa_id;

  insert into public.atividades_tarefa(tarefa_id, ator_id, tipo, detalhes)
  values (
    p_tarefa_id,
    v_gestor,
    'avaliacao',
    jsonb_build_object(
      'resultado', 'aguardando_confirmacao_autoria',
      'executores', to_jsonb(v_executores),
      'observacao', nullif(trim(coalesce(p_observacao, '')), '')
    )
  );

  return jsonb_build_object(
    'concluida', false,
    'confirmacao_necessaria', true,
    'revisao_id', v_revisao,
    'executores', v_executores
  );
end;
$$;

create or replace function public.responder_confirmacao_autoria_v1(
  p_revisao_id uuid,
  p_confirmar boolean,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_colaborador uuid := public.meu_colaborador_id();
  v_tarefa uuid;
  v_pendentes integer;
  v_contestadas integer;
  v_gestor uuid;
  v_row public.tarefa_autoria_confirmacoes%rowtype;
begin
  select c.* into v_row
  from public.tarefa_autoria_confirmacoes c
  join public.tarefa_autoria_revisoes r on r.id = c.revisao_id
  where c.revisao_id = p_revisao_id
    and c.colaborador_id = v_colaborador
    and c.resposta = 'pendente'
    and r.status = 'aguardando';

  if not found then
    raise exception 'Esta confirmação não está mais pendente para você';
  end if;

  select r.tarefa_id, r.gestor_id into v_tarefa, v_gestor
  from public.tarefa_autoria_revisoes r
  where r.id = p_revisao_id;

  if not p_confirmar and length(trim(coalesce(p_observacao, ''))) = 0 then
    raise exception 'Explique o que está incorreto na autoria';
  end if;

  update public.tarefa_autoria_confirmacoes
  set resposta = case when p_confirmar then 'confirmado' else 'contestado' end,
      observacao = nullif(trim(coalesce(p_observacao, '')), ''),
      respondido_em = now()
  where id = v_row.id;

  if not p_confirmar then
    update public.tarefa_autoria_revisoes
    set status = 'contestada', finalizado_em = now()
    where id = p_revisao_id;

    update public.tarefas
    set avaliacao_status = 'autoria_contestada'
    where id = v_tarefa;

    insert into public.atividades_tarefa(tarefa_id, ator_id, tipo, detalhes)
    values (
      v_tarefa,
      v_colaborador,
      'avaliacao',
      jsonb_build_object('resultado', 'autoria_contestada', 'observacao', nullif(trim(coalesce(p_observacao, '')), ''))
    );

    return jsonb_build_object('concluida', false, 'contestada', true);
  end if;

  select count(*) filter (where resposta = 'pendente'),
         count(*) filter (where resposta = 'contestado')
  into v_pendentes, v_contestadas
  from public.tarefa_autoria_confirmacoes
  where revisao_id = p_revisao_id;

  if v_pendentes = 0 and v_contestadas = 0 then
    update public.tarefa_autoria_revisoes
    set status = 'concluida', finalizado_em = now()
    where id = p_revisao_id;

    perform public.avaliar_conclusao(v_tarefa, true, (
      select observacao_gestor from public.tarefa_autoria_revisoes where id = p_revisao_id
    ));

    delete from public.tarefa_executores where tarefa_id = v_tarefa;
    insert into public.tarefa_executores(tarefa_id, colaborador_id, revisao_id, confirmado_em, confirmado_por)
    select v_tarefa, c.colaborador_id, p_revisao_id, coalesce(c.respondido_em, now()), c.colaborador_id
    from public.tarefa_autoria_confirmacoes c
    where c.revisao_id = p_revisao_id and c.resposta = 'confirmado';

    return jsonb_build_object('concluida', true, 'contestada', false);
  end if;

  return jsonb_build_object('concluida', false, 'contestada', false, 'pendentes', v_pendentes);
end;
$$;

-- ------------------------------------------------------------
-- 2) COMENTÁRIOS COM @MENÇÕES
-- ------------------------------------------------------------

create or replace function public.adicionar_comentario_com_mencoes_v381(
  p_tarefa_id uuid,
  p_texto text,
  p_mencionados uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_ator uuid := public.meu_colaborador_id();
  v_titulo text;
  v_destino uuid;
begin
  v_id := public.adicionar_comentario(p_tarefa_id, p_texto);
  select titulo into v_titulo from public.tarefas where id = p_tarefa_id;

  for v_destino in
    select distinct c.id
    from unnest(coalesce(p_mencionados, '{}'::uuid[])) x(id)
    join public.colaboradores c on c.id = x.id and c.ativo = true
    where c.id is distinct from v_ator
  loop
    insert into public.notificacoes(tarefa_id, colaborador_id, tipo, mensagem, chave_deduplicacao)
    values (
      p_tarefa_id,
      v_destino,
      'comentario'::public.tipo_notificacao,
      concat('Você foi mencionado em “', left(coalesce(v_titulo, 'uma demanda'), 80), '”'),
      concat('mencao:', v_id, ':', v_destino)
    ) on conflict (chave_deduplicacao) do nothing;
  end loop;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- 3) ANEXOS DE DEMANDAS
-- Bucket privado + metadados. URLs são assinadas no frontend.
-- ------------------------------------------------------------

create table if not exists public.tarefa_anexos (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  criado_por uuid not null references public.colaboradores(id) on delete restrict,
  nome text not null,
  caminho text not null,
  mime_type text,
  tamanho_bytes bigint,
  criado_em timestamptz not null default now()
);

create index if not exists idx_tarefa_anexos_tarefa on public.tarefa_anexos(tarefa_id, criado_em desc);
alter table public.tarefa_anexos enable row level security;

drop policy if exists "equipe le anexos de demandas" on public.tarefa_anexos;
create policy "equipe le anexos de demandas" on public.tarefa_anexos
for select to authenticated using (auth.uid() is not null);

insert into storage.buckets(id, name, public, file_size_limit)
values ('demandas-anexos', 'demandas-anexos', false, 26214400)
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit;

drop policy if exists "demandas anexos storage leitura" on storage.objects;
create policy "demandas anexos storage leitura" on storage.objects
for select to authenticated
using (bucket_id = 'demandas-anexos');

drop policy if exists "demandas anexos storage envio" on storage.objects;
create policy "demandas anexos storage envio" on storage.objects
for insert to authenticated
with check (bucket_id = 'demandas-anexos');

drop policy if exists "demandas anexos storage remocao" on storage.objects;
create policy "demandas anexos storage remocao" on storage.objects
for delete to authenticated
using (bucket_id = 'demandas-anexos');

create or replace function public.registrar_anexo_demanda_v381(
  p_tarefa_id uuid,
  p_nome text,
  p_caminho text,
  p_mime_type text default null,
  p_tamanho_bytes bigint default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_id uuid;
begin
  if v_ator is null then raise exception 'Colaborador não encontrado'; end if;
  if not exists (select 1 from public.tarefas where id = p_tarefa_id and arquivada_em is null) then
    raise exception 'Demanda não encontrada ou arquivada';
  end if;
  if length(trim(coalesce(p_nome, ''))) = 0 or length(trim(coalesce(p_caminho, ''))) = 0 then
    raise exception 'Arquivo inválido';
  end if;

  insert into public.tarefa_anexos(tarefa_id, criado_por, nome, caminho, mime_type, tamanho_bytes)
  values (p_tarefa_id, v_ator, trim(p_nome), trim(p_caminho), nullif(trim(coalesce(p_mime_type, '')), ''), p_tamanho_bytes)
  returning id into v_id;

  insert into public.atividades_tarefa(tarefa_id, ator_id, tipo, detalhes)
  values (p_tarefa_id, v_ator, 'editada', jsonb_build_object('anexo', p_nome));

  return v_id;
end;
$$;

create or replace function public.remover_anexo_demanda_v381(p_anexo_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_caminho text;
  v_criador uuid;
begin
  select caminho, criado_por into v_caminho, v_criador
  from public.tarefa_anexos where id = p_anexo_id;
  if not found then raise exception 'Anexo não encontrado'; end if;
  if v_criador is distinct from v_ator and not public.sou_gestor() then
    raise exception 'Você não pode remover este anexo';
  end if;
  delete from public.tarefa_anexos where id = p_anexo_id;
  return v_caminho;
end;
$$;

-- ------------------------------------------------------------
-- 4) RECORRÊNCIA COM VÁRIOS HORÁRIOS NO MESMO DIA
-- Mantém o motor atual: cada horário é uma série normal existente.
-- Esta tabela apenas agrupa as séries irmãs para a interface tratar como
-- uma única rotina com múltiplas execuções diárias.
-- ------------------------------------------------------------

create table if not exists public.demanda_recorrente_grupos_v381 (
  grupo_id uuid not null,
  recorrencia_id uuid primary key references public.demandas_recorrentes(id) on delete cascade,
  horario time not null,
  ordem integer not null default 0,
  criado_em timestamptz not null default now()
);

create index if not exists idx_recorrencia_grupos_v381_grupo on public.demanda_recorrente_grupos_v381(grupo_id, ordem, horario);
alter table public.demanda_recorrente_grupos_v381 enable row level security;

drop policy if exists "equipe le grupos de recorrencia" on public.demanda_recorrente_grupos_v381;
create policy "equipe le grupos de recorrencia" on public.demanda_recorrente_grupos_v381
for select to authenticated using (auth.uid() is not null);

create or replace function public.agrupar_recorrencias_v381(
  p_recorrencias uuid[],
  p_horarios text[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_grupo uuid := gen_random_uuid();
  v_i integer;
  v_total integer := coalesce(array_length(p_recorrencias, 1), 0);
  v_grupo_antigo uuid;
begin
  if public.meu_colaborador_id() is null then raise exception 'Colaborador não encontrado'; end if;
  if v_total < 1 or v_total <> coalesce(array_length(p_horarios, 1), 0) then
    raise exception 'Informe ao menos uma recorrência e um horário para cada uma';
  end if;

  -- Se uma das séries já pertencia a um grupo, limpa o grupo inteiro antes
  -- de reconstruí-lo. Isso também permite reduzir 3 horários para 1 sem
  -- deixar séries encerradas aparecendo agrupadas na interface.
  select g.grupo_id into v_grupo_antigo
  from public.demanda_recorrente_grupos_v381 g
  where g.recorrencia_id = any(p_recorrencias)
  limit 1;
  if v_grupo_antigo is not null then
    delete from public.demanda_recorrente_grupos_v381 where grupo_id = v_grupo_antigo;
  end if;

  -- Uma única ocorrência não precisa de grupo: a limpeza acima basta.
  if v_total = 1 then
    return v_grupo;
  end if;

  for v_i in 1..v_total loop
    insert into public.demanda_recorrente_grupos_v381(grupo_id, recorrencia_id, horario, ordem)
    values (v_grupo, p_recorrencias[v_i], p_horarios[v_i]::time, v_i - 1)
    on conflict (recorrencia_id) do update
      set grupo_id = excluded.grupo_id,
          horario = excluded.horario,
          ordem = excluded.ordem;
  end loop;
  return v_grupo;
end;
$$;

-- Permissões de leitura e RPCs.
revoke all on public.tarefa_autoria_revisoes, public.tarefa_autoria_confirmacoes, public.tarefa_executores, public.tarefa_anexos, public.demanda_recorrente_grupos_v381 from anon;
grant select on public.tarefa_autoria_revisoes, public.tarefa_autoria_confirmacoes, public.tarefa_executores, public.tarefa_anexos, public.demanda_recorrente_grupos_v381 to authenticated;

revoke all on function public.solicitar_confirmacao_autoria_v1(uuid, uuid[], text) from public, anon;
revoke all on function public.responder_confirmacao_autoria_v1(uuid, boolean, text) from public, anon;
revoke all on function public.adicionar_comentario_com_mencoes_v381(uuid, text, uuid[]) from public, anon;
revoke all on function public.registrar_anexo_demanda_v381(uuid, text, text, text, bigint) from public, anon;
revoke all on function public.remover_anexo_demanda_v381(uuid) from public, anon;
revoke all on function public.agrupar_recorrencias_v381(uuid[], text[]) from public, anon;

grant execute on function public.solicitar_confirmacao_autoria_v1(uuid, uuid[], text) to authenticated;
grant execute on function public.responder_confirmacao_autoria_v1(uuid, boolean, text) to authenticated;
grant execute on function public.adicionar_comentario_com_mencoes_v381(uuid, text, uuid[]) to authenticated;
grant execute on function public.registrar_anexo_demanda_v381(uuid, text, text, text, bigint) to authenticated;
grant execute on function public.remover_anexo_demanda_v381(uuid) to authenticated;
grant execute on function public.agrupar_recorrencias_v381(uuid[], text[]) to authenticated;

commit;


-- ==================== AUTORIA FINAL V3.8.5 ====================
-- ============================================================
-- PMG CONNECT — DEMANDAS V3.8.5
-- CONSOLIDAÇÃO FINAL DA AUTORIA / LEITURA ROBUSTA
-- 2026-08-24
--
-- V3.8.5:
--   - mantém 1 executor sem confirmação e 2+ com confirmação coletiva;
--   - elimina dependência de ON CONFLICT na notificação;
--   - adiciona snapshot RPC para o frontend não depender de SELECT direto/RLS;
--   - adiciona diagnóstico autenticado real, além da existência dos objetos.
--
-- Corrige quatro pontos:
--   1) instala SOMENTE a estrutura de autoria, sem depender do SQL 13 inteiro;
--   2) amplia o CHECK de tarefas.avaliacao_status para os estados de autoria;
--   3) mantém 1 executor sem confirmação e 2+ com confirmação coletiva;
--   4) força o PostgREST/Supabase a recarregar o schema ao final.
--
-- Pode ser executado novamente com segurança.
-- ============================================================

create extension if not exists pgcrypto;

begin;

-- ------------------------------------------------------------
-- COMPATIBILIDADE V3
-- ------------------------------------------------------------
alter table public.tarefas add column if not exists avaliacao_status text not null default 'nao_solicitada';
alter table public.tarefas add column if not exists avaliacao_observacao text;
alter table public.tarefas add column if not exists avaliado_por uuid references public.colaboradores(id) on delete set null;
alter table public.tarefas add column if not exists avaliado_em timestamptz;
alter table public.notificacoes add column if not exists mensagem text;

-- O V3.1 aceitava somente nao_solicitada/pendente/aprovada/ajustes.
-- A autoria precisa de dois estados adicionais. Removemos somente CHECKs
-- que realmente mencionam avaliacao_status e recriamos a regra canônica.
do $$
declare
  v_constraint record;
begin
  for v_constraint in
    select c.conname
    from pg_constraint c
    where c.conrelid = 'public.tarefas'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%avaliacao_status%'
  loop
    execute format('alter table public.tarefas drop constraint %I', v_constraint.conname);
  end loop;
end
$$;

alter table public.tarefas
  add constraint tarefas_avaliacao_status_valido
  check (avaliacao_status in (
    'nao_solicitada',
    'pendente',
    'aprovada',
    'ajustes',
    'confirmacao_autoria',
    'autoria_contestada'
  ));

-- ------------------------------------------------------------
-- TABELAS DE AUTORIA
-- ------------------------------------------------------------
create table if not exists public.tarefa_autoria_revisoes (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  gestor_id uuid not null references public.colaboradores(id) on delete restrict,
  status text not null default 'aguardando',
  observacao_gestor text,
  criado_em timestamptz not null default now(),
  finalizado_em timestamptz
);

create table if not exists public.tarefa_autoria_confirmacoes (
  id uuid primary key default gen_random_uuid(),
  revisao_id uuid not null references public.tarefa_autoria_revisoes(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  resposta text not null default 'pendente',
  observacao text,
  criado_em timestamptz not null default now(),
  respondido_em timestamptz
);

create table if not exists public.tarefa_executores (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id) on delete cascade,
  revisao_id uuid references public.tarefa_autoria_revisoes(id) on delete set null,
  confirmado_em timestamptz not null default now(),
  confirmado_por uuid references public.colaboradores(id) on delete set null
);

alter table public.tarefa_autoria_revisoes add column if not exists observacao_gestor text;
alter table public.tarefa_autoria_revisoes add column if not exists finalizado_em timestamptz;
alter table public.tarefa_autoria_confirmacoes add column if not exists observacao text;
alter table public.tarefa_autoria_confirmacoes add column if not exists respondido_em timestamptz;
alter table public.tarefa_executores add column if not exists revisao_id uuid references public.tarefa_autoria_revisoes(id) on delete set null;
alter table public.tarefa_executores add column if not exists confirmado_por uuid references public.colaboradores(id) on delete set null;
alter table public.tarefa_executores add column if not exists confirmado_em timestamptz not null default now();

create index if not exists idx_autoria_revisoes_tarefa
  on public.tarefa_autoria_revisoes(tarefa_id, criado_em desc);
create index if not exists idx_autoria_confirmacoes_revisao
  on public.tarefa_autoria_confirmacoes(revisao_id, colaborador_id);
create index if not exists idx_tarefa_executores_tarefa
  on public.tarefa_executores(tarefa_id, colaborador_id);

alter table public.tarefa_autoria_revisoes enable row level security;
alter table public.tarefa_autoria_confirmacoes enable row level security;
alter table public.tarefa_executores enable row level security;

drop policy if exists "equipe le revisoes de autoria" on public.tarefa_autoria_revisoes;
create policy "equipe le revisoes de autoria" on public.tarefa_autoria_revisoes
  for select to authenticated using (auth.uid() is not null);

drop policy if exists "equipe le confirmacoes de autoria" on public.tarefa_autoria_confirmacoes;
create policy "equipe le confirmacoes de autoria" on public.tarefa_autoria_confirmacoes
  for select to authenticated using (auth.uid() is not null);

drop policy if exists "equipe le executores" on public.tarefa_executores;
create policy "equipe le executores" on public.tarefa_executores
  for select to authenticated using (auth.uid() is not null);

-- ------------------------------------------------------------
-- GESTOR VALIDA A ENTREGA
-- 1 executor = conclui direto
-- 2+ = abre confirmação coletiva
-- ------------------------------------------------------------
create or replace function public.solicitar_confirmacao_autoria_v1(
  p_tarefa_id uuid,
  p_executores uuid[],
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gestor uuid := public.meu_colaborador_id();
  v_executores uuid[];
  v_qtd integer;
  v_revisao uuid;
  v_executor uuid;
begin
  if v_gestor is null then
    raise exception 'Colaborador não identificado para esta sessão';
  end if;

  if not public.sou_gestor() then
    raise exception 'Somente gestores podem validar a conclusão';
  end if;

  if not exists (
    select 1
    from public.tarefas t
    where t.id = p_tarefa_id
      and t.arquivada_em is null
      and t.status = 'revisao'::public.status_tarefa
  ) then
    raise exception 'A demanda não está aguardando avaliação';
  end if;

  select coalesce(array_agg(x.id order by x.id), '{}'::uuid[])
    into v_executores
  from (
    select distinct c.id
    from unnest(coalesce(p_executores, '{}'::uuid[])) e(id)
    join public.colaboradores c on c.id = e.id and c.ativo = true
  ) x;

  v_qtd := coalesce(array_length(v_executores, 1), 0);
  if v_qtd = 0 then
    raise exception 'Selecione pelo menos uma pessoa que realizou a demanda';
  end if;

  -- Limpa somente uma tentativa ainda aberta. Revisões concluídas/contestadas
  -- continuam preservadas no histórico.
  delete from public.tarefa_autoria_revisoes
  where tarefa_id = p_tarefa_id
    and status = 'aguardando';

  -- Trabalho individual: sem confirmação extra.
  if v_qtd = 1 then
    perform public.avaliar_conclusao(p_tarefa_id, true, p_observacao);

    delete from public.tarefa_executores where tarefa_id = p_tarefa_id;
    insert into public.tarefa_executores(
      tarefa_id, colaborador_id, confirmado_em, confirmado_por
    ) values (
      p_tarefa_id, v_executores[1], now(), v_gestor
    );

    return jsonb_build_object(
      'concluida', true,
      'confirmacao_necessaria', false,
      'executores', to_jsonb(v_executores)
    );
  end if;

  -- Trabalho compartilhado: abre uma revisão e exige confirmação de todos.
  insert into public.tarefa_autoria_revisoes(
    tarefa_id, gestor_id, status, observacao_gestor
  ) values (
    p_tarefa_id,
    v_gestor,
    'aguardando',
    nullif(trim(coalesce(p_observacao, '')), '')
  ) returning id into v_revisao;

  foreach v_executor in array v_executores loop
    insert into public.tarefa_autoria_confirmacoes(
      revisao_id, colaborador_id, resposta
    ) values (
      v_revisao, v_executor, 'pendente'
    );

    -- Usa um tipo de notificação existente desde a base do Demandas.
    insert into public.notificacoes(
      tarefa_id, colaborador_id, tipo, mensagem, chave_deduplicacao
    )
    select
      p_tarefa_id,
      v_executor,
      'status_mudou'::public.tipo_notificacao,
      'Confirme sua participação nesta entrega compartilhada',
      concat('autoria-confirmar:', v_revisao, ':', v_executor)
    where not exists (
      select 1 from public.notificacoes n
      where n.chave_deduplicacao = concat('autoria-confirmar:', v_revisao, ':', v_executor)
    );
  end loop;

  update public.tarefas
  set avaliacao_status = 'confirmacao_autoria',
      avaliacao_observacao = nullif(trim(coalesce(p_observacao, '')), ''),
      avaliado_por = v_gestor,
      avaliado_em = now()
  where id = p_tarefa_id;

  insert into public.atividades_tarefa(tarefa_id, ator_id, tipo, detalhes)
  values (
    p_tarefa_id,
    v_gestor,
    'avaliacao',
    jsonb_build_object(
      'resultado', 'aguardando_confirmacao_autoria',
      'executores', to_jsonb(v_executores),
      'observacao', nullif(trim(coalesce(p_observacao, '')), '')
    )
  );

  return jsonb_build_object(
    'concluida', false,
    'confirmacao_necessaria', true,
    'revisao_id', v_revisao,
    'executores', to_jsonb(v_executores)
  );
end;
$$;

-- ------------------------------------------------------------
-- COLABORADOR CONFIRMA / CONTESTA
-- O último colaborador NÃO chama avaliar_conclusao(), porque essa rotina
-- exige gestor na sessão. A aprovação já foi feita antes pelo gestor.
-- ------------------------------------------------------------
create or replace function public.responder_confirmacao_autoria_v1(
  p_revisao_id uuid,
  p_confirmar boolean,
  p_observacao text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_colaborador uuid := public.meu_colaborador_id();
  v_tarefa uuid;
  v_pendentes integer;
  v_contestadas integer;
  v_gestor uuid;
  v_responsavel uuid;
  v_observacao_gestor text;
  v_row public.tarefa_autoria_confirmacoes%rowtype;
begin
  if v_colaborador is null then
    raise exception 'Colaborador não identificado para esta sessão';
  end if;

  select c.* into v_row
  from public.tarefa_autoria_confirmacoes c
  join public.tarefa_autoria_revisoes r on r.id = c.revisao_id
  where c.revisao_id = p_revisao_id
    and c.colaborador_id = v_colaborador
    and c.resposta = 'pendente'
    and r.status = 'aguardando';

  if not found then
    raise exception 'Esta confirmação não está mais pendente para você';
  end if;

  select r.tarefa_id, r.gestor_id, r.observacao_gestor
    into v_tarefa, v_gestor, v_observacao_gestor
  from public.tarefa_autoria_revisoes r
  where r.id = p_revisao_id;

  if v_tarefa is null or v_gestor is null then
    raise exception 'A revisão de autoria está incompleta';
  end if;

  if not p_confirmar and length(trim(coalesce(p_observacao, ''))) = 0 then
    raise exception 'Explique o que está incorreto na autoria';
  end if;

  update public.tarefa_autoria_confirmacoes
  set resposta = case when p_confirmar then 'confirmado' else 'contestado' end,
      observacao = nullif(trim(coalesce(p_observacao, '')), ''),
      respondido_em = now()
  where id = v_row.id;

  if not p_confirmar then
    update public.tarefa_autoria_revisoes
    set status = 'contestada',
        finalizado_em = now()
    where id = p_revisao_id;

    update public.tarefas
    set avaliacao_status = 'autoria_contestada'
    where id = v_tarefa;

    insert into public.atividades_tarefa(tarefa_id, ator_id, tipo, detalhes)
    values (
      v_tarefa,
      v_colaborador,
      'avaliacao',
      jsonb_build_object(
        'resultado', 'autoria_contestada',
        'observacao', nullif(trim(coalesce(p_observacao, '')), '')
      )
    );

    return jsonb_build_object(
      'concluida', false,
      'contestada', true
    );
  end if;

  select count(*) filter (where resposta = 'pendente'),
         count(*) filter (where resposta = 'contestado')
    into v_pendentes, v_contestadas
  from public.tarefa_autoria_confirmacoes
  where revisao_id = p_revisao_id;

  if v_pendentes > 0 or v_contestadas > 0 then
    return jsonb_build_object(
      'concluida', false,
      'contestada', v_contestadas > 0,
      'pendentes', v_pendentes
    );
  end if;

  -- Todos confirmaram. Fecha a revisão de forma atômica.
  update public.tarefa_autoria_revisoes
  set status = 'concluida',
      finalizado_em = now()
  where id = p_revisao_id
    and status = 'aguardando';

  if not found then
    raise exception 'Esta revisão de autoria já foi encerrada';
  end if;

  select t.responsavel_id
    into v_responsavel
  from public.tarefas t
  where t.id = v_tarefa
    and t.arquivada_em is null
    and t.status = 'revisao'::public.status_tarefa;

  if not found then
    raise exception 'A demanda não está mais aguardando avaliação';
  end if;

  update public.tarefas
  set status = 'concluida'::public.status_tarefa,
      avaliacao_status = 'aprovada',
      avaliacao_observacao = nullif(trim(coalesce(v_observacao_gestor, '')), ''),
      avaliado_por = v_gestor,
      avaliado_em = now()
  where id = v_tarefa;

  delete from public.tarefa_executores
  where tarefa_id = v_tarefa;

  insert into public.tarefa_executores(
    tarefa_id,
    colaborador_id,
    revisao_id,
    confirmado_em,
    confirmado_por
  )
  select
    v_tarefa,
    c.colaborador_id,
    p_revisao_id,
    coalesce(c.respondido_em, now()),
    c.colaborador_id
  from public.tarefa_autoria_confirmacoes c
  where c.revisao_id = p_revisao_id
    and c.resposta = 'confirmado';

  insert into public.atividades_tarefa(tarefa_id, ator_id, tipo, detalhes)
  values (
    v_tarefa,
    v_gestor,
    'avaliacao',
    jsonb_build_object(
      'resultado', 'aprovada_com_autoria',
      'revisao_id', p_revisao_id,
      'confirmado_por_ultimo', v_colaborador,
      'observacao', nullif(trim(coalesce(v_observacao_gestor, '')), '')
    )
  );

  if v_responsavel is not null and v_responsavel is distinct from v_gestor then
    insert into public.notificacoes(
      tarefa_id, colaborador_id, tipo, mensagem, chave_deduplicacao
    )
    select
      v_tarefa,
      v_responsavel,
      'status_mudou'::public.tipo_notificacao,
      'A conclusão da sua demanda foi aprovada',
      concat('avaliacao-autoria:', v_tarefa, ':', v_responsavel, ':', p_revisao_id)
    where not exists (
      select 1 from public.notificacoes n
      where n.chave_deduplicacao = concat('avaliacao-autoria:', v_tarefa, ':', v_responsavel, ':', p_revisao_id)
    );
  end if;

  return jsonb_build_object(
    'concluida', true,
    'contestada', false,
    'pendentes', 0
  );
end;
$$;

-- ------------------------------------------------------------
-- SNAPSHOT / DIAGNÓSTICO V3.8.5
-- O frontend usa este RPC primeiro. Isso evita falso negativo de RLS/
-- permissões de SELECT direto e garante uma fonte única para o módulo.
-- ------------------------------------------------------------
create or replace function public.pmg_autoria_snapshot_v385()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_colaborador uuid := public.meu_colaborador_id();
  v_revisoes jsonb;
  v_confirmacoes jsonb;
  v_executores jsonb;
begin
  if auth.uid() is null or v_colaborador is null then
    raise exception 'Sessão autenticada do PMG Connect não identificada';
  end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em desc), '[]'::jsonb)
    into v_revisoes
  from (
    select r.*
    from public.tarefa_autoria_revisoes r
    order by r.criado_em desc
    limit 1800
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.criado_em desc), '[]'::jsonb)
    into v_confirmacoes
  from (
    select c.*
    from public.tarefa_autoria_confirmacoes c
    order by c.criado_em desc
    limit 5000
  ) x;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.confirmado_em desc), '[]'::jsonb)
    into v_executores
  from (
    select e.*
    from public.tarefa_executores e
    order by e.confirmado_em desc
    limit 5000
  ) x;

  return jsonb_build_object(
    'ok', true,
    'versao', '3.8.5',
    'colaborador_id', v_colaborador,
    'revisoes', v_revisoes,
    'confirmacoes', v_confirmacoes,
    'executores', v_executores
  );
end;
$$;

create or replace function public.pmg_autoria_health_v385()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_colaborador uuid := public.meu_colaborador_id();
begin
  return jsonb_build_object(
    'ok', auth.uid() is not null and v_colaborador is not null,
    'versao', '3.8.5',
    'auth_ok', auth.uid() is not null,
    'colaborador_ok', v_colaborador is not null,
    'revisoes', to_regclass('public.tarefa_autoria_revisoes') is not null,
    'confirmacoes', to_regclass('public.tarefa_autoria_confirmacoes') is not null,
    'executores', to_regclass('public.tarefa_executores') is not null,
    'solicitar_rpc', to_regprocedure('public.solicitar_confirmacao_autoria_v1(uuid,uuid[],text)') is not null,
    'responder_rpc', to_regprocedure('public.responder_confirmacao_autoria_v1(uuid,boolean,text)') is not null
  );
end;
$$;

revoke all on public.tarefa_autoria_revisoes,
              public.tarefa_autoria_confirmacoes,
              public.tarefa_executores
from anon;

grant select on public.tarefa_autoria_revisoes,
                public.tarefa_autoria_confirmacoes,
                public.tarefa_executores
  to authenticated;

revoke all on function public.solicitar_confirmacao_autoria_v1(uuid, uuid[], text) from public, anon;
revoke all on function public.responder_confirmacao_autoria_v1(uuid, boolean, text) from public, anon;
revoke all on function public.pmg_autoria_snapshot_v385() from public, anon;
revoke all on function public.pmg_autoria_health_v385() from public, anon;

grant execute on function public.solicitar_confirmacao_autoria_v1(uuid, uuid[], text) to authenticated;
grant execute on function public.responder_confirmacao_autoria_v1(uuid, boolean, text) to authenticated;
grant execute on function public.pmg_autoria_snapshot_v385() to authenticated;
grant execute on function public.pmg_autoria_health_v385() to authenticated;

commit;

-- Força atualização do cache de schema do PostgREST/Supabase.
notify pgrst, 'reload schema';

-- A última consulta deve retornar tudo TRUE/3.8.5.
select
  to_regclass('public.tarefa_autoria_revisoes') is not null as revisoes_ok,
  to_regclass('public.tarefa_autoria_confirmacoes') is not null as confirmacoes_ok,
  to_regclass('public.tarefa_executores') is not null as executores_ok,
  to_regprocedure('public.solicitar_confirmacao_autoria_v1(uuid,uuid[],text)') is not null as solicitar_rpc_ok,
  to_regprocedure('public.responder_confirmacao_autoria_v1(uuid,boolean,text)') is not null as responder_rpc_ok,
  to_regprocedure('public.pmg_autoria_snapshot_v385()') is not null as snapshot_rpc_ok,
  to_regprocedure('public.pmg_autoria_health_v385()') is not null as health_rpc_ok;


-- ============================================================
-- DIAGNÓSTICO FINAL V3.8.5
-- A última linha de resultados deve retornar TRUE em todas as colunas.
-- ============================================================
notify pgrst, 'reload schema';

select
  to_regclass('public.demandas_recorrentes') is not null as recorrencias_ok,
  to_regclass('public.demandas_recorrentes_ocorrencias') is not null as ocorrencias_ok,
  to_regclass('public.tarefa_responsaveis') is not null as tarefa_responsaveis_ok,
  to_regclass('public.demanda_recorrente_responsaveis') is not null as recorrencia_responsaveis_ok,
  to_regclass('public.tarefa_autoria_revisoes') is not null as revisoes_ok,
  to_regclass('public.tarefa_autoria_confirmacoes') is not null as confirmacoes_ok,
  to_regclass('public.tarefa_executores') is not null as executores_ok,
  to_regclass('public.tarefa_anexos') is not null as anexos_ok,
  to_regclass('public.demanda_recorrente_grupos_v381') is not null as grupos_multihorario_ok,
  to_regprocedure('public.processar_recorrencias_demanda()') is not null as processar_recorrencias_ok,
  to_regprocedure('public.definir_responsaveis_tarefa_modo_v1(uuid,uuid[],text)') is not null as responsaveis_tarefa_ok,
  to_regprocedure('public.definir_responsaveis_recorrencia_modo_v1(uuid,uuid[],text,boolean)') is not null as responsaveis_recorrencia_ok,
  to_regprocedure('public.alterar_urgencia_tarefa_v1(uuid,public.prioridade_tarefa,boolean,boolean)') is not null as urgencia_ok,
  to_regprocedure('public.solicitar_confirmacao_autoria_v1(uuid,uuid[],text)') is not null as solicitar_autoria_ok,
  to_regprocedure('public.responder_confirmacao_autoria_v1(uuid,boolean,text)') is not null as responder_autoria_ok,
  to_regprocedure('public.pmg_autoria_snapshot_v385()') is not null as snapshot_autoria_ok,
  to_regprocedure('public.pmg_autoria_health_v385()') is not null as health_autoria_ok;
