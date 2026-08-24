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
