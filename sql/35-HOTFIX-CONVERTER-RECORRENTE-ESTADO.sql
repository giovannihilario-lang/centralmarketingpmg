-- 35-HOTFIX-CONVERTER-RECORRENTE-ESTADO.sql
--
-- Bug real, reproduzido em produção (2026-09-09): ao clicar em "Salvar série"
-- para transformar uma demanda existente em recorrente, a chamada falhava com
--   ERROR 23514: new row for relation "demandas_recorrentes_ocorrencias"
--   violates check constraint "demandas_recorrentes_ocorrencias_estado_check"
--
-- Causa: o mesmo hotfix que restringiu os valores permitidos de "estado" em
-- demandas_recorrentes_ocorrencias para (gerada, pulada, nao_realizada) — ver
-- sql/33-HOTFIX-RECORRENCIAS-ESTADO.sql — corrigiu materializar_ocorrencia_recorrente()
-- mas deixou passar uma função irmã, converter_tarefa_em_recorrente_v1(), que
-- ainda inseria a primeira ocorrência com estado='criada' (valor que já não
-- existe mais na constraint).
--
-- Corrige converter_tarefa_em_recorrente_v1() para usar 'gerada', mesmo valor
-- já adotado em materializar_ocorrencia_recorrente() para "ocorrência virou
-- tarefa".

CREATE OR REPLACE FUNCTION public.converter_tarefa_em_recorrente_v1(p_tarefa_id uuid, p_frequencia text, p_dias_semana integer[], p_data_inicio date, p_data_fim date, p_horario_prazo time without time zone, p_horario_alerta time without time zone, p_alerta_diario boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  t public.tarefas;
  v_id uuid;
  v_actor uuid := public.meu_colaborador_id();
  v_days smallint[];
  v_due timestamptz;
  v_dependencies uuid[];
begin
  if v_actor is null then raise exception 'Colaborador não encontrado ou inativo'; end if;
  if not public.sou_gestor() then raise exception 'Somente gestores podem transformar demandas em recorrentes'; end if;

  select * into t from public.tarefas where id = p_tarefa_id for update;
  if not found then raise exception 'Demanda não encontrada'; end if;
  if t.arquivada_em is not null then raise exception 'Restaure a demanda antes de transformá-la em recorrente'; end if;
  if t.status::text = 'concluida' then raise exception 'Uma demanda concluída não pode iniciar uma nova recorrência'; end if;
  if t.recorrencia_id is not null then return t.recorrencia_id; end if;
  if p_data_inicio is null then raise exception 'Informe a data inicial'; end if;
  if p_data_fim is not null and p_data_fim < p_data_inicio then raise exception 'A data final não pode ser anterior ao início'; end if;
  if p_frequencia not in ('diaria','dias_uteis','semanal','personalizada','mensal') then raise exception 'Frequência inválida'; end if;

  select coalesce(array_agg(x::smallint order by x),'{}'::smallint[]) into v_days
  from (select distinct unnest(coalesce(p_dias_semana,'{}'::integer[])) x) q
  where x between 1 and 7;

  if p_frequencia in ('semanal','personalizada') and cardinality(v_days)=0 then
    raise exception 'Selecione pelo menos um dia da semana';
  end if;

  select coalesce(array_agg(depende_de_tarefa_id),'{}'::uuid[]) into v_dependencies
  from public.dependencias_tarefa
  where tarefa_id = t.id;

  insert into public.demandas_recorrentes(
    titulo,descricao,prioridade,responsavel_id,criado_por,tags,tamanho,
    estimativa_horas,alerta_para_todos,projeto,checklist,dependencias,
    frequencia,dias_semana,data_inicio,data_fim,horario_prazo,
    horario_alerta,alerta_diario
  ) values(
    t.titulo,t.descricao,t.prioridade,t.responsavel_id,v_actor,
    coalesce(t.tags,'{}'::text[]),coalesce(t.tamanho,'media'),t.estimativa_horas,
    coalesce(t.alerta_para_todos,false),t.projeto,coalesce(t.checklist,'[]'::jsonb),
    coalesce(v_dependencies,'{}'::uuid[]),p_frequencia,v_days,p_data_inicio,p_data_fim,
    coalesce(p_horario_prazo,time '17:00'),coalesce(p_horario_alerta,time '09:00'),
    coalesce(p_alerta_diario,true)
  ) returning id into v_id;

  v_due := ((p_data_inicio + coalesce(p_horario_prazo,time '17:00'))::timestamp at time zone 'America/Sao_Paulo');

  update public.tarefas
  set recorrencia_id = v_id,
      recorrencia_data = p_data_inicio,
      prazo = p_data_inicio,
      prazo_em = v_due,
      atualizado_em = now()
  where id = t.id;

  insert into public.demandas_recorrentes_ocorrencias(
    recorrencia_id,data_referencia,tarefa_id,estado
  ) values(v_id,p_data_inicio,t.id,'gerada')
  on conflict(recorrencia_id,data_referencia) do update
    set tarefa_id = excluded.tarefa_id,
        estado = 'gerada',
        atualizado_em = now();

  return v_id;
end;
$function$;
