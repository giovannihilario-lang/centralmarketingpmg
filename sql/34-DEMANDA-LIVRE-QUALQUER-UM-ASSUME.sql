-- 34-DEMANDA-LIVRE-QUALQUER-UM-ASSUME.sql
--
-- Pedido do usuário: quando uma demanda não tem responsável (ninguém foi
-- selecionado na criação), ela fica "livre" e qualquer colaborador ativo
-- pode assumi-la para si.
--
-- Já existia uma regra parecida, mas só para o caso muito específico de
-- demanda "imediata" com "alerta para todos": nesse caso, um colaborador
-- não-gestor e não-responsável podia chamar atualizar_status(id,'andamento')
-- e a função assumia a tarefa para ele via definir_responsaveis_tarefa_claim_v1().
-- Para qualquer OUTRA demanda sem responsável, o colaborador caía direto no
-- "raise exception 'Você só pode alterar tarefas atribuídas a você'".
--
-- Esta função generaliza essa mesma regra: qualquer demanda com
-- responsavel_id IS NULL pode ser assumida por qualquer colaborador ativo
-- ao mover o status para 'andamento' — não só a combinação
-- imediata+alerta_para_todos. Demandas em modo "primeiro a cumprir" não são
-- afetadas: elas já são resolvidas antes deste trecho (bloco
-- `if v_modo='primeiro_cumprir' and v_responsavel_id is null`, mais acima
-- na função), que já define v_eh_responsavel=true quando o candidato
-- reivindica — então continuam restritas aos candidatos pré-selecionados.

CREATE OR REPLACE FUNCTION public.atualizar_status(p_tarefa_id uuid, p_status status_tarefa)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ator_id uuid:=public.meu_colaborador_id();
  v_responsavel_id uuid;
  v_arquivada_em timestamptz;
  v_prioridade public.prioridade_tarefa;
  v_alerta_para_todos boolean;
  v_eh_gestor boolean:=public.sou_gestor();
  v_eh_responsavel boolean;
  v_modo text;
  v_status_atual public.status_tarefa;
  v_prazo_pausado_em timestamptz;
  v_pausa interval;
begin
  if v_ator_id is null then raise exception 'Colaborador não encontrado ou inativo'; end if;
  if p_status is null then raise exception 'O status é obrigatório'; end if;

  select
    t.responsavel_id,
    t.arquivada_em,
    t.prioridade,
    coalesce(t.alerta_para_todos,false),
    coalesce(t.modo_responsabilidade,'compartilhada'),
    t.status,
    t.prazo_pausado_em
  into
    v_responsavel_id,
    v_arquivada_em,
    v_prioridade,
    v_alerta_para_todos,
    v_modo,
    v_status_atual,
    v_prazo_pausado_em
  from public.tarefas t
  where t.id=p_tarefa_id
  for update;

  if not found then raise exception 'Tarefa não encontrada'; end if;
  if v_arquivada_em is not null then raise exception 'Não é possível alterar uma tarefa arquivada'; end if;

  v_eh_responsavel:=public.eh_responsavel_da_tarefa_v1(p_tarefa_id,v_ator_id);

  if v_modo='primeiro_cumprir' and v_responsavel_id is null then
    if p_status<>'andamento'::public.status_tarefa then
      raise exception 'Esta demanda precisa ser assumida pelo botão Iniciar antes de avançar';
    end if;
    if not v_eh_responsavel then raise exception 'Você não está entre os candidatos desta demanda'; end if;

    perform public.reivindicar_tarefa_primeiro_cumprir_v1(p_tarefa_id,v_ator_id);
    v_responsavel_id:=v_ator_id;
    v_eh_responsavel:=true;
  end if;

  if not v_eh_gestor and not v_eh_responsavel then
    -- Demanda livre (sem responsável, fora do modo "primeiro a cumprir"):
    -- qualquer colaborador ativo pode assumi-la ao movê-la para "andamento".
    if v_responsavel_id is null and p_status='andamento'::public.status_tarefa then
      perform public.definir_responsaveis_tarefa_claim_v1(p_tarefa_id,v_ator_id);
      update public.tarefas
      set status='andamento'::public.status_tarefa,
          avaliacao_status='nao_solicitada'
      where id=p_tarefa_id;
      return;
    end if;

    raise exception 'Você só pode alterar tarefas atribuídas a você';
  end if;

  if p_status='concluida'::public.status_tarefa then
    raise exception 'A conclusão precisa ser avaliada por um gestor';
  end if;

  if p_status='revisao'::public.status_tarefa
     and v_status_atual<>'revisao'::public.status_tarefa then

    update public.tarefas
    set prazo_pausado_em=now()
    where id=p_tarefa_id;

    if to_regclass('public.registros_tempo') is not null then
      update public.registros_tempo
      set fim_em=now()
      where tarefa_id=p_tarefa_id
        and fim_em is null;
    end if;

    update public.notificacoes
    set lida=true
    where tarefa_id=p_tarefa_id
      and tipo::text in ('prazo_proximo','prazo_atrasado')
      and coalesce(lida,false)=false;
  end if;

  if v_status_atual='revisao'::public.status_tarefa
     and p_status<>'revisao'::public.status_tarefa
     and v_prazo_pausado_em is not null then

    v_pausa:=greatest(interval '0 seconds',now()-v_prazo_pausado_em);

    update public.tarefas
    set
      prazo_em=case when prazo_em is not null then prazo_em+v_pausa else prazo_em end,
      prazo_pausado_total_segundos=
        coalesce(prazo_pausado_total_segundos,0)
        + greatest(0,floor(extract(epoch from v_pausa))::bigint),
      prazo_pausado_em=null
    where id=p_tarefa_id;
  end if;

  update public.tarefas
  set
    status=p_status,
    avaliacao_status=case
      when p_status='revisao'::public.status_tarefa then 'pendente'
      else 'nao_solicitada'
    end,
    avaliacao_observacao=case
      when p_status='revisao'::public.status_tarefa then null
      else avaliacao_observacao
    end,
    avaliado_por=case
      when p_status='revisao'::public.status_tarefa then null
      else avaliado_por
    end,
    avaliado_em=case
      when p_status='revisao'::public.status_tarefa then null
      else avaliado_em
    end,
    atualizado_em=now()
  where id=p_tarefa_id;
end;
$function$;
