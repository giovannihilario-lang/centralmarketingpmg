-- ============================================================
-- PMG CONNECT - DEMANDAS V3.8.8
-- HOTFIX DEFINITIVO DE CONCLUSAO / AUTORIA
--
-- Regra:
--   1 executor  -> gestor valida e conclui imediatamente.
--   2+ executores -> abre confirmacao coletiva de autoria.
--
-- Tambem remove SOMENTE triggers legados em public.tarefas cuja funcao
-- contenha a mensagem antiga:
-- "Use a confirmação de autoria antes de concluir a demanda"
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 1) Remove bloqueio legado que pode ter sobrado no banco e que nao
--    existe mais no codigo atual do projeto.
-- ------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select n.nspname as schema_name,
           c.relname as table_name,
           t.tgname as trigger_name
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_proc p on p.oid = t.tgfoid
    where not t.tgisinternal
      and n.nspname = 'public'
      and c.relname = 'tarefas'
      and (
        pg_get_functiondef(p.oid) ilike '%Use a confirmação de autoria antes de concluir a demanda%'
        or pg_get_functiondef(p.oid) ilike '%Use a confirmacao de autoria antes de concluir a demanda%'
      )
  loop
    execute format('drop trigger if exists %I on %I.%I', r.trigger_name, r.schema_name, r.table_name);
    raise notice 'Trigger legado removido: %.%.%', r.schema_name, r.table_name, r.trigger_name;
  end loop;
end $$;

-- ------------------------------------------------------------
-- 2) Garante estruturas minimas da autoria compartilhada.
-- ------------------------------------------------------------
create table if not exists public.tarefa_autoria_revisoes (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  gestor_id uuid not null references public.colaboradores(id),
  status text not null default 'aguardando',
  observacao_gestor text,
  criado_em timestamptz not null default now(),
  finalizado_em timestamptz
);

create table if not exists public.tarefa_autoria_confirmacoes (
  id uuid primary key default gen_random_uuid(),
  revisao_id uuid not null references public.tarefa_autoria_revisoes(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id),
  resposta text not null default 'pendente',
  observacao text,
  respondido_em timestamptz,
  unique(revisao_id, colaborador_id)
);

