-- ============================================================
-- PMG CONNECT V3.5 — GESTÃO INTELIGENTE
-- Execute UMA VEZ no Supabase SQL Editor.
--
-- Adiciona:
-- - Projetos completos
-- - Central de Automações
-- - níveis de notificação
-- - automações por evento e periódicas
-- - resumo diário
-- - contador de retrabalho para relatórios/evolução
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- -------------------- NOTIFICAÇÕES --------------------------
alter table public.notificacoes add column if not exists mensagem text;
alter table public.notificacoes add column if not exists nivel text not null default 'normal';
alter table public.notificacoes add column if not exists origem_automacao_id uuid;

do $$ begin
  alter table public.notificacoes add constraint notificacoes_nivel_valido check (nivel in ('critica','importante','normal','informativa'));
exception when duplicate_object then null; end $$;

create index if not exists idx_notificacoes_nivel_pendentes on public.notificacoes(colaborador_id,nivel,lida,criado_em desc);

create or replace function public.definir_nivel_notificacao()
returns trigger language plpgsql as $$
begin
  if new.nivel is null or new.nivel = 'normal' then
    if new.tipo::text = 'demanda_imediata' then new.nivel := 'critica';
    elsif new.tipo::text in ('prazo_atrasado','avaliacao_pendente','avaliacao_ajustes','transferencia') then new.nivel := 'importante';
    elsif new.tipo::text in ('avaliacao_aprovada') then new.nivel := 'informativa';
    else new.nivel := coalesce(new.nivel,'normal');
    end if;
  end if;
  return new;
end $$;

drop trigger if exists trg_definir_nivel_notificacao on public.notificacoes;
create trigger trg_definir_nivel_notificacao before insert on public.notificacoes for each row execute function public.definir_nivel_notificacao();

update public.notificacoes set nivel = case
  when tipo::text='demanda_imediata' then 'critica'
  when tipo::text in ('prazo_atrasado','avaliacao_pendente','avaliacao_ajustes','transferencia') then 'importante'
  when tipo::text='avaliacao_aprovada' then 'informativa'
  else coalesce(nivel,'normal') end;

-- -------------------- RETRABALHO ----------------------------
alter table public.tarefas add column if not exists retrabalhos integer not null default 0;

create or replace function public.contabilizar_retrabalho_tarefa()
returns trigger language plpgsql as $$
begin
  if old.status::text='revisao' and new.status::text='andamento'
     and coalesce(new.avaliacao_status,'')='ajustes' then
    new.retrabalhos := coalesce(old.retrabalhos,0)+1;
  end if;
  return new;
end $$;

drop trigger if exists trg_contabilizar_retrabalho_tarefa on public.tarefas;
create trigger trg_contabilizar_retrabalho_tarefa before update on public.tarefas for each row execute function public.contabilizar_retrabalho_tarefa();

-- -------------------- PROJETOS ------------------------------
create table if not exists public.projetos_marketing (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  objetivo text,
  responsavel_id uuid references public.colaboradores(id) on delete set null,
  inicio_em date,
  prazo_em date,
  status text not null default 'ativo' check (status in ('planejado','ativo','pausado','concluido')),
  criado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint projetos_marketing_nome check (length(trim(nome))>0),
  constraint projetos_marketing_datas check (prazo_em is null or inicio_em is null or prazo_em>=inicio_em)
);
create unique index if not exists idx_projetos_marketing_nome_ci on public.projetos_marketing(lower(nome));
create index if not exists idx_projetos_marketing_status on public.projetos_marketing(status, prazo_em);

