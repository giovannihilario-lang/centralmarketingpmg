-- 37-HOTFIX-AUTORIA-REVISOES-STATUS.sql
--
-- Bug real, reproduzido em produção (2026-09-14): ao confirmar a autoria de
-- uma entrega compartilhada (2+ executores), quando a ÚLTIMA pessoa
-- confirma, a demanda deveria fechar sozinha — mas o toast mostrava:
--   ERROR 23514: new row for relation "tarefa_autoria_revisoes" violates
--   check constraint "tarefa_autoria_revisoes_status_check"
--
-- Causa: responder_confirmacao_autoria_v1() tenta marcar a revisão como
-- status='concluida' quando todo mundo já confirmou — mas a constraint
-- (mesmo padrão de nomeação de aguardando/confirmada/contestada/cancelada)
-- só aceita 'confirmada' para esse estado. 'concluida' nunca foi um valor
-- válido aqui — é o status de tarefas.status (enum diferente), não de
-- tarefa_autoria_revisoes.status. Como a violação de constraint derruba a
-- transação inteira, a demanda também nunca chegava a ser marcada como
-- concluída de verdade quando havia 2+ executores.
--
-- Corrige a única linha que usa o valor errado, sem mexer em mais nada da
-- função.

CREATE OR REPLACE FUNCTION public.responder_confirmacao_autoria_v1(p_revisao_id uuid, p_confirmar boolean, p_observacao text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  set status = 'confirmada',
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
    ) values (
      v_tarefa,
      v_responsavel,
      'status_mudou'::public.tipo_notificacao,
      'A conclusão da sua demanda foi aprovada',
      concat('avaliacao-autoria:', v_tarefa, ':', v_responsavel, ':', p_revisao_id)
    ) on conflict (chave_deduplicacao) do nothing;
  end if;

  return jsonb_build_object(
    'concluida', true,
    'contestada', false,
    'pendentes', 0
  );
end;
$function$;
