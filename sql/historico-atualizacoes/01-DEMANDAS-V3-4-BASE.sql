-- ============================================================
-- PMG CONNECT — DEMANDAS V3.3 / OPERAÇÃO DO SETOR
-- Prioridade imediata, aprovação de conclusão, transferências,
-- Academia PMG, projetos e base para relatórios mensais.
-- ============================================================
-- Execute DEPOIS de demandas_supabase.sql e demandas_v2_migracao.sql.
-- Pode ser executado novamente durante ajustes.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- ENUMS / COMPATIBILIDADE
-- ------------------------------------------------------------
-- Os valores novos são confirmados antes de serem usados pelo restante
-- da migração. PostgreSQL não permite usar um enum recém-adicionado no
-- mesmo bloco transacional em que ele foi criado.
begin;
alter type public.prioridade_tarefa add value if not exists 'imediata' after 'urgente';
alter type public.tipo_notificacao add value if not exists 'prazo_atrasado';
alter type public.tipo_notificacao add value if not exists 'lembrete';
alter type public.tipo_notificacao add value if not exists 'demanda_imediata';
alter type public.tipo_notificacao add value if not exists 'avaliacao_pendente';
alter type public.tipo_notificacao add value if not exists 'avaliacao_aprovada';
alter type public.tipo_notificacao add value if not exists 'avaliacao_ajustes';
alter type public.tipo_notificacao add value if not exists 'transferencia';
commit;

-- ------------------------------------------------------------
-- EVOLUÇÃO DAS DEMANDAS
-- ------------------------------------------------------------
alter table public.tarefas add column if not exists alerta_para_todos boolean not null default false;
alter table public.tarefas add column if not exists avaliacao_status text not null default 'nao_solicitada';
alter table public.tarefas add column if not exists avaliacao_observacao text;
alter table public.tarefas add column if not exists avaliado_por uuid references public.colaboradores(id) on delete set null;
alter table public.tarefas add column if not exists avaliado_em timestamptz;
alter table public.tarefas add column if not exists ultima_transferencia_em timestamptz;
alter table public.tarefas add column if not exists projeto text;

create index if not exists idx_tarefas_projeto on public.tarefas(projeto) where projeto is not null and projeto <> '';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tarefas'::regclass
      and conname = 'tarefas_avaliacao_status_valido'
  ) then
    alter table public.tarefas
      add constraint tarefas_avaliacao_status_valido
      check (avaliacao_status in ('nao_solicitada', 'pendente', 'aprovada', 'ajustes'));
  end if;
end
$$;

create index if not exists idx_tarefas_avaliacao
  on public.tarefas(avaliacao_status, atualizado_em desc)
  where arquivada_em is null;

create index if not exists idx_tarefas_imediatas
  on public.tarefas(prioridade, atualizado_em desc)
  where prioridade = 'imediata'::public.prioridade_tarefa and arquivada_em is null;

-- ------------------------------------------------------------
-- HISTÓRICO DE TRANSFERÊNCIAS
-- ------------------------------------------------------------
create table if not exists public.transferencias_tarefa (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid references public.tarefas(id) on delete cascade not null,
  de_colaborador_id uuid references public.colaboradores(id) on delete set null,
  para_colaborador_id uuid references public.colaboradores(id) on delete set null,
  horas_transferidas numeric(8,2) not null default 0,
  observacao text,
  transferido_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint transferencias_horas_validas check (horas_transferidas >= 0)
);

create index if not exists idx_transferencias_tarefa
  on public.transferencias_tarefa(tarefa_id, criado_em desc);
create index if not exists idx_transferencias_para
  on public.transferencias_tarefa(para_colaborador_id, criado_em desc);
create index if not exists idx_transferencias_de
  on public.transferencias_tarefa(de_colaborador_id, criado_em desc);

-- Permite registrar eventos novos no histórico existente.
alter table public.atividades_tarefa drop constraint if exists atividades_tarefa_tipo_valido;
alter table public.atividades_tarefa
  add constraint atividades_tarefa_tipo_valido check (
    tipo in (
      'criada', 'editada', 'status', 'atribuida', 'comentario',
      'arquivada', 'restaurada', 'transferida', 'avaliacao'
    )
  );

-- ------------------------------------------------------------
-- ACADEMIA PMG
-- ------------------------------------------------------------
create table if not exists public.academia_config (
  id smallint primary key default 1,
  forms_url text,
  horario_abertura time not null default time '08:00',
  horario_fechamento time not null default time '18:00',
  observacoes text,
  atualizado_por uuid references public.colaboradores(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  constraint academia_config_singleton check (id = 1),
  constraint academia_config_horario check (horario_fechamento > horario_abertura)
);

insert into public.academia_config (id) values (1)
on conflict (id) do nothing;

create table if not exists public.academia_reservas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  solicitante text not null,
  setor text,
  email text,
  telefone text,
  finalidade text,
  inicio_em timestamptz not null,
  fim_em timestamptz not null,
  participantes integer,
  status text not null default 'solicitada',
  observacoes text,
  origem text not null default 'manual',
  forms_linha_chave text,
  forms_payload jsonb not null default '{}'::jsonb,
  criado_por uuid references public.colaboradores(id) on delete set null,
  aprovado_por uuid references public.colaboradores(id) on delete set null,
  aprovado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint academia_titulo_nao_vazio check (length(trim(titulo)) > 0),
  constraint academia_solicitante_nao_vazio check (length(trim(solicitante)) > 0),
  constraint academia_periodo_valido check (fim_em > inicio_em),
  constraint academia_participantes_validos check (participantes is null or participantes >= 0),
  constraint academia_status_valido check (status in ('solicitada', 'aprovada', 'recusada', 'cancelada')),
  constraint academia_origem_valida check (origem in ('manual', 'forms'))
);

create unique index if not exists idx_academia_forms_linha
  on public.academia_reservas(forms_linha_chave)
  where forms_linha_chave is not null;
create index if not exists idx_academia_periodo
  on public.academia_reservas(inicio_em, fim_em);
create index if not exists idx_academia_status
  on public.academia_reservas(status, inicio_em);

-- Atualização automática de data da Academia.
drop trigger if exists trg_academia_reservas_atualizado_em on public.academia_reservas;
create trigger trg_academia_reservas_atualizado_em
before update on public.academia_reservas
for each row execute function public.set_atualizado_em();