create or replace function public.salvar_projeto_marketing(
  p_id uuid, p_nome text, p_objetivo text, p_responsavel_id uuid,
  p_inicio_em date, p_prazo_em date, p_status text
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid; v_old_nome text;
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem salvar projetos'; end if;
  if nullif(trim(p_nome),'') is null then raise exception 'Informe o nome do projeto'; end if;
  if p_status not in ('planejado','ativo','pausado','concluido') then raise exception 'Status de projeto inválido'; end if;
  if p_prazo_em is not null and p_inicio_em is not null and p_prazo_em<p_inicio_em then raise exception 'Prazo final anterior ao início'; end if;
  if p_id is null then
    insert into public.projetos_marketing(nome,objetivo,responsavel_id,inicio_em,prazo_em,status,criado_por)
    values(trim(p_nome),nullif(trim(coalesce(p_objetivo,'')),''),p_responsavel_id,p_inicio_em,p_prazo_em,p_status,public.meu_colaborador_id()) returning id into v_id;
  else
    select nome into v_old_nome from public.projetos_marketing where id=p_id for update;
    if v_old_nome is null then raise exception 'Projeto não encontrado'; end if;
    update public.projetos_marketing set nome=trim(p_nome),objetivo=nullif(trim(coalesce(p_objetivo,'')),''),responsavel_id=p_responsavel_id,inicio_em=p_inicio_em,prazo_em=p_prazo_em,status=p_status,atualizado_em=now() where id=p_id returning id into v_id;
    if lower(v_old_nome)<>lower(trim(p_nome)) then update public.tarefas set projeto=trim(p_nome) where lower(coalesce(projeto,''))=lower(v_old_nome); end if;
  end if;
  return v_id;
end $$;

-- -------------------- AUTOMAÇÕES ----------------------------
create table if not exists public.automacoes_demanda (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  ativo boolean not null default true,
  gatilho text not null check (gatilho in ('tarefa_criada','status_alterado','prioridade_alterada','revisao','conclusao','prazo_24h','atrasada','sem_movimentacao_3d')),
  condicao_campo text not null default 'qualquer' check (condicao_campo in ('qualquer','prioridade','status','projeto','responsavel')),
  condicao_valor text,
  acao_destino text not null default 'responsavel' check (acao_destino in ('responsavel','criador','gestores','equipe')),
  nivel text not null default 'normal' check (nivel in ('critica','importante','normal','informativa')),
  mensagem text,
  criado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint automacoes_demanda_nome check(length(trim(nome))>0)
);
create index if not exists idx_automacoes_demanda_ativas on public.automacoes_demanda(ativo,gatilho);

create or replace function public.salvar_automacao_demanda(
  p_id uuid,p_nome text,p_gatilho text,p_condicao_campo text,p_condicao_valor text,
  p_acao_destino text,p_nivel text,p_mensagem text,p_ativo boolean
) returns uuid language plpgsql security definer set search_path=public as $$
declare v_id uuid;
begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem salvar automações'; end if;
  if p_gatilho not in ('tarefa_criada','status_alterado','prioridade_alterada','revisao','conclusao','prazo_24h','atrasada','sem_movimentacao_3d') then raise exception 'Gatilho inválido'; end if;
  if p_condicao_campo not in ('qualquer','prioridade','status','projeto','responsavel') then raise exception 'Condição inválida'; end if;
  if p_acao_destino not in ('responsavel','criador','gestores','equipe') then raise exception 'Destino inválido'; end if;
  if p_nivel not in ('critica','importante','normal','informativa') then raise exception 'Nível inválido'; end if;
  if p_id is null then
    insert into public.automacoes_demanda(nome,gatilho,condicao_campo,condicao_valor,acao_destino,nivel,mensagem,ativo,criado_por)
    values(trim(p_nome),p_gatilho,p_condicao_campo,nullif(trim(coalesce(p_condicao_valor,'')),''),p_acao_destino,p_nivel,nullif(trim(coalesce(p_mensagem,'')),''),coalesce(p_ativo,true),public.meu_colaborador_id()) returning id into v_id;
  else
    update public.automacoes_demanda set nome=trim(p_nome),gatilho=p_gatilho,condicao_campo=p_condicao_campo,condicao_valor=nullif(trim(coalesce(p_condicao_valor,'')),''),acao_destino=p_acao_destino,nivel=p_nivel,mensagem=nullif(trim(coalesce(p_mensagem,'')),''),ativo=coalesce(p_ativo,true),atualizado_em=now() where id=p_id returning id into v_id;
    if v_id is null then raise exception 'Automação não encontrada'; end if;
  end if;
  return v_id;
end $$;

create or replace function public.alternar_automacao_demanda(p_id uuid,p_ativo boolean)
returns void language plpgsql security definer set search_path=public as $$ begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem alterar automações'; end if;
  update public.automacoes_demanda set ativo=p_ativo,atualizado_em=now() where id=p_id;
end $$;
create or replace function public.excluir_automacao_demanda(p_id uuid)
returns void language plpgsql security definer set search_path=public as $$ begin
  if not public.sou_gestor() then raise exception 'Somente gestores podem excluir automações'; end if;
  delete from public.automacoes_demanda where id=p_id;
end $$;

create or replace function public.automacao_condicao_ok(p_rule public.automacoes_demanda,p_task public.tarefas)
returns boolean language sql stable as $$
  select case p_rule.condicao_campo
    when 'qualquer' then true
    when 'prioridade' then lower(p_task.prioridade::text)=lower(coalesce(p_rule.condicao_valor,''))
    when 'status' then lower(p_task.status::text)=lower(coalesce(p_rule.condicao_valor,''))
    when 'projeto' then lower(coalesce(p_task.projeto,''))=lower(coalesce(p_rule.condicao_valor,''))
    when 'responsavel' then (p_task.responsavel_id::text=coalesce(p_rule.condicao_valor,'') or exists(select 1 from public.colaboradores c where c.id=p_task.responsavel_id and lower(c.nome)=lower(coalesce(p_rule.condicao_valor,''))))
    else true end;
$$;

create or replace function public.automacao_destinatarios(p_destino text,p_task public.tarefas)
returns table(colaborador_id uuid) language sql stable security definer set search_path=public as $$
  select p_task.responsavel_id where p_destino='responsavel' and p_task.responsavel_id is not null
  union select p_task.criado_por where p_destino='criador' and p_task.criado_por is not null
  union select c.id from public.colaboradores c where p_destino='gestores' and c.ativo=true and c.role::text='gestor'
  union select c.id from public.colaboradores c where p_destino='equipe' and c.ativo=true;
$$;

create or replace function public.disparar_regra_automacao(p_rule public.automacoes_demanda,p_task public.tarefas,p_evento text,p_chave text)
returns integer language plpgsql security definer set search_path=public as $$
declare v_dest uuid;v_count integer:=0;v_message text;
begin
  if not public.automacao_condicao_ok(p_rule,p_task) then return 0; end if;
  v_message:=coalesce(nullif(trim(p_rule.mensagem),''),'Automação: '||p_rule.nome);
  for v_dest in select colaborador_id from public.automacao_destinatarios(p_rule.acao_destino,p_task) loop
    insert into public.notificacoes(tarefa_id,colaborador_id,tipo,mensagem,chave_deduplicacao,nivel,origem_automacao_id)
    values(p_task.id,v_dest,'status_mudou'::public.tipo_notificacao,v_message,'auto:'||p_rule.id||':'||p_task.id||':'||p_evento||':'||p_chave||':'||v_dest,p_rule.nivel,p_rule.id)
    on conflict(chave_deduplicacao) do nothing;
    if found then v_count:=v_count+1; end if;
  end loop;
  return v_count;
end $$;

create or replace function public.executar_automacoes_tarefa()
returns trigger language plpgsql security definer set search_path=public as $$
declare r public.automacoes_demanda;v_eventos text[]:=array[]::text[];v_event text;v_key text;
begin
  if tg_op='INSERT' then v_eventos:=array_append(v_eventos,'tarefa_criada');
  else
    if new.status is distinct from old.status then
      v_eventos:=array_append(v_eventos,'status_alterado');
      if new.status::text='revisao' then v_eventos:=array_append(v_eventos,'revisao'); end if;
      if new.status::text='concluida' then v_eventos:=array_append(v_eventos,'conclusao'); end if;
    end if;
    if new.prioridade is distinct from old.prioridade then v_eventos:=array_append(v_eventos,'prioridade_alterada'); end if;
  end if;
  v_key:=to_char(coalesce(new.atualizado_em,now()),'YYYYMMDDHH24MISSMS');
  foreach v_event in array v_eventos loop
    for r in select * from public.automacoes_demanda where ativo=true and gatilho=v_event loop
      perform public.disparar_regra_automacao(r,new,v_event,v_key);
    end loop;
  end loop;
  return new;
end $$;

drop trigger if exists trg_executar_automacoes_tarefa on public.tarefas;
create trigger trg_executar_automacoes_tarefa after insert or update on public.tarefas for each row execute function public.executar_automacoes_tarefa();

create or replace function public.processar_automacoes_periodicas()
returns integer language plpgsql security definer set search_path=public as $$
declare r public.automacoes_demanda;t public.tarefas;v_total integer:=0;v_due timestamptz;v_ok boolean;v_key text:=to_char((now() at time zone 'America/Sao_Paulo')::date,'YYYYMMDD');
begin
  for r in select * from public.automacoes_demanda where ativo=true and gatilho in ('prazo_24h','atrasada','sem_movimentacao_3d') loop
    for t in select * from public.tarefas where arquivada_em is null and status::text<>'concluida' loop
      v_due:=coalesce(t.prazo_em, case when t.prazo is not null then (t.prazo+time '17:00') at time zone 'America/Sao_Paulo' else null end);
      v_ok:=case r.gatilho
        when 'prazo_24h' then v_due is not null and v_due>now() and v_due<=now()+interval '24 hours'
        when 'atrasada' then v_due is not null and v_due<now()
        when 'sem_movimentacao_3d' then coalesce(t.atualizado_em,t.criado_em)<=now()-interval '3 days'
        else false end;
      if v_ok then v_total:=v_total+public.disparar_regra_automacao(r,t,r.gatilho,v_key); end if;
    end loop;
  end loop;
  return v_total;
end $$;

-- -------------------- RESUMO DIÁRIO -------------------------
create or replace function public.gerar_resumo_diario_demandas()
returns integer language plpgsql security definer set search_path=public as $$
declare c public.colaboradores;v_today date:=(now() at time zone 'America/Sao_Paulo')::date;v_hour integer:=extract(hour from now() at time zone 'America/Sao_Paulo');v_overdue integer;v_today_count integer;v_review integer;v_msg text;v_count integer:=0;
begin
  if v_hour<7 or v_hour>10 then return 0; end if;
  for c in select * from public.colaboradores where ativo=true loop
    select count(*) into v_overdue from public.tarefas t where t.arquivada_em is null and t.status::text<>'concluida' and t.responsavel_id=c.id and coalesce(t.prazo_em,(t.prazo+time '17:00') at time zone 'America/Sao_Paulo')<now();
    select count(*) into v_today_count from public.tarefas t where t.arquivada_em is null and t.status::text<>'concluida' and t.responsavel_id=c.id and (coalesce(t.prazo_em,(t.prazo+time '17:00') at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo')::date=v_today;
    if c.role::text='gestor' then select count(*) into v_review from public.tarefas t where t.arquivada_em is null and t.status::text='revisao'; else v_review:=0; end if;
    if v_overdue+v_today_count+v_review>0 then
      v_msg:=format('Resumo do dia: %s atrasada(s) · %s para hoje%s',v_overdue,v_today_count,case when v_review>0 then format(' · %s em revisão',v_review) else '' end);
      insert into public.notificacoes(colaborador_id,tipo,mensagem,chave_deduplicacao,nivel)
      values(c.id,'status_mudou'::public.tipo_notificacao,v_msg,'resumo-dia:'||c.id||':'||v_today,'informativa') on conflict(chave_deduplicacao) do nothing;
      if found then v_count:=v_count+1;end if;
    end if;
  end loop;
  return v_count;
end $$;

-- -------------------- RLS / GRANTS --------------------------
alter table public.projetos_marketing enable row level security;
alter table public.automacoes_demanda enable row level security;
drop policy if exists "autenticados leem projetos marketing" on public.projetos_marketing;
create policy "autenticados leem projetos marketing" on public.projetos_marketing for select to authenticated using(true);
drop policy if exists "autenticados leem automacoes demanda" on public.automacoes_demanda;
create policy "autenticados leem automacoes demanda" on public.automacoes_demanda for select to authenticated using(true);
revoke all on table public.projetos_marketing from anon,authenticated;
revoke all on table public.automacoes_demanda from anon,authenticated;
grant select on table public.projetos_marketing to authenticated;
grant select on table public.automacoes_demanda to authenticated;

grant execute on function public.salvar_projeto_marketing(uuid,text,text,uuid,date,date,text) to authenticated;
grant execute on function public.salvar_automacao_demanda(uuid,text,text,text,text,text,text,text,boolean) to authenticated;
grant execute on function public.alternar_automacao_demanda(uuid,boolean) to authenticated;
grant execute on function public.excluir_automacao_demanda(uuid) to authenticated;
grant execute on function public.processar_automacoes_periodicas() to authenticated;
grant execute on function public.gerar_resumo_diario_demandas() to authenticated;

alter table public.projetos_marketing replica identity full;
alter table public.automacoes_demanda replica identity full;

commit;

-- CONFERÊNCIA
select
  (select count(*) from public.projetos_marketing) as projetos,
  (select count(*) from public.automacoes_demanda) as automacoes,
  (select count(*) from public.notificacoes where nivel in ('critica','importante')) as notificacoes_prioritarias;