create table if not exists public.tarefa_executores (
  tarefa_id uuid not null references public.tarefas(id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores(id),
  revisao_id uuid references public.tarefa_autoria_revisoes(id) on delete set null,
  confirmado_em timestamptz,
  confirmado_por uuid references public.colaboradores(id),
  primary key (tarefa_id, colaborador_id)
);

alter table public.tarefa_autoria_revisoes add column if not exists observacao_gestor text;
alter table public.tarefa_autoria_revisoes add column if not exists finalizado_em timestamptz;
alter table public.tarefa_autoria_confirmacoes add column if not exists observacao text;
alter table public.tarefa_autoria_confirmacoes add column if not exists respondido_em timestamptz;
alter table public.tarefa_executores add column if not exists revisao_id uuid references public.tarefa_autoria_revisoes(id) on delete set null;
alter table public.tarefa_executores add column if not exists confirmado_em timestamptz;
alter table public.tarefa_executores add column if not exists confirmado_por uuid references public.colaboradores(id);

-- ------------------------------------------------------------
-- 3) Nova RPC canonica. Nao chama avaliar_conclusao() para aprovacao.
-- ------------------------------------------------------------
create or replace function public.validar_entrega_v388(
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
  v_responsavel uuid;
begin
  if v_gestor is null then
    raise exception 'Colaborador não identificado para esta sessão';
  end if;

  if not public.sou_gestor() then
    raise exception 'Somente gestores podem validar a conclusão';
  end if;

  select t.responsavel_id
    into v_responsavel
  from public.tarefas t
  where t.id = p_tarefa_id
    and t.arquivada_em is null
    and t.status = 'revisao'::public.status_tarefa;

  if not found then
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

  delete from public.tarefa_autoria_revisoes
  where tarefa_id = p_tarefa_id
    and status = 'aguardando';

  -- UMA PESSOA: conclui AGORA. Nenhuma confirmacao de autoria.
  if v_qtd = 1 then
    update public.tarefas
    set status = 'concluida'::public.status_tarefa,
        avaliacao_status = 'aprovada',
        avaliacao_observacao = nullif(trim(coalesce(p_observacao, '')), ''),
        avaliado_por = v_gestor,
        avaliado_em = now()
    where id = p_tarefa_id
      and arquivada_em is null
      and status = 'revisao'::public.status_tarefa;

    if not found then
      raise exception 'A demanda não está aguardando avaliação';
    end if;

    delete from public.tarefa_executores where tarefa_id = p_tarefa_id;
    insert into public.tarefa_executores(
      tarefa_id, colaborador_id, confirmado_em, confirmado_por
    ) values (
      p_tarefa_id, v_executores[1], now(), v_gestor
    ) on conflict (tarefa_id, colaborador_id) do update
      set confirmado_em = excluded.confirmado_em,
          confirmado_por = excluded.confirmado_por,
          revisao_id = null;

    insert into public.atividades_tarefa(tarefa_id, ator_id, tipo, detalhes)
    values (
      p_tarefa_id,
      v_gestor,
      'avaliacao',
      jsonb_build_object(
        'resultado', 'aprovada',
        'modo', 'autoria_individual_sem_confirmacao',
        'executores', to_jsonb(v_executores),
        'observacao', nullif(trim(coalesce(p_observacao, '')), '')
      )
    );

    if v_responsavel is not null and v_responsavel is distinct from v_gestor then
      insert into public.notificacoes(tarefa_id, colaborador_id, tipo, mensagem, chave_deduplicacao)
      values (
        p_tarefa_id,
        v_responsavel,
        'avaliacao_aprovada'::public.tipo_notificacao,
        'A conclusão da sua demanda foi aprovada',
        concat('avaliacao-v388:', p_tarefa_id, ':', v_responsavel, ':', extract(epoch from now())::bigint)
      ) on conflict (chave_deduplicacao) do nothing;
    end if;

    return jsonb_build_object(
      'concluida', true,
      'confirmacao_necessaria', false,
      'executores', to_jsonb(v_executores)
    );
  end if;

  -- DUAS OU MAIS PESSOAS: confirmacao coletiva.
  insert into public.tarefa_autoria_revisoes(
    tarefa_id, gestor_id, status, observacao_gestor
  ) values (
    p_tarefa_id,
    v_gestor,
    'aguardando',
    nullif(trim(coalesce(p_observacao, '')), '')
  ) returning id into v_revisao;

  delete from public.tarefa_executores where tarefa_id = p_tarefa_id;

  foreach v_executor in array v_executores loop
    insert into public.tarefa_autoria_confirmacoes(revisao_id, colaborador_id, resposta)
    values (v_revisao, v_executor, 'pendente');

    insert into public.tarefa_executores(tarefa_id, colaborador_id, revisao_id)
    values (p_tarefa_id, v_executor, v_revisao)
    on conflict (tarefa_id, colaborador_id) do update
      set revisao_id = excluded.revisao_id,
          confirmado_em = null,
          confirmado_por = null;

    insert into public.notificacoes(
      tarefa_id, colaborador_id, tipo, mensagem, chave_deduplicacao
    )
    select
      p_tarefa_id,
      v_executor,
      'status_mudou'::public.tipo_notificacao,
      'Confirme sua participação nesta entrega compartilhada',
      concat('autoria-v388:', v_revisao, ':', v_executor)
    where not exists (
      select 1 from public.notificacoes n
      where n.chave_deduplicacao = concat('autoria-v388:', v_revisao, ':', v_executor)
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
      'modo', 'autoria_compartilhada',
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
-- 4) Compatibilidade: qualquer frontend antigo que chamar a RPC anterior
--    cai automaticamente na regra nova.
-- ------------------------------------------------------------
create or replace function public.solicitar_confirmacao_autoria_v1(
  p_tarefa_id uuid,
  p_executores uuid[],
  p_observacao text default null
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select public.validar_entrega_v388(p_tarefa_id, p_executores, p_observacao);
$$;

-- ------------------------------------------------------------
-- 5) Blindagem da RPC antiga de avaliacao.
--    Aprovar diretamente nao exige autoria; o frontend novo usa validar_entrega_v388.
--    Reprovar continua devolvendo para andamento.
-- ------------------------------------------------------------
create or replace function public.avaliar_conclusao(
  p_tarefa_id uuid,
  p_aprovado boolean,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gestor uuid := public.meu_colaborador_id();
  v_responsavel uuid;
begin
  if not public.sou_gestor() then
    raise exception 'Somente gestores podem avaliar conclusões';
  end if;

  select t.responsavel_id into v_responsavel
  from public.tarefas t
  where t.id = p_tarefa_id
    and t.arquivada_em is null
    and t.status = 'revisao'::public.status_tarefa;

  if not found then
    raise exception 'A demanda não está aguardando avaliação';
  end if;

  update public.tarefas
  set status = case when p_aprovado then 'concluida'::public.status_tarefa else 'andamento'::public.status_tarefa end,
      avaliacao_status = case when p_aprovado then 'aprovada' else 'ajustes' end,
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
      'resultado', case when p_aprovado then 'aprovada' else 'ajustes' end,
      'observacao', nullif(trim(coalesce(p_observacao, '')), '')
    )
  );
end;
$$;

revoke all on function public.validar_entrega_v388(uuid, uuid[], text) from public, anon;
grant execute on function public.validar_entrega_v388(uuid, uuid[], text) to authenticated;

revoke all on function public.solicitar_confirmacao_autoria_v1(uuid, uuid[], text) from public, anon;
grant execute on function public.solicitar_confirmacao_autoria_v1(uuid, uuid[], text) to authenticated;

revoke all on function public.avaliar_conclusao(uuid, boolean, text) from public, anon;
grant execute on function public.avaliar_conclusao(uuid, boolean, text) to authenticated;

notify pgrst, 'reload schema';
commit;

-- Validacao simples: as duas RPCs principais devem retornar true.
select
  to_regprocedure('public.validar_entrega_v388(uuid,uuid[],text)') is not null as validar_v388_ok,
  to_regprocedure('public.solicitar_confirmacao_autoria_v1(uuid,uuid[],text)') is not null as compatibilidade_ok,
  to_regprocedure('public.avaliar_conclusao(uuid,boolean,text)') is not null as avaliar_ok;