-- ------------------------------------------------------------
-- RPCs V3 DE DEMANDAS
-- ------------------------------------------------------------
drop function if exists public.criar_tarefa_v3(text, text, public.prioridade_tarefa, uuid, timestamptz, timestamptz, text[], text, numeric, boolean);
drop function if exists public.criar_tarefa_v3(text, text, public.prioridade_tarefa, uuid, timestamptz, timestamptz, text[], text, numeric, boolean, text);
create function public.criar_tarefa_v3(
  p_titulo text,
  p_descricao text,
  p_prioridade public.prioridade_tarefa,
  p_responsavel_id uuid,
  p_prazo_em timestamptz,
  p_lembrar_em timestamptz,
  p_tags text[],
  p_tamanho text,
  p_estimativa_horas numeric,
  p_alerta_para_todos boolean default false,
  p_projeto text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_ator uuid := public.meu_colaborador_id();
  v_prioridade public.prioridade_tarefa := coalesce(p_prioridade, 'media'::public.prioridade_tarefa);
begin
  if v_ator is null then raise exception 'Colaborador não encontrado ou inativo'; end if;
  if not public.sou_gestor() then raise exception 'Somente gestores podem criar demandas'; end if;
  if p_titulo is null or length(trim(p_titulo)) = 0 then raise exception 'O título da demanda é obrigatório'; end if;
  if p_tamanho not in ('rapida', 'media', 'grande') then raise exception 'Tamanho de demanda inválido'; end if;
  if p_estimativa_horas is not null and p_estimativa_horas < 0 then raise exception 'A estimativa não pode ser negativa'; end if;
  if p_responsavel_id is not null and not exists (
    select 1 from public.colaboradores c where c.id = p_responsavel_id and c.ativo = true
  ) then raise exception 'Responsável inválido ou inativo'; end if;
  if v_prioridade <> 'imediata'::public.prioridade_tarefa and coalesce(p_alerta_para_todos, false) then
    raise exception 'O alerta para toda a equipe só pode ser usado em demandas imediatas';
  end if;

  insert into public.tarefas (
    titulo, descricao, prioridade, responsavel_id, criado_por, prazo, prazo_em,
    lembrar_em, tags, tamanho, estimativa_horas, alerta_para_todos, projeto,
    lembrete_enviado_em, atraso_notificado_em, avaliacao_status
  ) values (
    trim(p_titulo), nullif(trim(p_descricao), ''), v_prioridade,
    p_responsavel_id, v_ator,
    case when p_prazo_em is null then null else (p_prazo_em at time zone 'America/Sao_Paulo')::date end,
    p_prazo_em, p_lembrar_em, coalesce(p_tags, '{}'::text[]), coalesce(p_tamanho, 'media'),
    p_estimativa_horas, coalesce(p_alerta_para_todos, false), nullif(trim(p_projeto), ''), null, null, 'nao_solicitada'
  ) returning id into v_id;

  return v_id;
end;
$$;

drop function if exists public.editar_tarefa_v3(uuid, text, text, public.prioridade_tarefa, uuid, timestamptz, timestamptz, text[], text, numeric, boolean);
drop function if exists public.editar_tarefa_v3(uuid, text, text, public.prioridade_tarefa, uuid, timestamptz, timestamptz, text[], text, numeric, boolean, text);
create function public.editar_tarefa_v3(
  p_tarefa_id uuid,
  p_titulo text,
  p_descricao text,
  p_prioridade public.prioridade_tarefa,
  p_responsavel_id uuid,
  p_prazo_em timestamptz,
  p_lembrar_em timestamptz,
  p_tags text[],
  p_tamanho text,
  p_estimativa_horas numeric,
  p_alerta_para_todos boolean default false,
  p_projeto text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prazo_antigo timestamptz;
  v_lembrete_antigo timestamptz;
  v_prioridade public.prioridade_tarefa := coalesce(p_prioridade, 'media'::public.prioridade_tarefa);
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem editar demandas'; end if;
  if p_titulo is null or length(trim(p_titulo)) = 0 then raise exception 'O título da demanda é obrigatório'; end if;
  if p_tamanho not in ('rapida', 'media', 'grande') then raise exception 'Tamanho de demanda inválido'; end if;
  if p_estimativa_horas is not null and p_estimativa_horas < 0 then raise exception 'A estimativa não pode ser negativa'; end if;
  if p_responsavel_id is not null and not exists (
    select 1 from public.colaboradores c where c.id = p_responsavel_id and c.ativo = true
  ) then raise exception 'Responsável inválido ou inativo'; end if;
  if v_prioridade <> 'imediata'::public.prioridade_tarefa and coalesce(p_alerta_para_todos, false) then
    raise exception 'O alerta para toda a equipe só pode ser usado em demandas imediatas';
  end if;

  select t.prazo_em, t.lembrar_em into v_prazo_antigo, v_lembrete_antigo
  from public.tarefas t where t.id = p_tarefa_id and t.arquivada_em is null;
  if not found then raise exception 'Demanda não encontrada ou arquivada'; end if;

  update public.tarefas
  set titulo = trim(p_titulo),
      descricao = nullif(trim(p_descricao), ''),
      prioridade = v_prioridade,
      responsavel_id = p_responsavel_id,
      prazo = case when p_prazo_em is null then null else (p_prazo_em at time zone 'America/Sao_Paulo')::date end,
      prazo_em = p_prazo_em,
      lembrar_em = p_lembrar_em,
      tags = coalesce(p_tags, '{}'::text[]),
      tamanho = coalesce(p_tamanho, 'media'),
      estimativa_horas = p_estimativa_horas,
      alerta_para_todos = coalesce(p_alerta_para_todos, false),
      projeto = nullif(trim(p_projeto), ''),
      lembrete_enviado_em = case when p_lembrar_em is distinct from v_lembrete_antigo then null else lembrete_enviado_em end,
      atraso_notificado_em = case when p_prazo_em is distinct from v_prazo_antigo then null else atraso_notificado_em end
  where id = p_tarefa_id;
end;
$$;

-- Status: colaborador envia para REVISÃO; somente gestor aprova a CONCLUSÃO.
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
  v_prioridade public.prioridade_tarefa;
  v_alerta_para_todos boolean;
  v_eh_gestor boolean := public.sou_gestor();
begin
  if v_ator_id is null then raise exception 'Colaborador não encontrado ou inativo'; end if;
  if p_status is null then raise exception 'O status é obrigatório'; end if;

  select t.responsavel_id, t.arquivada_em, t.prioridade, coalesce(t.alerta_para_todos, false)
  into v_responsavel_id, v_arquivada_em, v_prioridade, v_alerta_para_todos
  from public.tarefas t where t.id = p_tarefa_id for update;
  if not found then raise exception 'Tarefa não encontrada'; end if;
  if v_arquivada_em is not null then raise exception 'Não é possível alterar uma tarefa arquivada'; end if;
  if not v_eh_gestor and v_ator_id is distinct from v_responsavel_id then
    -- Uma demanda IMEDIATA disparada para toda a equipe pode começar sem
    -- responsável definido. A primeira pessoa que clicar em Iniciar assume
    -- a responsabilidade e, a partir daí, o fluxo volta a ser individual.
    if v_responsavel_id is null
       and v_prioridade = 'imediata'::public.prioridade_tarefa
       and v_alerta_para_todos
       and p_status = 'andamento'::public.status_tarefa then
      update public.tarefas
      set responsavel_id = v_ator_id,
          status = 'andamento'::public.status_tarefa,
          avaliacao_status = 'nao_solicitada'
      where id = p_tarefa_id;
      return;
    end if;
    raise exception 'Você só pode alterar tarefas atribuídas a você';
  end if;
  if p_status = 'concluida'::public.status_tarefa then
    raise exception 'A conclusão precisa ser avaliada por um gestor';
  end if;

  update public.tarefas
  set status = p_status,
      avaliacao_status = case when p_status = 'revisao'::public.status_tarefa then 'pendente' else 'nao_solicitada' end,
      avaliacao_observacao = case when p_status = 'revisao'::public.status_tarefa then null else avaliacao_observacao end,
      avaliado_por = case when p_status = 'revisao'::public.status_tarefa then null else avaliado_por end,
      avaliado_em = case when p_status = 'revisao'::public.status_tarefa then null else avaliado_em end
  where id = p_tarefa_id;
end;
$$;

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
  v_titulo text;
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem avaliar conclusões'; end if;

  select t.responsavel_id, t.titulo into v_responsavel, v_titulo
  from public.tarefas t
  where t.id = p_tarefa_id and t.arquivada_em is null and t.status = 'revisao'::public.status_tarefa;
  if not found then raise exception 'A demanda não está aguardando avaliação'; end if;

  update public.tarefas
  set status = case when p_aprovado then 'concluida'::public.status_tarefa else 'andamento'::public.status_tarefa end,
      avaliacao_status = case when p_aprovado then 'aprovada' else 'ajustes' end,
      avaliacao_observacao = nullif(trim(coalesce(p_observacao, '')), ''),
      avaliado_por = v_gestor,
      avaliado_em = now()
  where id = p_tarefa_id;

  insert into public.atividades_tarefa (tarefa_id, ator_id, tipo, detalhes)
  values (p_tarefa_id, v_gestor, 'avaliacao', jsonb_build_object(
    'resultado', case when p_aprovado then 'aprovada' else 'ajustes' end,
    'observacao', nullif(trim(coalesce(p_observacao, '')), '')
  ));

  if v_responsavel is not null and v_responsavel is distinct from v_gestor then
    insert into public.notificacoes (tarefa_id, colaborador_id, tipo, mensagem, chave_deduplicacao)
    values (
      p_tarefa_id,
      v_responsavel,
      case when p_aprovado then 'avaliacao_aprovada'::public.tipo_notificacao else 'avaliacao_ajustes'::public.tipo_notificacao end,
      case when p_aprovado then 'A conclusão da sua demanda foi aprovada' else 'A demanda voltou para ajustes' end,
      concat('avaliacao:', p_tarefa_id, ':', v_responsavel, ':', case when p_aprovado then 'aprovada' else 'ajustes' end, ':', extract(epoch from now())::bigint)
    ) on conflict (chave_deduplicacao) do nothing;
  end if;
end;
$$;

create or replace function public.transferir_tarefa(
  p_tarefa_id uuid,
  p_novo_responsavel_id uuid,
  p_observacao text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gestor uuid := public.meu_colaborador_id();
  v_antigo uuid;
  v_horas numeric(8,2);
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem transferir demandas'; end if;
  if p_novo_responsavel_id is null then raise exception 'Selecione o novo responsável'; end if;
  if not exists (select 1 from public.colaboradores c where c.id = p_novo_responsavel_id and c.ativo = true) then
    raise exception 'O novo responsável não existe ou está inativo';
  end if;

  select t.responsavel_id, coalesce(t.estimativa_horas, 0)
  into v_antigo, v_horas
  from public.tarefas t
  where t.id = p_tarefa_id and t.arquivada_em is null and t.status <> 'concluida'::public.status_tarefa;
  if not found then raise exception 'Demanda não encontrada, arquivada ou já concluída'; end if;
  if v_antigo is not distinct from p_novo_responsavel_id then raise exception 'A demanda já está com essa pessoa'; end if;

  update public.tarefas
  set responsavel_id = p_novo_responsavel_id,
      ultima_transferencia_em = now()
  where id = p_tarefa_id;

  insert into public.transferencias_tarefa (
    tarefa_id, de_colaborador_id, para_colaborador_id, horas_transferidas, observacao, transferido_por
  ) values (
    p_tarefa_id, v_antigo, p_novo_responsavel_id, v_horas,
    nullif(trim(coalesce(p_observacao, '')), ''), v_gestor
  );

  insert into public.atividades_tarefa (tarefa_id, ator_id, tipo, detalhes)
  values (p_tarefa_id, v_gestor, 'transferida', jsonb_build_object(
    'de', v_antigo,
    'para', p_novo_responsavel_id,
    'horas', v_horas,
    'observacao', nullif(trim(coalesce(p_observacao, '')), '')
  ));
end;
$$;

-- ------------------------------------------------------------
-- TRIGGERS: HISTÓRICO + NOTIFICAÇÕES V3
-- ------------------------------------------------------------
create or replace function public.registrar_atividade_tarefa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
begin
  if tg_op = 'INSERT' then
    insert into public.atividades_tarefa (tarefa_id, ator_id, tipo, detalhes)
    values (new.id, coalesce(v_ator, new.criado_por), 'criada', jsonb_build_object(
      'responsavel_id', new.responsavel_id,
      'prioridade', new.prioridade,
      'alerta_para_todos', coalesce(new.alerta_para_todos, false)
    ));
    return new;
  end if;

  if new.arquivada_em is distinct from old.arquivada_em then
    insert into public.atividades_tarefa (tarefa_id, ator_id, tipo, detalhes)
    values (new.id, v_ator, case when new.arquivada_em is null then 'restaurada' else 'arquivada' end, '{}'::jsonb);
  end if;

  if new.responsavel_id is distinct from old.responsavel_id
     and new.ultima_transferencia_em is not distinct from old.ultima_transferencia_em then
    insert into public.atividades_tarefa (tarefa_id, ator_id, tipo, detalhes)
    values (new.id, v_ator, 'atribuida', jsonb_build_object('de', old.responsavel_id, 'para', new.responsavel_id));
  end if;

  if new.status is distinct from old.status then
    insert into public.atividades_tarefa (tarefa_id, ator_id, tipo, detalhes)
    values (new.id, v_ator, 'status', jsonb_build_object('de', old.status, 'para', new.status));
  end if;

  if row(new.titulo, new.descricao, new.prioridade, new.prazo_em, new.lembrar_em, new.tags, new.tamanho, new.estimativa_horas, new.alerta_para_todos)
     is distinct from
     row(old.titulo, old.descricao, old.prioridade, old.prazo_em, old.lembrar_em, old.tags, old.tamanho, old.estimativa_horas, old.alerta_para_todos) then
    insert into public.atividades_tarefa (tarefa_id, ator_id, tipo, detalhes)
    values (new.id, v_ator, 'editada', jsonb_build_object(
      'prazo_anterior', old.prazo_em,
      'prazo_novo', new.prazo_em,
      'prioridade_anterior', old.prioridade,
      'prioridade_nova', new.prioridade,
      'alerta_para_todos_anterior', old.alerta_para_todos,
      'alerta_para_todos_novo', new.alerta_para_todos
    ));
  end if;

  return new;
end;
$$;

create or replace function public.notificar_tarefa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator_id uuid := public.meu_colaborador_id();
  v_destinatario uuid;
  v_tipo public.tipo_notificacao;
begin
  if tg_op = 'INSERT' then
    if new.prioridade = 'imediata'::public.prioridade_tarefa and coalesce(new.alerta_para_todos, false) then
      for v_destinatario in
        select c.id from public.colaboradores c where c.ativo = true and c.id is distinct from v_ator_id
      loop
        insert into public.notificacoes (tarefa_id, colaborador_id, tipo, mensagem, chave_deduplicacao)
        values (new.id, v_destinatario, 'demanda_imediata'::public.tipo_notificacao,
          'DEMANDA IMEDIATA para a equipe. Interrompa as demais prioridades e verifique agora.',
          concat('imediata:', new.id, ':', v_destinatario))
        on conflict (chave_deduplicacao) do nothing;
      end loop;
    elsif new.responsavel_id is not null and new.responsavel_id is distinct from v_ator_id then
      v_tipo := case when new.prioridade = 'imediata'::public.prioridade_tarefa
        then 'demanda_imediata'::public.tipo_notificacao
        else 'nova_tarefa'::public.tipo_notificacao end;
      insert into public.notificacoes (tarefa_id, colaborador_id, tipo, mensagem, chave_deduplicacao)
      values (new.id, new.responsavel_id, v_tipo,
        case when v_tipo = 'demanda_imediata'::public.tipo_notificacao
          then 'DEMANDA IMEDIATA. Esta solicitação precisa ser tratada agora.' else null end,
        concat('nova:', new.id, ':', new.responsavel_id, ':', v_tipo::text))
      on conflict (chave_deduplicacao) do nothing;
    end if;

  elsif tg_op = 'UPDATE' and new.arquivada_em is null then
    if new.responsavel_id is distinct from old.responsavel_id
       and new.responsavel_id is not null
       and new.responsavel_id is distinct from v_ator_id then
      insert into public.notificacoes (tarefa_id, colaborador_id, tipo, mensagem, chave_deduplicacao)
      values (new.id, new.responsavel_id,
        case when new.ultima_transferencia_em is distinct from old.ultima_transferencia_em then 'transferencia'::public.tipo_notificacao
             when new.prioridade = 'imediata'::public.prioridade_tarefa then 'demanda_imediata'::public.tipo_notificacao
             else 'nova_tarefa'::public.tipo_notificacao end,
        case when new.ultima_transferencia_em is distinct from old.ultima_transferencia_em then 'Uma demanda foi transferida para você'
             when new.prioridade = 'imediata'::public.prioridade_tarefa then 'DEMANDA IMEDIATA. Esta solicitação precisa ser tratada agora.'
             else null end,
        concat('atribuicao:', new.id, ':', new.responsavel_id, ':', extract(epoch from now())::bigint))
      on conflict (chave_deduplicacao) do nothing;
    end if;

    if new.status is distinct from old.status then
      if new.criado_por is distinct from v_ator_id then
        insert into public.notificacoes (tarefa_id, colaborador_id, tipo, mensagem, chave_deduplicacao)
        values (new.id, new.criado_por, 'status_mudou'::public.tipo_notificacao, null,
          concat('status:', new.id, ':', new.criado_por, ':', new.status::text, ':', extract(epoch from now())::bigint))
        on conflict (chave_deduplicacao) do nothing;
      end if;

      if new.status = 'revisao'::public.status_tarefa then
        for v_destinatario in
          select c.id from public.colaboradores c
          where c.ativo = true and c.role = 'gestor'::public.role_colaborador and c.id is distinct from v_ator_id
        loop
          insert into public.notificacoes (tarefa_id, colaborador_id, tipo, mensagem, chave_deduplicacao)
          values (new.id, v_destinatario, 'avaliacao_pendente'::public.tipo_notificacao,
            'Uma demanda foi enviada para avaliação de conclusão',
            concat('avaliacao-pendente:', new.id, ':', v_destinatario, ':', extract(epoch from now())::bigint))
          on conflict (chave_deduplicacao) do nothing;
        end loop;
      end if;
    end if;

    if new.prioridade = 'imediata'::public.prioridade_tarefa
       and coalesce(new.alerta_para_todos, false)
       and (old.prioridade is distinct from new.prioridade or old.alerta_para_todos is distinct from new.alerta_para_todos) then
      for v_destinatario in
        select c.id from public.colaboradores c where c.ativo = true and c.id is distinct from v_ator_id
      loop
        insert into public.notificacoes (tarefa_id, colaborador_id, tipo, mensagem, chave_deduplicacao)
        values (new.id, v_destinatario, 'demanda_imediata'::public.tipo_notificacao,
          'DEMANDA IMEDIATA para a equipe. Verifique agora.',
          concat('imediata-edit:', new.id, ':', v_destinatario, ':', extract(epoch from now())::bigint))
        on conflict (chave_deduplicacao) do nothing;
      end loop;
    end if;
  end if;

  return new;
end;
$$;

-- ------------------------------------------------------------
-- RPCs DA ACADEMIA PMG
-- ------------------------------------------------------------
create or replace function public.salvar_config_academia(
  p_forms_url text,
  p_horario_abertura time,
  p_horario_fechamento time,
  p_observacoes text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gestor uuid := public.meu_colaborador_id();
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem configurar a Academia PMG'; end if;
  if p_horario_fechamento <= p_horario_abertura then raise exception 'O horário de fechamento deve ser posterior à abertura'; end if;

  insert into public.academia_config (id, forms_url, horario_abertura, horario_fechamento, observacoes, atualizado_por, atualizado_em)
  values (1, nullif(trim(coalesce(p_forms_url, '')), ''), p_horario_abertura, p_horario_fechamento,
    nullif(trim(coalesce(p_observacoes, '')), ''), v_gestor, now())
  on conflict (id) do update set
    forms_url = excluded.forms_url,
    horario_abertura = excluded.horario_abertura,
    horario_fechamento = excluded.horario_fechamento,
    observacoes = excluded.observacoes,
    atualizado_por = excluded.atualizado_por,
    atualizado_em = now();
end;
$$;

create or replace function public.salvar_reserva_academia(
  p_id uuid,
  p_titulo text,
  p_solicitante text,
  p_setor text,
  p_email text,
  p_telefone text,
  p_finalidade text,
  p_inicio_em timestamptz,
  p_fim_em timestamptz,
  p_participantes integer,
  p_observacoes text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gestor uuid := public.meu_colaborador_id();
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_status_atual text;
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem gerenciar reservas da Academia PMG'; end if;
  if p_titulo is null or length(trim(p_titulo)) = 0 then raise exception 'Informe o título do uso do espaço'; end if;
  if p_solicitante is null or length(trim(p_solicitante)) = 0 then raise exception 'Informe o solicitante'; end if;
  if p_inicio_em is null or p_fim_em is null or p_fim_em <= p_inicio_em then raise exception 'Informe um período válido'; end if;

  if p_id is null then
    if exists (
      select 1 from public.academia_reservas r
      where r.status = 'aprovada' and r.inicio_em < p_fim_em and r.fim_em > p_inicio_em
    ) then
      raise exception 'Já existe uma reserva aprovada que conflita com este horário';
    end if;
  else
    select status into v_status_atual from public.academia_reservas where id = p_id;
    if v_status_atual = 'aprovada' and exists (
      select 1 from public.academia_reservas r
      where r.id <> p_id and r.status = 'aprovada' and r.inicio_em < p_fim_em and r.fim_em > p_inicio_em
    ) then
      raise exception 'A alteração conflita com outra reserva aprovada';
    end if;
  end if;

  insert into public.academia_reservas (
    id, titulo, solicitante, setor, email, telefone, finalidade, inicio_em, fim_em,
    participantes, status, observacoes, origem, criado_por, aprovado_por, aprovado_em
  ) values (
    v_id, trim(p_titulo), trim(p_solicitante), nullif(trim(coalesce(p_setor, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''), nullif(trim(coalesce(p_telefone, '')), ''),
    nullif(trim(coalesce(p_finalidade, '')), ''), p_inicio_em, p_fim_em, p_participantes,
    'aprovada', nullif(trim(coalesce(p_observacoes, '')), ''), 'manual', v_gestor, v_gestor, now()
  )
  on conflict (id) do update set
    titulo = excluded.titulo,
    solicitante = excluded.solicitante,
    setor = excluded.setor,
    email = excluded.email,
    telefone = excluded.telefone,
    finalidade = excluded.finalidade,
    inicio_em = excluded.inicio_em,
    fim_em = excluded.fim_em,
    participantes = excluded.participantes,
    observacoes = excluded.observacoes,
    atualizado_em = now();

  return v_id;
end;
$$;

create or replace function public.atualizar_status_reserva_academia(
  p_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gestor uuid := public.meu_colaborador_id();
  v_inicio timestamptz;
  v_fim timestamptz;
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem aprovar, recusar ou cancelar reservas'; end if;
  if p_status not in ('solicitada', 'aprovada', 'recusada', 'cancelada') then raise exception 'Status de reserva inválido'; end if;

  select inicio_em, fim_em into v_inicio, v_fim from public.academia_reservas where id = p_id;
  if not found then raise exception 'Reserva não encontrada'; end if;

  if p_status = 'aprovada' and exists (
    select 1 from public.academia_reservas r
    where r.id <> p_id and r.status = 'aprovada'
      and r.inicio_em < v_fim and r.fim_em > v_inicio
  ) then
    raise exception 'Já existe uma reserva aprovada que conflita com este horário';
  end if;

  update public.academia_reservas
  set status = p_status,
      aprovado_por = case when p_status = 'aprovada' then v_gestor else aprovado_por end,
      aprovado_em = case when p_status = 'aprovada' then now() else aprovado_em end,
      atualizado_em = now()
  where id = p_id;
end;
$$;

create or replace function public.importar_reserva_academia_forms(
  p_chave text,
  p_titulo text,
  p_solicitante text,
  p_setor text,
  p_email text,
  p_telefone text,
  p_finalidade text,
  p_inicio_em timestamptz,
  p_fim_em timestamptz,
  p_participantes integer,
  p_observacoes text,
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gestor uuid := public.meu_colaborador_id();
  v_id uuid;
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem importar respostas do Forms'; end if;
  if p_chave is null or length(trim(p_chave)) = 0 then raise exception 'A resposta do Forms precisa de uma chave de identificação'; end if;
  if p_titulo is null or length(trim(p_titulo)) = 0 then raise exception 'Informe o título da reserva'; end if;
  if p_solicitante is null or length(trim(p_solicitante)) = 0 then raise exception 'Informe o solicitante'; end if;
  if p_inicio_em is null or p_fim_em is null or p_fim_em <= p_inicio_em then raise exception 'Período inválido na resposta do Forms'; end if;

  insert into public.academia_reservas (
    titulo, solicitante, setor, email, telefone, finalidade, inicio_em, fim_em,
    participantes, status, observacoes, origem, forms_linha_chave, forms_payload, criado_por
  ) values (
    trim(p_titulo), trim(p_solicitante), nullif(trim(coalesce(p_setor, '')), ''),
    nullif(trim(coalesce(p_email, '')), ''), nullif(trim(coalesce(p_telefone, '')), ''),
    nullif(trim(coalesce(p_finalidade, '')), ''), p_inicio_em, p_fim_em, p_participantes,
    'solicitada', nullif(trim(coalesce(p_observacoes, '')), ''), 'forms', trim(p_chave),
    coalesce(p_payload, '{}'::jsonb), v_gestor
  )
  on conflict (forms_linha_chave) where forms_linha_chave is not null
  do update set
    titulo = excluded.titulo,
    solicitante = excluded.solicitante,
    setor = excluded.setor,
    email = excluded.email,
    telefone = excluded.telefone,
    finalidade = excluded.finalidade,
    inicio_em = excluded.inicio_em,
    fim_em = excluded.fim_em,
    participantes = excluded.participantes,
    observacoes = excluded.observacoes,
    forms_payload = excluded.forms_payload,
    atualizado_em = now()
  returning id into v_id;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- RLS / PERMISSÕES
-- ------------------------------------------------------------
alter table public.transferencias_tarefa enable row level security;
alter table public.academia_config enable row level security;
alter table public.academia_reservas enable row level security;

drop policy if exists "autenticados leem transferencias" on public.transferencias_tarefa;
create policy "autenticados leem transferencias"
on public.transferencias_tarefa for select to authenticated using (true);

drop policy if exists "autenticados leem academia config" on public.academia_config;
create policy "autenticados leem academia config"
on public.academia_config for select to authenticated using (true);

drop policy if exists "autenticados leem reservas academia" on public.academia_reservas;
create policy "autenticados leem reservas academia"
on public.academia_reservas for select to authenticated using (true);

revoke all privileges on table public.transferencias_tarefa from anon, authenticated;
revoke all privileges on table public.academia_config from anon, authenticated;
revoke all privileges on table public.academia_reservas from anon, authenticated;
grant select on table public.transferencias_tarefa to authenticated;
grant select on table public.academia_config to authenticated;
grant select on table public.academia_reservas to authenticated;

revoke all on function public.criar_tarefa_v3(text, text, public.prioridade_tarefa, uuid, timestamptz, timestamptz, text[], text, numeric, boolean, text) from public, anon;
revoke all on function public.editar_tarefa_v3(uuid, text, text, public.prioridade_tarefa, uuid, timestamptz, timestamptz, text[], text, numeric, boolean, text) from public, anon;
revoke all on function public.avaliar_conclusao(uuid, boolean, text) from public, anon;
revoke all on function public.transferir_tarefa(uuid, uuid, text) from public, anon;
revoke all on function public.salvar_config_academia(text, time, time, text) from public, anon;
revoke all on function public.salvar_reserva_academia(uuid, text, text, text, text, text, text, timestamptz, timestamptz, integer, text) from public, anon;
revoke all on function public.atualizar_status_reserva_academia(uuid, text) from public, anon;
revoke all on function public.importar_reserva_academia_forms(text, text, text, text, text, text, text, timestamptz, timestamptz, integer, text, jsonb) from public, anon;

grant execute on function public.criar_tarefa_v3(text, text, public.prioridade_tarefa, uuid, timestamptz, timestamptz, text[], text, numeric, boolean, text) to authenticated;
grant execute on function public.editar_tarefa_v3(uuid, text, text, public.prioridade_tarefa, uuid, timestamptz, timestamptz, text[], text, numeric, boolean, text) to authenticated;
grant execute on function public.avaliar_conclusao(uuid, boolean, text) to authenticated;
grant execute on function public.transferir_tarefa(uuid, uuid, text) to authenticated;
grant execute on function public.salvar_config_academia(text, time, time, text) to authenticated;
grant execute on function public.salvar_reserva_academia(uuid, text, text, text, text, text, text, timestamptz, timestamptz, integer, text) to authenticated;
grant execute on function public.atualizar_status_reserva_academia(uuid, text) to authenticated;
grant execute on function public.importar_reserva_academia_forms(text, text, text, text, text, text, text, timestamptz, timestamptz, integer, text, jsonb) to authenticated;

-- Realtime para a Agenda da Academia e transferências.
alter table public.academia_reservas replica identity full;
alter table public.transferencias_tarefa replica identity full;

do $$
declare
  v_tabela text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_tabela in array array['academia_reservas', 'transferencias_tarefa']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = v_tabela
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_tabela);
      end if;
    end loop;
  end if;
end
$$;

-- Diagnóstico final.
select
  (select count(*) from public.academia_reservas) as reservas_academia,
  (select count(*) from public.transferencias_tarefa) as transferencias_registradas,
  (select count(*) from public.tarefas where prioridade = 'imediata'::public.prioridade_tarefa and arquivada_em is null) as demandas_imediatas_ativas;
-- ============================================================
-- PMG CONNECT — DEMANDAS V3.4 / PRODUTIVIDADE
-- Modelos, dependências, checklist, tempo real x estimado,
-- fechamento mensal congelado e base para automação do Forms.
-- ============================================================
-- Execute DEPOIS da V3.3. Idempotente para reaplicações.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- CHECKLIST NA PRÓPRIA DEMANDA
-- ------------------------------------------------------------
alter table public.tarefas
  add column if not exists checklist jsonb not null default '[]'::jsonb;

update public.tarefas
set checklist = '[]'::jsonb
where checklist is null or jsonb_typeof(checklist) <> 'array';

-- ------------------------------------------------------------
-- MODELOS DE DEMANDA
-- ------------------------------------------------------------
create table if not exists public.modelos_demanda (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  titulo_base text,
  descricao_padrao text,
  prioridade public.prioridade_tarefa not null default 'media',
  tamanho text not null default 'media',
  estimativa_horas numeric(8,2),
  prazo_horas integer,
  tags text[] not null default '{}'::text[],
  projeto text,
  checklist jsonb not null default '[]'::jsonb,
  sistema boolean not null default false,
  ativo boolean not null default true,
  criado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint modelos_nome_nao_vazio check (length(trim(nome)) > 0),
  constraint modelos_tamanho_valido check (tamanho in ('rapida','media','grande')),
  constraint modelos_estimativa_valida check (estimativa_horas is null or estimativa_horas >= 0),
  constraint modelos_prazo_valido check (prazo_horas is null or prazo_horas >= 0),
  constraint modelos_checklist_array check (jsonb_typeof(checklist) = 'array')
);

create unique index if not exists idx_modelos_demanda_nome_ci
  on public.modelos_demanda (lower(nome));
create index if not exists idx_modelos_demanda_ativos
  on public.modelos_demanda (ativo, atualizado_em desc);

drop trigger if exists trg_modelos_demanda_atualizado_em on public.modelos_demanda;
create trigger trg_modelos_demanda_atualizado_em
before update on public.modelos_demanda
for each row execute function public.set_atualizado_em();

-- Modelos iniciais. Não sobrescreve customizações feitas depois.
insert into public.modelos_demanda
  (nome, titulo_base, descricao_padrao, prioridade, tamanho, estimativa_horas, prazo_horas, tags, projeto, checklist, sistema)
values
  (
    'Campanha mensal', 'Campanha mensal — ',
    'Planejar, produzir, revisar e publicar a campanha mensal conforme briefing aprovado.',
    'alta'::public.prioridade_tarefa, 'grande', 8, 120,
    array['campanha','mensal'], 'Campanhas',
    '[{"texto":"Validar briefing","concluido":false},{"texto":"Produzir primeira versão","concluido":false},{"texto":"Revisar internamente","concluido":false},{"texto":"Enviar para aprovação","concluido":false},{"texto":"Publicar/entregar","concluido":false}]'::jsonb,
    true
  ),
  (
    'Material para fornecedor', 'Material fornecedor — ',
    'Produzir material solicitado pelo fornecedor com briefing, referências, validação e entrega final.',
    'media'::public.prioridade_tarefa, 'media', 4, 72,
    array['fornecedor','material'], 'Fornecedores',
    '[{"texto":"Receber briefing completo","concluido":false},{"texto":"Separar referências e arquivos","concluido":false},{"texto":"Produzir material","concluido":false},{"texto":"Validar com solicitante","concluido":false},{"texto":"Entregar arquivo final","concluido":false}]'::jsonb,
    true
  ),
  (
    'Evento interno', 'Evento interno — ',
    'Organizar comunicação e materiais de apoio para evento interno da PMG.',
    'alta'::public.prioridade_tarefa, 'grande', 10, 168,
    array['evento','interno'], 'Eventos',
    '[{"texto":"Confirmar data e responsáveis","concluido":false},{"texto":"Definir peças e canais","concluido":false},{"texto":"Produzir materiais","concluido":false},{"texto":"Revisar informações","concluido":false},{"texto":"Acompanhar execução","concluido":false}]'::jsonb,
    true
  ),
  (
    'Catálogo', 'Catálogo — ',
    'Atualizar ou produzir catálogo com validação de conteúdo, arte, produtos e arquivo final.',
    'media'::public.prioridade_tarefa, 'grande', 12, 168,
    array['catalogo','produto'], 'Catálogos',
    '[{"texto":"Validar lista de produtos","concluido":false},{"texto":"Conferir textos e dados","concluido":false},{"texto":"Montar layout","concluido":false},{"texto":"Fazer revisão final","concluido":false},{"texto":"Exportar e disponibilizar","concluido":false}]'::jsonb,
    true
  )
on conflict ((lower(nome))) do nothing;

-- ------------------------------------------------------------
-- DEPENDÊNCIAS ENTRE DEMANDAS
-- ------------------------------------------------------------
create table if not exists public.dependencias_tarefa (
  tarefa_id uuid references public.tarefas(id) on delete cascade not null,
  depende_de_tarefa_id uuid references public.tarefas(id) on delete cascade not null,
  criado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  primary key (tarefa_id, depende_de_tarefa_id),
  constraint dependencia_nao_pode_ser_a_mesma check (tarefa_id <> depende_de_tarefa_id)
);

create index if not exists idx_dependencias_tarefa_dependencia
  on public.dependencias_tarefa(depende_de_tarefa_id, tarefa_id);

-- ------------------------------------------------------------
-- REGISTRO DE TEMPO REAL
-- ------------------------------------------------------------
create table if not exists public.registros_tempo (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid references public.tarefas(id) on delete cascade not null,
  colaborador_id uuid references public.colaboradores(id) on delete cascade not null,
  inicio_em timestamptz not null default now(),
  fim_em timestamptz,
  minutos integer not null default 0,
  observacao text,
  criado_em timestamptz not null default now(),
  constraint registros_tempo_periodo_valido check (fim_em is null or fim_em >= inicio_em),
  constraint registros_tempo_minutos_validos check (minutos >= 0)
);

create unique index if not exists idx_registros_tempo_um_aberto_por_pessoa
  on public.registros_tempo(colaborador_id)
  where fim_em is null;
create index if not exists idx_registros_tempo_tarefa
  on public.registros_tempo(tarefa_id, inicio_em desc);
create index if not exists idx_registros_tempo_colaborador_mes
  on public.registros_tempo(colaborador_id, inicio_em desc);

-- ------------------------------------------------------------
-- FECHAMENTO MENSAL CONGELADO
-- ------------------------------------------------------------
create table if not exists public.fechamentos_mensais (
  mes date primary key,
  dados jsonb not null,
  fechado_por uuid references public.colaboradores(id) on delete set null,
  fechado_em timestamptz not null default now(),
  constraint fechamento_mes_primeiro_dia check (extract(day from mes) = 1),
  constraint fechamento_dados_objeto check (jsonb_typeof(dados) = 'object')
);

-- ------------------------------------------------------------
-- HISTÓRICO: NOVOS EVENTOS
-- ------------------------------------------------------------
alter table public.atividades_tarefa drop constraint if exists atividades_tarefa_tipo_valido;
alter table public.atividades_tarefa
  add constraint atividades_tarefa_tipo_valido check (
    tipo in (
      'criada', 'editada', 'status', 'atribuida', 'comentario',
      'arquivada', 'restaurada', 'transferida', 'avaliacao',
      'tempo', 'checklist', 'dependencia'
    )
  );

-- ------------------------------------------------------------
-- HELPERS DE DEPENDÊNCIA
-- ------------------------------------------------------------
create or replace function public.tarefa_tem_dependencias_pendentes(p_tarefa_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.dependencias_tarefa d
    join public.tarefas dep on dep.id = d.depende_de_tarefa_id
    where d.tarefa_id = p_tarefa_id
      and (dep.arquivada_em is not null or dep.status <> 'concluida'::public.status_tarefa)
  );
$$;

create or replace function public.validar_dependencias_tarefa(
  p_tarefa_id uuid,
  p_dependencias uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dep uuid;
begin
  foreach v_dep in array coalesce(p_dependencias, '{}'::uuid[])
  loop
    if v_dep is null then continue; end if;
    if v_dep = p_tarefa_id then raise exception 'Uma demanda não pode depender dela mesma'; end if;
    if not exists (select 1 from public.tarefas t where t.id = v_dep and t.arquivada_em is null) then
      raise exception 'Uma das dependências não existe ou está arquivada';
    end if;
    if exists (
      with recursive cadeia(id) as (
        select d.depende_de_tarefa_id from public.dependencias_tarefa d where d.tarefa_id = v_dep
        union
        select d.depende_de_tarefa_id
        from public.dependencias_tarefa d
        join cadeia c on c.id = d.tarefa_id
      )
      select 1 from cadeia where id = p_tarefa_id
    ) then
      raise exception 'Dependência circular detectada. Revise o encadeamento das demandas.';
    end if;
  end loop;
end;
$$;

-- ------------------------------------------------------------
-- CRIAR / EDITAR V4
-- ------------------------------------------------------------
drop function if exists public.criar_tarefa_v4(text, text, public.prioridade_tarefa, uuid, timestamptz, timestamptz, text[], text, numeric, boolean, text, jsonb, uuid[]);
create function public.criar_tarefa_v4(
  p_titulo text,
  p_descricao text,
  p_prioridade public.prioridade_tarefa,
  p_responsavel_id uuid,
  p_prazo_em timestamptz,
  p_lembrar_em timestamptz,
  p_tags text[],
  p_tamanho text,
  p_estimativa_horas numeric,
  p_alerta_para_todos boolean default false,
  p_projeto text default null,
  p_checklist jsonb default '[]'::jsonb,
  p_dependencias uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_dep uuid;
  v_ator uuid := public.meu_colaborador_id();
begin
  if jsonb_typeof(coalesce(p_checklist, '[]'::jsonb)) <> 'array' then raise exception 'Checklist inválido'; end if;

  v_id := public.criar_tarefa_v3(
    p_titulo, p_descricao, p_prioridade, p_responsavel_id,
    p_prazo_em, p_lembrar_em, p_tags, p_tamanho,
    p_estimativa_horas, p_alerta_para_todos, p_projeto
  );

  update public.tarefas set checklist = coalesce(p_checklist, '[]'::jsonb) where id = v_id;
  perform public.validar_dependencias_tarefa(v_id, p_dependencias);

  foreach v_dep in array coalesce(p_dependencias, '{}'::uuid[])
  loop
    if v_dep is null then continue; end if;
    insert into public.dependencias_tarefa(tarefa_id, depende_de_tarefa_id, criado_por)
    values(v_id, v_dep, v_ator)
    on conflict do nothing;
  end loop;

  if cardinality(coalesce(p_dependencias, '{}'::uuid[])) > 0 then
    insert into public.atividades_tarefa(tarefa_id, ator_id, tipo, detalhes)
    values(v_id, v_ator, 'dependencia', jsonb_build_object('dependencias', p_dependencias));
  end if;

  return v_id;
end;
$$;

drop function if exists public.editar_tarefa_v4(uuid, text, text, public.prioridade_tarefa, uuid, timestamptz, timestamptz, text[], text, numeric, boolean, text, jsonb, uuid[]);
create function public.editar_tarefa_v4(
  p_tarefa_id uuid,
  p_titulo text,
  p_descricao text,
  p_prioridade public.prioridade_tarefa,
  p_responsavel_id uuid,
  p_prazo_em timestamptz,
  p_lembrar_em timestamptz,
  p_tags text[],
  p_tamanho text,
  p_estimativa_horas numeric,
  p_alerta_para_todos boolean default false,
  p_projeto text default null,
  p_checklist jsonb default '[]'::jsonb,
  p_dependencias uuid[] default '{}'::uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_dep uuid;
  v_ator uuid := public.meu_colaborador_id();
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem editar demandas'; end if;
  if jsonb_typeof(coalesce(p_checklist, '[]'::jsonb)) <> 'array' then raise exception 'Checklist inválido'; end if;
  perform public.validar_dependencias_tarefa(p_tarefa_id, p_dependencias);

  perform public.editar_tarefa_v3(
    p_tarefa_id, p_titulo, p_descricao, p_prioridade, p_responsavel_id,
    p_prazo_em, p_lembrar_em, p_tags, p_tamanho,
    p_estimativa_horas, p_alerta_para_todos, p_projeto
  );

  update public.tarefas set checklist = coalesce(p_checklist, '[]'::jsonb) where id = p_tarefa_id;
  delete from public.dependencias_tarefa where tarefa_id = p_tarefa_id;
  foreach v_dep in array coalesce(p_dependencias, '{}'::uuid[])
  loop
    if v_dep is null then continue; end if;
    insert into public.dependencias_tarefa(tarefa_id, depende_de_tarefa_id, criado_por)
    values(p_tarefa_id, v_dep, v_ator)
    on conflict do nothing;
  end loop;

  insert into public.atividades_tarefa(tarefa_id, ator_id, tipo, detalhes)
  values(p_tarefa_id, v_ator, 'dependencia', jsonb_build_object('dependencias', coalesce(p_dependencias, '{}'::uuid[])));
end;
$$;

-- ------------------------------------------------------------
-- CHECKLIST INTERATIVO
-- ------------------------------------------------------------
create or replace function public.atualizar_checklist_tarefa(
  p_tarefa_id uuid,
  p_checklist jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_responsavel uuid;
begin
  if v_ator is null then raise exception 'Colaborador não encontrado'; end if;
  if jsonb_typeof(coalesce(p_checklist, '[]'::jsonb)) <> 'array' then raise exception 'Checklist inválido'; end if;
  select responsavel_id into v_responsavel from public.tarefas where id = p_tarefa_id and arquivada_em is null;
  if not found then raise exception 'Demanda não encontrada ou arquivada'; end if;
  if not public.sou_gestor() and v_responsavel is distinct from v_ator then raise exception 'Você só pode atualizar o checklist das suas demandas'; end if;
  update public.tarefas set checklist = coalesce(p_checklist, '[]'::jsonb) where id = p_tarefa_id;
  insert into public.atividades_tarefa(tarefa_id, ator_id, tipo, detalhes)
  values(p_tarefa_id, v_ator, 'checklist', jsonb_build_object('checklist', coalesce(p_checklist, '[]'::jsonb)));
end;
$$;

-- ------------------------------------------------------------
-- STATUS COM BLOQUEIO POR DEPENDÊNCIA
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
  v_ator_id uuid := public.meu_colaborador_id();
  v_responsavel_id uuid;
  v_arquivada_em timestamptz;
  v_prioridade public.prioridade_tarefa;
  v_alerta_para_todos boolean;
  v_eh_gestor boolean := public.sou_gestor();
begin
  if v_ator_id is null then raise exception 'Colaborador não encontrado ou inativo'; end if;
  if p_status is null then raise exception 'O status é obrigatório'; end if;

  select t.responsavel_id, t.arquivada_em, t.prioridade, coalesce(t.alerta_para_todos, false)
  into v_responsavel_id, v_arquivada_em, v_prioridade, v_alerta_para_todos
  from public.tarefas t where t.id = p_tarefa_id for update;
  if not found then raise exception 'Tarefa não encontrada'; end if;
  if v_arquivada_em is not null then raise exception 'Não é possível alterar uma tarefa arquivada'; end if;

  if p_status in ('andamento'::public.status_tarefa, 'revisao'::public.status_tarefa)
     and public.tarefa_tem_dependencias_pendentes(p_tarefa_id) then
    raise exception 'Esta demanda está bloqueada por outra entrega. Conclua as dependências antes de avançar.';
  end if;

  if not v_eh_gestor and v_ator_id is distinct from v_responsavel_id then
    if v_responsavel_id is null
       and v_prioridade = 'imediata'::public.prioridade_tarefa
       and v_alerta_para_todos
       and p_status = 'andamento'::public.status_tarefa then
      if public.tarefa_tem_dependencias_pendentes(p_tarefa_id) then
        raise exception 'A demanda imediata ainda está bloqueada por uma dependência.';
      end if;
      update public.tarefas
      set responsavel_id = v_ator_id,
          status = 'andamento'::public.status_tarefa,
          avaliacao_status = 'nao_solicitada'
      where id = p_tarefa_id;
      return;
    end if;
    raise exception 'Você só pode alterar tarefas atribuídas a você';
  end if;

  if p_status = 'concluida'::public.status_tarefa then
    raise exception 'A conclusão precisa ser avaliada por um gestor';
  end if;

  update public.tarefas
  set status = p_status,
      avaliacao_status = case when p_status = 'revisao'::public.status_tarefa then 'pendente' else 'nao_solicitada' end,
      avaliacao_observacao = case when p_status = 'revisao'::public.status_tarefa then null else avaliacao_observacao end,
      avaliado_por = case when p_status = 'revisao'::public.status_tarefa then null else avaliado_por end,
      avaliado_em = case when p_status = 'revisao'::public.status_tarefa then null else avaliado_em end
  where id = p_tarefa_id;
end;
$$;

-- ------------------------------------------------------------
-- MODELOS: RPCs
-- ------------------------------------------------------------
create or replace function public.salvar_modelo_demanda(
  p_nome text,
  p_titulo_base text,
  p_descricao_padrao text,
  p_prioridade public.prioridade_tarefa,
  p_tamanho text,
  p_estimativa_horas numeric,
  p_prazo_horas integer,
  p_tags text[],
  p_projeto text,
  p_checklist jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_gestor uuid := public.meu_colaborador_id();
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem salvar modelos'; end if;
  if p_nome is null or length(trim(p_nome)) = 0 then raise exception 'Informe o nome do modelo'; end if;
  if p_tamanho not in ('rapida','media','grande') then raise exception 'Tamanho inválido'; end if;
  if jsonb_typeof(coalesce(p_checklist, '[]'::jsonb)) <> 'array' then raise exception 'Checklist inválido'; end if;

  insert into public.modelos_demanda(
    nome, titulo_base, descricao_padrao, prioridade, tamanho, estimativa_horas,
    prazo_horas, tags, projeto, checklist, sistema, ativo, criado_por
  ) values (
    trim(p_nome), nullif(trim(coalesce(p_titulo_base,'')),''), nullif(trim(coalesce(p_descricao_padrao,'')),''),
    coalesce(p_prioridade,'media'::public.prioridade_tarefa), p_tamanho, p_estimativa_horas,
    p_prazo_horas, coalesce(p_tags,'{}'::text[]), nullif(trim(coalesce(p_projeto,'')),''),
    coalesce(p_checklist,'[]'::jsonb), false, true, v_gestor
  )
  on conflict ((lower(nome))) do update set
    titulo_base = excluded.titulo_base,
    descricao_padrao = excluded.descricao_padrao,
    prioridade = excluded.prioridade,
    tamanho = excluded.tamanho,
    estimativa_horas = excluded.estimativa_horas,
    prazo_horas = excluded.prazo_horas,
    tags = excluded.tags,
    projeto = excluded.projeto,
    checklist = excluded.checklist,
    ativo = true,
    atualizado_em = now()
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.excluir_modelo_demanda(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem excluir modelos'; end if;
  if exists(select 1 from public.modelos_demanda where id = p_id and sistema = true) then
    raise exception 'Modelos padrão do sistema não podem ser excluídos';
  end if;
  update public.modelos_demanda set ativo = false where id = p_id;
end;
$$;

-- ------------------------------------------------------------
-- TEMPO REAL X ESTIMADO
-- ------------------------------------------------------------
create or replace function public.iniciar_tempo_tarefa(p_tarefa_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_responsavel uuid;
  v_id uuid;
  v_aberto record;
begin
  if v_ator is null then raise exception 'Colaborador não encontrado'; end if;
  select responsavel_id into v_responsavel from public.tarefas
  where id = p_tarefa_id and arquivada_em is null and status <> 'concluida'::public.status_tarefa;
  if not found then raise exception 'Demanda não encontrada, arquivada ou concluída'; end if;
  if not public.sou_gestor() and v_responsavel is distinct from v_ator then raise exception 'Você só pode registrar tempo nas suas demandas'; end if;
  if public.tarefa_tem_dependencias_pendentes(p_tarefa_id) then raise exception 'A demanda ainda está bloqueada por dependências'; end if;

  select * into v_aberto from public.registros_tempo where colaborador_id = v_ator and fim_em is null limit 1 for update;
  if found then
    if v_aberto.tarefa_id = p_tarefa_id then return v_aberto.id; end if;
    update public.registros_tempo
    set fim_em = now(), minutos = greatest(1, floor(extract(epoch from (now() - inicio_em))/60)::integer)
    where id = v_aberto.id;
  end if;

  insert into public.registros_tempo(tarefa_id, colaborador_id, inicio_em)
  values(p_tarefa_id, v_ator, now()) returning id into v_id;

  if exists(select 1 from public.tarefas where id = p_tarefa_id and status = 'nova'::public.status_tarefa) then
    perform public.atualizar_status(p_tarefa_id, 'andamento'::public.status_tarefa);
  end if;

  insert into public.atividades_tarefa(tarefa_id, ator_id, tipo, detalhes)
  values(p_tarefa_id, v_ator, 'tempo', jsonb_build_object('acao','iniciado'));
  return v_id;
end;
$$;

create or replace function public.parar_tempo_tarefa(
  p_tarefa_id uuid,
  p_observacao text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_id uuid;
  v_minutos integer;
begin
  select id into v_id from public.registros_tempo
  where tarefa_id = p_tarefa_id and colaborador_id = v_ator and fim_em is null
  order by inicio_em desc limit 1 for update;
  if not found then raise exception 'Não há cronômetro aberto nesta demanda'; end if;

  update public.registros_tempo
  set fim_em = now(),
      minutos = greatest(1, floor(extract(epoch from (now() - inicio_em))/60)::integer),
      observacao = nullif(trim(coalesce(p_observacao,'')),'')
  where id = v_id
  returning minutos into v_minutos;

  insert into public.atividades_tarefa(tarefa_id, ator_id, tipo, detalhes)
  values(p_tarefa_id, v_ator, 'tempo', jsonb_build_object('acao','pausado','minutos',v_minutos));
  return v_minutos;
end;
$$;

-- ------------------------------------------------------------
-- FECHAMENTO MENSAL
-- ------------------------------------------------------------
create or replace function public.salvar_fechamento_mensal(
  p_mes date,
  p_dados jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mes date := date_trunc('month', p_mes)::date;
  v_gestor uuid := public.meu_colaborador_id();
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem fechar o mês'; end if;
  if jsonb_typeof(coalesce(p_dados,'{}'::jsonb)) <> 'object' then raise exception 'Relatório inválido'; end if;
  insert into public.fechamentos_mensais(mes,dados,fechado_por,fechado_em)
  values(v_mes,p_dados,v_gestor,now())
  on conflict(mes) do update set dados=excluded.dados, fechado_por=excluded.fechado_por, fechado_em=now();
end;
$$;

create or replace function public.reabrir_fechamento_mensal(p_mes date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem reabrir o mês'; end if;
  delete from public.fechamentos_mensais where mes = date_trunc('month', p_mes)::date;
end;
$$;

-- ------------------------------------------------------------
-- RLS / PERMISSÕES
-- ------------------------------------------------------------
alter table public.modelos_demanda enable row level security;
alter table public.dependencias_tarefa enable row level security;
alter table public.registros_tempo enable row level security;
alter table public.fechamentos_mensais enable row level security;

drop policy if exists "autenticados leem modelos" on public.modelos_demanda;
create policy "autenticados leem modelos" on public.modelos_demanda for select to authenticated using (ativo = true);
drop policy if exists "autenticados leem dependencias" on public.dependencias_tarefa;
create policy "autenticados leem dependencias" on public.dependencias_tarefa for select to authenticated using (true);
drop policy if exists "autenticados leem tempos" on public.registros_tempo;
create policy "autenticados leem tempos" on public.registros_tempo for select to authenticated using (true);
drop policy if exists "autenticados leem fechamentos" on public.fechamentos_mensais;
create policy "autenticados leem fechamentos" on public.fechamentos_mensais for select to authenticated using (true);

revoke all privileges on table public.modelos_demanda from anon, authenticated;
revoke all privileges on table public.dependencias_tarefa from anon, authenticated;
revoke all privileges on table public.registros_tempo from anon, authenticated;
revoke all privileges on table public.fechamentos_mensais from anon, authenticated;
grant select on table public.modelos_demanda to authenticated;
grant select on table public.dependencias_tarefa to authenticated;
grant select on table public.registros_tempo to authenticated;
grant select on table public.fechamentos_mensais to authenticated;

revoke all on function public.criar_tarefa_v4(text,text,public.prioridade_tarefa,uuid,timestamptz,timestamptz,text[],text,numeric,boolean,text,jsonb,uuid[]) from public, anon;
revoke all on function public.editar_tarefa_v4(uuid,text,text,public.prioridade_tarefa,uuid,timestamptz,timestamptz,text[],text,numeric,boolean,text,jsonb,uuid[]) from public, anon;
revoke all on function public.atualizar_checklist_tarefa(uuid,jsonb) from public, anon;
revoke all on function public.salvar_modelo_demanda(text,text,text,public.prioridade_tarefa,text,numeric,integer,text[],text,jsonb) from public, anon;
revoke all on function public.excluir_modelo_demanda(uuid) from public, anon;
revoke all on function public.iniciar_tempo_tarefa(uuid) from public, anon;
revoke all on function public.parar_tempo_tarefa(uuid,text) from public, anon;
revoke all on function public.salvar_fechamento_mensal(date,jsonb) from public, anon;
revoke all on function public.reabrir_fechamento_mensal(date) from public, anon;
revoke all on function public.tarefa_tem_dependencias_pendentes(uuid) from public, anon;

grant execute on function public.criar_tarefa_v4(text,text,public.prioridade_tarefa,uuid,timestamptz,timestamptz,text[],text,numeric,boolean,text,jsonb,uuid[]) to authenticated;
grant execute on function public.editar_tarefa_v4(uuid,text,text,public.prioridade_tarefa,uuid,timestamptz,timestamptz,text[],text,numeric,boolean,text,jsonb,uuid[]) to authenticated;
grant execute on function public.atualizar_checklist_tarefa(uuid,jsonb) to authenticated;
grant execute on function public.salvar_modelo_demanda(text,text,text,public.prioridade_tarefa,text,numeric,integer,text[],text,jsonb) to authenticated;
grant execute on function public.excluir_modelo_demanda(uuid) to authenticated;
grant execute on function public.iniciar_tempo_tarefa(uuid) to authenticated;
grant execute on function public.parar_tempo_tarefa(uuid,text) to authenticated;
grant execute on function public.salvar_fechamento_mensal(date,jsonb) to authenticated;
grant execute on function public.reabrir_fechamento_mensal(date) to authenticated;
grant execute on function public.tarefa_tem_dependencias_pendentes(uuid) to authenticated;

-- Realtime para componentes dinâmicos.
alter table public.dependencias_tarefa replica identity full;
alter table public.registros_tempo replica identity full;
alter table public.modelos_demanda replica identity full;
alter table public.fechamentos_mensais replica identity full;

do $$
declare
  v_tabela text;
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime') then
    foreach v_tabela in array array['dependencias_tarefa','registros_tempo','modelos_demanda','fechamentos_mensais']
    loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname='supabase_realtime' and schemaname='public' and tablename=v_tabela
      ) then
        execute format('alter publication supabase_realtime add table public.%I', v_tabela);
      end if;
    end loop;
  end if;
end
$$;

-- Diagnóstico final.
select
  (select count(*) from public.modelos_demanda where ativo=true) as modelos_ativos,
  (select count(*) from public.dependencias_tarefa) as dependencias,
  (select count(*) from public.registros_tempo) as registros_tempo,
  (select count(*) from public.fechamentos_mensais) as meses_fechados;
