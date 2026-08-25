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
