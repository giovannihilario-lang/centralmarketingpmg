-- ============================================================
-- PMG CONNECT — DEMANDAS V2
-- Agenda, lembretes, compromissos, carga e histórico
-- ============================================================
-- Execute no SQL Editor DEPOIS do demandas_supabase.sql da V1.
-- A migração preserva colaboradores, tarefas, comentários e notificações.
-- Pode ser executada novamente durante ajustes.
-- ============================================================

create extension if not exists pgcrypto;

do $$
begin
  execute 'create extension if not exists pg_cron with schema extensions';
exception
  when insufficient_privilege then
    raise notice 'Ative Cron em Integrations > Cron no Supabase.';
  when others then
    raise notice 'Não foi possível habilitar pg_cron automaticamente: %', sqlerrm;
end
$$;

-- ============================================================
-- EVOLUÇÃO DAS TABELAS EXISTENTES
-- ============================================================

alter table public.tarefas add column if not exists prazo_em timestamptz;
alter table public.tarefas add column if not exists lembrar_em timestamptz;
alter table public.tarefas add column if not exists lembrete_enviado_em timestamptz;
alter table public.tarefas add column if not exists atraso_notificado_em timestamptz;
alter table public.tarefas add column if not exists tamanho text not null default 'media';
alter table public.tarefas add column if not exists estimativa_horas numeric(8,2);
alter table public.tarefas add column if not exists concluida_em timestamptz;

alter table public.notificacoes add column if not exists lembrete_id uuid;
alter table public.notificacoes add column if not exists mensagem text;

-- Converte prazos antigos em data + horário sem apagar o campo legado.
update public.tarefas
set prazo_em = (prazo + time '17:00') at time zone 'America/Sao_Paulo'
where prazo is not null
  and prazo_em is null;

update public.tarefas
set concluida_em = coalesce(concluida_em, atualizado_em)
where status = 'concluida'::public.status_tarefa
  and concluida_em is null;

-- Constraints são criadas somente quando ainda não existem.
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tarefas'::regclass
      and conname = 'tarefas_tamanho_valido'
  ) then
    alter table public.tarefas
      add constraint tarefas_tamanho_valido
      check (tamanho in ('rapida', 'media', 'grande'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.tarefas'::regclass
      and conname = 'tarefas_estimativa_valida'
  ) then
    alter table public.tarefas
      add constraint tarefas_estimativa_valida
      check (estimativa_horas is null or estimativa_horas >= 0);
  end if;
end
$$;

-- ============================================================
-- AGENDA E HISTÓRICO
-- ============================================================

create table if not exists public.lembretes (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid references public.colaboradores(id) on delete cascade not null,
  criado_por uuid references public.colaboradores(id) on delete restrict not null,
  titulo text not null,
  descricao text,
  tipo text not null default 'lembrete',
  inicio_em timestamptz not null,
  fim_em timestamptz,
  lembrar_em timestamptz,
  recorrencia text not null default 'nenhuma',
  visibilidade text not null default 'pessoal',
  adiando_ate timestamptz,
  notificado_em timestamptz,
  concluido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint lembretes_titulo_nao_vazio check (length(trim(titulo)) > 0),
  constraint lembretes_tipo_valido check (tipo in ('lembrete', 'compromisso')),
  constraint lembretes_recorrencia_valida check (recorrencia in ('nenhuma', 'diaria', 'semanal', 'mensal', 'anual')),
  constraint lembretes_visibilidade_valida check (visibilidade in ('pessoal', 'equipe')),
  constraint lembretes_periodo_valido check (fim_em is null or fim_em >= inicio_em)
);

create table if not exists public.atividades_tarefa (
  id uuid primary key default gen_random_uuid(),
  tarefa_id uuid references public.tarefas(id) on delete cascade not null,
  ator_id uuid references public.colaboradores(id) on delete set null,
  tipo text not null,
  detalhes jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  constraint atividades_tarefa_tipo_valido check (
    tipo in ('criada', 'editada', 'status', 'atribuida', 'comentario', 'arquivada', 'restaurada')
  )
);

-- FK de notificações para lembretes em instalações já existentes.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.notificacoes'::regclass
      and conname = 'notificacoes_lembrete_id_fkey'
  ) then
    alter table public.notificacoes
      add constraint notificacoes_lembrete_id_fkey
      foreign key (lembrete_id)
      references public.lembretes(id)
      on delete cascade;
  end if;
