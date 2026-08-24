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

  -- Contestação: devolve a autoria ao gestor, sem encerrar a tarefa.
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
      jsonb_build_object(
        'resultado', 'autoria_contestada',
        'observacao', nullif(trim(coalesce(p_observacao, '')), '')
      )
    );

    return jsonb_build_object('concluida', false, 'contestada', true);
  end if;

  select count(*) filter (where resposta = 'pendente'),
         count(*) filter (where resposta = 'contestado')
    into v_pendentes, v_contestadas
  from public.tarefa_autoria_confirmacoes
  where revisao_id = p_revisao_id;

  -- Ainda existem outros executores para responder.
  if v_pendentes > 0 or v_contestadas > 0 then
    return jsonb_build_object(
      'concluida', false,
      'contestada', v_contestadas > 0,
      'pendentes', v_pendentes
    );
  end if;

  -- Todos confirmaram. A aprovação já foi feita pelo gestor quando
  -- a revisão foi aberta, então NÃO chamamos avaliar_conclusao() aqui.
  -- Isso evita exigir sou_gestor() da sessão do último colaborador.
  update public.tarefa_autoria_revisoes
  set status = 'concluida', finalizado_em = now()
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
      tarefa_id,
      colaborador_id,
      tipo,
      mensagem,
      chave_deduplicacao
    )
    values (
      v_tarefa,
      v_responsavel,
      'avaliacao_aprovada'::public.tipo_notificacao,
      'A conclusão da sua demanda foi aprovada',
      concat('avaliacao-autoria:', v_tarefa, ':', v_responsavel, ':', p_revisao_id)
    )
    on conflict (chave_deduplicacao) do nothing;
  end if;

  return jsonb_build_object(
    'concluida', true,
    'contestada', false,
    'pendentes', 0
  );
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


-- ============================================================
-- HOTFIX V3.8.2 incorporado abaixo
-- ============================================================

-- ============================================================
-- PMG CONNECT — DEMANDAS V3.8.2
-- HOTFIX: confirmação de autoria por colaborador
-- 2026-08-24
--
-- Corrige o encerramento da confirmação coletiva. Na V3.8.1,
-- o último colaborador chamava public.avaliar_conclusao(), que
-- exige sou_gestor() = true. Como auth.uid() continuava sendo o
-- colaborador, o RPC falhava justamente na última confirmação.
--
-- Nova regra:
--   - o gestor já aprovou a entrega antes de abrir a confirmação;
--   - cada executor apenas confirma/contesta a autoria;
--   - quando todos confirmam, esta função encerra a demanda usando
--     o gestor salvo em tarefa_autoria_revisoes.gestor_id como
--     aprovador, sem conceder permissão de gestor ao colaborador.
-- ============================================================

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

  -- Contestação: devolve a autoria ao gestor, sem encerrar a tarefa.
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
      jsonb_build_object(
        'resultado', 'autoria_contestada',
        'observacao', nullif(trim(coalesce(p_observacao, '')), '')
      )
    );

    return jsonb_build_object('concluida', false, 'contestada', true);
  end if;

  select count(*) filter (where resposta = 'pendente'),
         count(*) filter (where resposta = 'contestado')
    into v_pendentes, v_contestadas
  from public.tarefa_autoria_confirmacoes
  where revisao_id = p_revisao_id;

  -- Ainda existem outros executores para responder.
  if v_pendentes > 0 or v_contestadas > 0 then
    return jsonb_build_object(
      'concluida', false,
      'contestada', v_contestadas > 0,
      'pendentes', v_pendentes
    );
  end if;

  -- Todos confirmaram. A aprovação já foi feita pelo gestor quando
  -- a revisão foi aberta, então NÃO chamamos avaliar_conclusao() aqui.
  -- Isso evita exigir sou_gestor() da sessão do último colaborador.
  update public.tarefa_autoria_revisoes
  set status = 'concluida', finalizado_em = now()
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
      tarefa_id,
      colaborador_id,
      tipo,
      mensagem,
      chave_deduplicacao
    )
    values (
      v_tarefa,
      v_responsavel,
      'avaliacao_aprovada'::public.tipo_notificacao,
      'A conclusão da sua demanda foi aprovada',
      concat('avaliacao-autoria:', v_tarefa, ':', v_responsavel, ':', p_revisao_id)
    )
    on conflict (chave_deduplicacao) do nothing;
  end if;

  return jsonb_build_object(
    'concluida', true,
    'contestada', false,
    'pendentes', 0
  );
end;
$$;

revoke all on function public.responder_confirmacao_autoria_v1(uuid, boolean, text) from public, anon;
grant execute on function public.responder_confirmacao_autoria_v1(uuid, boolean, text) to authenticated;

-- Validação rápida opcional depois de executar:
-- select pg_get_functiondef('public.responder_confirmacao_autoria_v1(uuid,boolean,text)'::regprocedure);
