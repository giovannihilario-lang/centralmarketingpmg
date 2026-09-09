-- 33-HOTFIX-RECORRENCIAS-ESTADO.sql
--
-- Bug real, reproduzido em produção (2026-09-09): toda chamada a
-- processar_recorrencias_demanda() falhava com
--   ERROR 23514: new row for relation "demandas_recorrentes_ocorrencias"
--   violates check constraint "demandas_recorrentes_ocorrencias_estado_check"
--
-- Causa: um hotfix anterior trocou os valores permitidos de "estado" em
-- demandas_recorrentes_ocorrencias de (prevista, criada, pulada,
-- nao_realizada) para só (gerada, pulada, nao_realizada) — mas
-- materializar_ocorrencia_recorrente() nunca foi atualizada e continuava
-- inserindo 'prevista' e depois tentando virar 'criada'. Como essa função
-- roda a cada 60s no cliente (public/assets/demandas-v2.js,
-- processRecurringV36) e o erro era engolido em silêncio (catch sem
-- toast), o recurso de recorrências parava de responder sem nenhum
-- sintoma visível — exatamente o "recurso de recorrências não
-- respondendo" relatado.
--
-- Corrige materializar_ocorrencia_recorrente() para usar 'gerada' (valor
-- já permitido pela constraint atual e não usado em nenhum outro lugar)
-- como o estado único de "ocorrência virou tarefa", eliminando o estado
-- intermediário 'prevista' que não existe mais.

CREATE OR REPLACE FUNCTION public.materializar_ocorrencia_recorrente(p_recorrencia_id uuid, p_data date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  s public.demandas_recorrentes;
  o public.demandas_recorrentes_ocorrencias;
  v_task uuid;
  v_due timestamptz;
  v_dep uuid;
begin
  select * into s from public.demandas_recorrentes where id=p_recorrencia_id;
  if not found or not s.ativa or s.encerrada_em is not null then return null; end if;
  if not public.recorrencia_aplica_data(s,p_data) then return null; end if;

  insert into public.demandas_recorrentes_ocorrencias(recorrencia_id,data_referencia,estado)
  values(s.id,p_data,'gerada')
  on conflict(recorrencia_id,data_referencia) do nothing;

  select * into o from public.demandas_recorrentes_ocorrencias
  where recorrencia_id=s.id and data_referencia=p_data
  for update;

  if o.estado in ('pulada','nao_realizada') then return null; end if;
  if o.tarefa_id is not null then return o.tarefa_id; end if;

  v_due := ((p_data + s.horario_prazo)::timestamp at time zone 'America/Sao_Paulo');

  insert into public.tarefas(
    titulo,descricao,prioridade,responsavel_id,criado_por,prazo,prazo_em,
    lembrar_em,tags,tamanho,estimativa_horas,alerta_para_todos,projeto,
    checklist,lembrete_enviado_em,atraso_notificado_em,avaliacao_status,
    recorrencia_id,recorrencia_data
  ) values(
    s.titulo,nullif(trim(coalesce(s.descricao,'')),''),s.prioridade,s.responsavel_id,s.criado_por,
    p_data,v_due,null,s.tags,s.tamanho,s.estimativa_horas,s.alerta_para_todos,nullif(trim(coalesce(s.projeto,'')),''),
    coalesce(s.checklist,'[]'::jsonb),null,null,'nao_solicitada',s.id,p_data
  ) returning id into v_task;

  update public.demandas_recorrentes_ocorrencias
  set tarefa_id=v_task,atualizado_em=now()
  where id=o.id;

  -- A criação automática não deve disparar "nova demanda" antes do horário diário.
  delete from public.notificacoes where tarefa_id=v_task;

  -- O histórico deve apontar para quem criou a série, não para quem abriu o site.
  update public.atividades_tarefa
  set ator_id=s.criado_por
  where tarefa_id=v_task and tipo='criada';

  foreach v_dep in array coalesce(s.dependencias,'{}'::uuid[])
  loop
    if v_dep is null or v_dep=v_task then continue; end if;
    if exists(select 1 from public.tarefas where id=v_dep) then
      insert into public.dependencias_tarefa(tarefa_id,depende_de_tarefa_id,criado_por)
      values(v_task,v_dep,s.criado_por)
      on conflict do nothing;
    end if;
  end loop;

  return v_task;
end;
$function$;