end
$$;

create index if not exists idx_tarefas_prazo_em
  on public.tarefas(prazo_em)
  where prazo_em is not null and arquivada_em is null;
create index if not exists idx_tarefas_lembrete_pendente
  on public.tarefas(lembrar_em)
  where lembrar_em is not null and lembrete_enviado_em is null and arquivada_em is null;
create index if not exists idx_lembretes_inicio
  on public.lembretes(inicio_em);
create index if not exists idx_lembretes_aviso_pendente
  on public.lembretes((coalesce(adiando_ate, lembrar_em, inicio_em)))
  where concluido_em is null and notificado_em is null;
create index if not exists idx_lembretes_colaborador
  on public.lembretes(colaborador_id, inicio_em);
create index if not exists idx_atividades_tarefa
  on public.atividades_tarefa(tarefa_id, criado_em desc);
create index if not exists idx_notificacoes_lembrete
  on public.notificacoes(lembrete_id, colaborador_id);

-- ============================================================
-- TRIGGERS DE DATA E HISTÓRICO
-- ============================================================

drop trigger if exists trg_lembretes_atualizado_em on public.lembretes;
create trigger trg_lembretes_atualizado_em
before update on public.lembretes
for each row execute function public.set_atualizado_em();

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
    values (
      new.id,
      coalesce(v_ator, new.criado_por),
      'criada',
      jsonb_build_object('responsavel_id', new.responsavel_id, 'prioridade', new.prioridade)
    );
    return new;
  end if;

  if new.arquivada_em is distinct from old.arquivada_em then
    insert into public.atividades_tarefa (tarefa_id, ator_id, tipo, detalhes)
    values (
      new.id,
      v_ator,
      case when new.arquivada_em is null then 'restaurada' else 'arquivada' end,
      '{}'::jsonb
    );
  end if;

  if new.responsavel_id is distinct from old.responsavel_id then
    insert into public.atividades_tarefa (tarefa_id, ator_id, tipo, detalhes)
    values (
      new.id,
      v_ator,
      'atribuida',
      jsonb_build_object('de', old.responsavel_id, 'para', new.responsavel_id)
    );
  end if;

  if new.status is distinct from old.status then
    insert into public.atividades_tarefa (tarefa_id, ator_id, tipo, detalhes)
    values (
      new.id,
      v_ator,
      'status',
      jsonb_build_object('de', old.status, 'para', new.status)
    );
  end if;

  if row(
    new.titulo,
    new.descricao,
    new.prioridade,
    new.prazo_em,
    new.lembrar_em,
    new.tags,
    new.tamanho,
    new.estimativa_horas
  ) is distinct from row(
    old.titulo,
    old.descricao,
    old.prioridade,
    old.prazo_em,
    old.lembrar_em,
    old.tags,
    old.tamanho,
    old.estimativa_horas
  ) then
    insert into public.atividades_tarefa (tarefa_id, ator_id, tipo, detalhes)
    values (
      new.id,
      v_ator,
      'editada',
      jsonb_build_object(
        'prazo_anterior', old.prazo_em,
        'prazo_novo', new.prazo_em,
        'prioridade_anterior', old.prioridade,
        'prioridade_nova', new.prioridade
      )
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_registrar_atividade_tarefa on public.tarefas;
create trigger trg_registrar_atividade_tarefa
after insert or update on public.tarefas
for each row execute function public.registrar_atividade_tarefa();

create or replace function public.registrar_atividade_comentario()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.atividades_tarefa (tarefa_id, ator_id, tipo, detalhes)
  values (
    new.tarefa_id,
    new.colaborador_id,
    'comentario',
    jsonb_build_object('comentario_id', new.id)
  );
  return new;
end;
$$;

drop trigger if exists trg_registrar_atividade_comentario on public.comentarios;
create trigger trg_registrar_atividade_comentario
after insert on public.comentarios
for each row execute function public.registrar_atividade_comentario();

-- Notifica mudança de prazo, sem inventar um novo enum só para isso.
create or replace function public.notificar_alteracao_prazo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_destinatario uuid;
begin
  if new.prazo_em is not distinct from old.prazo_em then
    return new;
  end if;

  foreach v_destinatario in array array[new.responsavel_id, new.criado_por]
  loop
    if v_destinatario is not null and v_destinatario is distinct from v_ator then
      insert into public.notificacoes (
        tarefa_id,
        colaborador_id,
        tipo,
        mensagem,
        chave_deduplicacao
      )
      values (
        new.id,
        v_destinatario,
        'status_mudou'::public.tipo_notificacao,
        case
          when new.prazo_em is null then 'O prazo da demanda foi removido'
          else 'O prazo da demanda foi alterado'
        end,
        concat('prazo-alterado:', new.id, ':', v_destinatario, ':', coalesce(new.prazo_em::text, 'sem-prazo'), ':', extract(epoch from now())::bigint)
      )
      on conflict (chave_deduplicacao) do nothing;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_notificar_alteracao_prazo on public.tarefas;
create trigger trg_notificar_alteracao_prazo
after update of prazo_em on public.tarefas
for each row execute function public.notificar_alteracao_prazo();

-- Mantém concluida_em coerente com o status.
create or replace function public.sincronizar_conclusao_tarefa()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'concluida'::public.status_tarefa
     and old.status is distinct from new.status then
    new.concluida_em = now();
  elsif old.status = 'concluida'::public.status_tarefa
        and new.status is distinct from old.status then
    new.concluida_em = null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sincronizar_conclusao_tarefa on public.tarefas;
create trigger trg_sincronizar_conclusao_tarefa
before update of status on public.tarefas
for each row execute function public.sincronizar_conclusao_tarefa();

-- ============================================================
-- RPCs DE DEMANDAS V2
-- ============================================================

drop function if exists public.criar_tarefa_v2(text, text, public.prioridade_tarefa, uuid, timestamptz, timestamptz, text[], text, numeric);
create function public.criar_tarefa_v2(
  p_titulo text,
  p_descricao text,
  p_prioridade public.prioridade_tarefa,
  p_responsavel_id uuid,
  p_prazo_em timestamptz,
  p_lembrar_em timestamptz,
  p_tags text[],
  p_tamanho text,
  p_estimativa_horas numeric
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_ator uuid := public.meu_colaborador_id();
begin
  if v_ator is null then
    raise exception 'Colaborador não encontrado ou inativo';
  end if;

  if not public.sou_gestor() then
    raise exception 'Somente gestores podem criar demandas';
  end if;

  if p_titulo is null or length(trim(p_titulo)) = 0 then
    raise exception 'O título da demanda é obrigatório';
  end if;

  if p_tamanho not in ('rapida', 'media', 'grande') then
    raise exception 'Tamanho de demanda inválido';
  end if;

  if p_estimativa_horas is not null and p_estimativa_horas < 0 then
    raise exception 'A estimativa não pode ser negativa';
  end if;

  if p_responsavel_id is not null and not exists (
    select 1 from public.colaboradores c
    where c.id = p_responsavel_id and c.ativo = true
  ) then
    raise exception 'Responsável inválido ou inativo';
  end if;

  insert into public.tarefas (
    titulo,
    descricao,
    prioridade,
    responsavel_id,
    criado_por,
    prazo,
    prazo_em,
    lembrar_em,
    tags,
    tamanho,
    estimativa_horas,
    lembrete_enviado_em,
    atraso_notificado_em
  ) values (
    trim(p_titulo),
    nullif(trim(p_descricao), ''),
    coalesce(p_prioridade, 'media'::public.prioridade_tarefa),
    p_responsavel_id,
    v_ator,
    case when p_prazo_em is null then null else (p_prazo_em at time zone 'America/Sao_Paulo')::date end,
    p_prazo_em,
    p_lembrar_em,
    coalesce(p_tags, '{}'::text[]),
    coalesce(p_tamanho, 'media'),
    p_estimativa_horas,
    null,
    null
  )
  returning id into v_id;

  return v_id;
end;
$$;

drop function if exists public.editar_tarefa_v2(uuid, text, text, public.prioridade_tarefa, uuid, timestamptz, timestamptz, text[], text, numeric);
create function public.editar_tarefa_v2(
  p_tarefa_id uuid,
  p_titulo text,
  p_descricao text,
  p_prioridade public.prioridade_tarefa,
  p_responsavel_id uuid,
  p_prazo_em timestamptz,
  p_lembrar_em timestamptz,
  p_tags text[],
  p_tamanho text,
  p_estimativa_horas numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prazo_antigo timestamptz;
  v_lembrete_antigo timestamptz;
begin
  if not public.sou_gestor() then
    raise exception 'Somente gestores podem editar demandas';
  end if;

  if p_titulo is null or length(trim(p_titulo)) = 0 then
    raise exception 'O título da demanda é obrigatório';
  end if;

  if p_tamanho not in ('rapida', 'media', 'grande') then
    raise exception 'Tamanho de demanda inválido';
  end if;

  if p_estimativa_horas is not null and p_estimativa_horas < 0 then
    raise exception 'A estimativa não pode ser negativa';
  end if;

  if p_responsavel_id is not null and not exists (
    select 1 from public.colaboradores c
    where c.id = p_responsavel_id and c.ativo = true
  ) then
    raise exception 'Responsável inválido ou inativo';
  end if;

  select t.prazo_em, t.lembrar_em
  into v_prazo_antigo, v_lembrete_antigo
  from public.tarefas t
  where t.id = p_tarefa_id
    and t.arquivada_em is null;

  if not found then
    raise exception 'Demanda não encontrada ou arquivada';
  end if;

  update public.tarefas
  set titulo = trim(p_titulo),
      descricao = nullif(trim(p_descricao), ''),
      prioridade = coalesce(p_prioridade, prioridade),
      responsavel_id = p_responsavel_id,
      prazo = case when p_prazo_em is null then null else (p_prazo_em at time zone 'America/Sao_Paulo')::date end,
      prazo_em = p_prazo_em,
      lembrar_em = p_lembrar_em,
      tags = coalesce(p_tags, '{}'::text[]),
      tamanho = coalesce(p_tamanho, 'media'),
      estimativa_horas = p_estimativa_horas,
      lembrete_enviado_em = case
        when p_lembrar_em is distinct from v_lembrete_antigo then null
        else lembrete_enviado_em
      end,
      atraso_notificado_em = case
        when p_prazo_em is distinct from v_prazo_antigo then null
        else atraso_notificado_em
      end
  where id = p_tarefa_id;
end;
$$;

-- ============================================================
-- RPCs DE AGENDA E LEMBRETES
-- ============================================================

create or replace function public.proxima_ocorrencia(
  p_inicio timestamptz,
  p_recorrencia text
)
returns timestamptz
language sql
immutable
set search_path = ''
as $$
  select case p_recorrencia
    when 'diaria' then p_inicio + interval '1 day'
    when 'semanal' then p_inicio + interval '1 week'
    when 'mensal' then p_inicio + interval '1 month'
    when 'anual' then p_inicio + interval '1 year'
    else null
  end;
$$;

drop function if exists public.criar_lembrete(text, text, text, timestamptz, timestamptz, timestamptz, text, text);
create function public.criar_lembrete(
  p_titulo text,
  p_descricao text,
  p_tipo text,
  p_inicio_em timestamptz,
  p_fim_em timestamptz,
  p_lembrar_em timestamptz,
  p_recorrencia text,
  p_visibilidade text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_ator uuid := public.meu_colaborador_id();
  v_visibilidade text := coalesce(p_visibilidade, 'pessoal');
begin
  if v_ator is null then
    raise exception 'Colaborador não encontrado ou inativo';
  end if;

  if p_titulo is null or length(trim(p_titulo)) = 0 then
    raise exception 'O título é obrigatório';
  end if;

  if p_inicio_em is null then
    raise exception 'A data e o horário são obrigatórios';
  end if;

  if p_tipo not in ('lembrete', 'compromisso') then
    raise exception 'Tipo de item inválido';
  end if;

  if coalesce(p_recorrencia, 'nenhuma') not in ('nenhuma', 'diaria', 'semanal', 'mensal', 'anual') then
    raise exception 'Recorrência inválida';
  end if;

  if v_visibilidade not in ('pessoal', 'equipe') then
    raise exception 'Visibilidade inválida';
  end if;

  if v_visibilidade = 'equipe' and not public.sou_gestor() then
    raise exception 'Somente gestores podem criar itens para toda a equipe';
  end if;

  if p_fim_em is not null and p_fim_em < p_inicio_em then
    raise exception 'O horário final não pode ser anterior ao início';
  end if;

  insert into public.lembretes (
    colaborador_id,
    criado_por,
    titulo,
    descricao,
    tipo,
    inicio_em,
    fim_em,
    lembrar_em,
    recorrencia,
    visibilidade
  ) values (
    v_ator,
    v_ator,
    trim(p_titulo),
    nullif(trim(p_descricao), ''),
    p_tipo,
    p_inicio_em,
    p_fim_em,
    coalesce(p_lembrar_em, p_inicio_em),
    coalesce(p_recorrencia, 'nenhuma'),
    v_visibilidade
  )
  returning id into v_id;

  return v_id;
end;
$$;

drop function if exists public.editar_lembrete(uuid, text, text, timestamptz, timestamptz, timestamptz, text, text);
drop function if exists public.editar_lembrete(uuid, text, text, text, timestamptz, timestamptz, timestamptz, text, text);
create function public.editar_lembrete(
  p_id uuid,
  p_titulo text,
  p_descricao text,
  p_tipo text,
  p_inicio_em timestamptz,
  p_fim_em timestamptz,
  p_lembrar_em timestamptz,
  p_recorrencia text,
  p_visibilidade text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_dono uuid;
  v_visibilidade text := coalesce(p_visibilidade, 'pessoal');
begin
  select l.colaborador_id into v_dono
  from public.lembretes l
  where l.id = p_id;

  if not found then
    raise exception 'Item da agenda não encontrado';
  end if;

  if v_ator is distinct from v_dono and not public.sou_gestor() then
    raise exception 'Você não possui permissão para editar este item';
  end if;

  if v_visibilidade = 'equipe' and not public.sou_gestor() then
    raise exception 'Somente gestores podem compartilhar itens com a equipe';
  end if;

  if p_titulo is null or length(trim(p_titulo)) = 0 then
    raise exception 'O título é obrigatório';
  end if;

  if p_inicio_em is null then
    raise exception 'A data e o horário são obrigatórios';
  end if;

  if p_tipo not in ('lembrete', 'compromisso') then
    raise exception 'Tipo de item inválido';
  end if;

  if coalesce(p_recorrencia, 'nenhuma') not in ('nenhuma', 'diaria', 'semanal', 'mensal', 'anual') then
    raise exception 'Recorrência inválida';
  end if;

  if p_fim_em is not null and p_fim_em < p_inicio_em then
    raise exception 'O horário final não pode ser anterior ao início';
  end if;

  update public.lembretes
  set titulo = trim(p_titulo),
      descricao = nullif(trim(p_descricao), ''),
      tipo = p_tipo,
      inicio_em = p_inicio_em,
      fim_em = p_fim_em,
      lembrar_em = coalesce(p_lembrar_em, p_inicio_em),
      recorrencia = coalesce(p_recorrencia, 'nenhuma'),
      visibilidade = v_visibilidade,
      adiando_ate = null,
      notificado_em = null,
      concluido_em = null
  where id = p_id;
end;
$$;

create or replace function public.adiar_lembrete(
  p_id uuid,
  p_minutos integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_dono uuid;
begin
  if p_minutos is null or p_minutos < 1 or p_minutos > 10080 then
    raise exception 'Período de adiamento inválido';
  end if;

  select l.colaborador_id into v_dono
  from public.lembretes l
  where l.id = p_id and l.concluido_em is null;

  if not found then
    raise exception 'Lembrete não encontrado ou já concluído';
  end if;

  if v_ator is distinct from v_dono and not public.sou_gestor() then
    raise exception 'Você não possui permissão para adiar este lembrete';
  end if;

  update public.lembretes
  set adiando_ate = now() + make_interval(mins => p_minutos),
      notificado_em = null
  where id = p_id;

  update public.notificacoes
  set lida = true
  where lembrete_id = p_id
    and colaborador_id = v_ator
    and lida = false;
end;
$$;

create or replace function public.concluir_lembrete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_item public.lembretes;
  v_proximo timestamptz;
  v_duracao interval;
  v_antecedencia interval;
begin
  select * into v_item
  from public.lembretes l
  where l.id = p_id;

  if not found then
    raise exception 'Lembrete não encontrado';
  end if;

  if v_ator is distinct from v_item.colaborador_id and not public.sou_gestor() then
    raise exception 'Você não possui permissão para concluir este lembrete';
  end if;

  if v_item.recorrencia = 'nenhuma' then
    update public.lembretes
    set concluido_em = now(),
        adiando_ate = null
    where id = p_id;
  else
    v_proximo := public.proxima_ocorrencia(v_item.inicio_em, v_item.recorrencia);
    v_duracao := case when v_item.fim_em is null then null else v_item.fim_em - v_item.inicio_em end;
    v_antecedencia := v_item.inicio_em - coalesce(v_item.lembrar_em, v_item.inicio_em);

    update public.lembretes
    set inicio_em = v_proximo,
        fim_em = case when v_duracao is null then null else v_proximo + v_duracao end,
        lembrar_em = v_proximo - v_antecedencia,
        adiando_ate = null,
        notificado_em = null,
        concluido_em = null
    where id = p_id;
  end if;

  update public.notificacoes
  set lida = true
  where lembrete_id = p_id
    and colaborador_id = v_ator
    and lida = false;
end;
$$;

create or replace function public.excluir_lembrete(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_dono uuid;
begin
  select l.colaborador_id into v_dono
  from public.lembretes l
  where l.id = p_id;

  if not found then
    raise exception 'Item da agenda não encontrado';
  end if;

  if v_ator is distinct from v_dono and not public.sou_gestor() then
    raise exception 'Você não possui permissão para excluir este item';
  end if;

  delete from public.lembretes where id = p_id;
end;
$$;

-- ============================================================
-- AUTOMAÇÃO DE LEMBRETES
-- ============================================================

create or replace function public.gerar_notificacoes_agenda()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer := 0;
  v_linhas integer := 0;
begin
  -- Lembretes e compromissos pessoais ou compartilhados.
  insert into public.notificacoes (
    lembrete_id,
    colaborador_id,
    tipo,
    mensagem,
    chave_deduplicacao
  )
  select
    l.id,
    c.id,
    'prazo_proximo'::public.tipo_notificacao,
    case
      when l.tipo = 'compromisso' then 'Compromisso próximo'
      else 'Lembrete programado'
    end,
    concat(
      'agenda:', l.id, ':', c.id, ':',
      extract(epoch from coalesce(l.adiando_ate, l.lembrar_em, l.inicio_em))::bigint
    )
  from public.lembretes l
  join public.colaboradores c
    on c.ativo = true
   and (
     (l.visibilidade = 'pessoal' and c.id = l.colaborador_id)
     or l.visibilidade = 'equipe'
   )
  where l.concluido_em is null
    and l.notificado_em is null
    and coalesce(l.adiando_ate, l.lembrar_em, l.inicio_em) <= now()
  on conflict (chave_deduplicacao) do nothing;

  get diagnostics v_linhas = row_count;
  v_total := v_total + v_linhas;

  update public.lembretes l
  set notificado_em = now()
  where l.concluido_em is null
    and l.notificado_em is null
    and coalesce(l.adiando_ate, l.lembrar_em, l.inicio_em) <= now();

  -- Lembrete personalizado de uma demanda.
  insert into public.notificacoes (
    tarefa_id,
    colaborador_id,
    tipo,
    mensagem,
    chave_deduplicacao
  )
  select
    t.id,
    coalesce(t.responsavel_id, t.criado_por),
    'prazo_proximo'::public.tipo_notificacao,
    'Lembrete de demanda',
    concat('tarefa-lembrete:', t.id, ':', coalesce(t.responsavel_id, t.criado_por), ':', extract(epoch from t.lembrar_em)::bigint)
  from public.tarefas t
  where t.arquivada_em is null
    and t.status <> 'concluida'::public.status_tarefa
    and t.lembrar_em is not null
    and t.lembrar_em <= now()
    and t.lembrete_enviado_em is null
  on conflict (chave_deduplicacao) do nothing;

  get diagnostics v_linhas = row_count;
  v_total := v_total + v_linhas;

  update public.tarefas t
  set lembrete_enviado_em = now()
  where t.arquivada_em is null
    and t.status <> 'concluida'::public.status_tarefa
    and t.lembrar_em is not null
    and t.lembrar_em <= now()
    and t.lembrete_enviado_em is null;

  -- Um único alerta de atraso por prazo configurado.
  insert into public.notificacoes (
    tarefa_id,
    colaborador_id,
    tipo,
    mensagem,
    chave_deduplicacao
  )
  select
    t.id,
    destino.colaborador_id,
    'prazo_proximo'::public.tipo_notificacao,
    'Demanda atrasada',
    concat('tarefa-atrasada:', t.id, ':', destino.colaborador_id, ':', extract(epoch from t.prazo_em)::bigint)
  from public.tarefas t
  cross join lateral (
    select distinct x.colaborador_id
    from unnest(array[t.responsavel_id, t.criado_por]) as x(colaborador_id)
    where x.colaborador_id is not null
  ) destino
  where t.arquivada_em is null
    and t.status <> 'concluida'::public.status_tarefa
    and t.prazo_em is not null
    and t.prazo_em < now()
    and t.atraso_notificado_em is null
  on conflict (chave_deduplicacao) do nothing;

  get diagnostics v_linhas = row_count;
  v_total := v_total + v_linhas;

  update public.tarefas t
  set atraso_notificado_em = now()
  where t.arquivada_em is null
    and t.status <> 'concluida'::public.status_tarefa
    and t.prazo_em is not null
    and t.prazo_em < now()
    and t.atraso_notificado_em is null;

  return v_total;
end;
$$;

-- Substitui o job diário antigo por uma verificação a cada 5 minutos.
do $$
declare
  v_jobid bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    for v_jobid in
      select jobid
      from cron.job
      where jobname in ('pmg-demandas-prazo-proximo', 'pmg-demandas-agenda')
    loop
      perform cron.unschedule(v_jobid);
    end loop;

    perform cron.schedule(
      'pmg-demandas-agenda',
      '*/5 * * * *',
      'select public.gerar_notificacoes_agenda();'
    );
  else
    raise notice 'Cron não agendado. Ative a integração Cron no Supabase e execute novamente este bloco.';
  end if;
exception
  when undefined_table or invalid_schema_name or undefined_function then
    raise notice 'Cron não agendado. Ative a integração Cron no Supabase e execute novamente este bloco.';
end
$$;

-- ============================================================
-- RLS E PERMISSÕES
-- ============================================================

alter table public.lembretes enable row level security;
alter table public.atividades_tarefa enable row level security;

drop policy if exists "usuario le agenda permitida" on public.lembretes;
drop policy if exists "autenticados leem atividades" on public.atividades_tarefa;

create policy "usuario le agenda permitida"
on public.lembretes
for select
to authenticated
using (
  visibilidade = 'equipe'
  or colaborador_id = public.meu_colaborador_id()
  or criado_por = public.meu_colaborador_id()
  or public.sou_gestor()
);

create policy "autenticados leem atividades"
on public.atividades_tarefa
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

revoke all privileges on table public.lembretes from anon, authenticated;
revoke all privileges on table public.atividades_tarefa from anon, authenticated;
grant select on table public.lembretes to authenticated;
grant select on table public.atividades_tarefa to authenticated;

-- Novas RPCs.
revoke all on function public.criar_tarefa_v2(text, text, public.prioridade_tarefa, uuid, timestamptz, timestamptz, text[], text, numeric) from public, anon;
revoke all on function public.editar_tarefa_v2(uuid, text, text, public.prioridade_tarefa, uuid, timestamptz, timestamptz, text[], text, numeric) from public, anon;
revoke all on function public.criar_lembrete(text, text, text, timestamptz, timestamptz, timestamptz, text, text) from public, anon;
revoke all on function public.editar_lembrete(uuid, text, text, text, timestamptz, timestamptz, timestamptz, text, text) from public, anon;
revoke all on function public.adiar_lembrete(uuid, integer) from public, anon;
revoke all on function public.concluir_lembrete(uuid) from public, anon;
revoke all on function public.excluir_lembrete(uuid) from public, anon;
revoke all on function public.proxima_ocorrencia(timestamptz, text) from public, anon;
revoke all on function public.gerar_notificacoes_agenda() from public, anon, authenticated;
revoke all on function public.registrar_atividade_tarefa() from public, anon, authenticated;
revoke all on function public.registrar_atividade_comentario() from public, anon, authenticated;
revoke all on function public.notificar_alteracao_prazo() from public, anon, authenticated;
revoke all on function public.sincronizar_conclusao_tarefa() from public, anon, authenticated;

grant execute on function public.criar_tarefa_v2(text, text, public.prioridade_tarefa, uuid, timestamptz, timestamptz, text[], text, numeric) to authenticated;
grant execute on function public.editar_tarefa_v2(uuid, text, text, public.prioridade_tarefa, uuid, timestamptz, timestamptz, text[], text, numeric) to authenticated;
grant execute on function public.criar_lembrete(text, text, text, timestamptz, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.editar_lembrete(uuid, text, text, text, timestamptz, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.adiar_lembrete(uuid, integer) to authenticated;
grant execute on function public.concluir_lembrete(uuid) to authenticated;
grant execute on function public.excluir_lembrete(uuid) to authenticated;
grant execute on function public.proxima_ocorrencia(timestamptz, text) to authenticated;

-- Colunas novas de notificações precisam estar visíveis ao cliente.
grant select on table public.notificacoes to authenticated;

-- ============================================================
-- REALTIME
-- ============================================================

alter table public.lembretes replica identity full;
alter table public.atividades_tarefa replica identity full;

do $$
declare
  v_tabela text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach v_tabela in array array['lembretes', 'atividades_tarefa']
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

-- Gera imediatamente o que já estiver vencido ou programado.
select public.gerar_notificacoes_agenda();

-- ============================================================
-- FIM DA MIGRAÇÃO V2
-- ============================================================
