-- PMG CONNECT — ROLLBACK WAVE 2
-- Remove somente estruturas/colunas introduzidas pela migration 27.
-- Não toca em histórico financeiro, fornecedores ou Demandas anteriores.

begin;

drop function if exists public.processar_automacoes_operacionais_wave2();

-- RPCs Wave 2
drop function if exists public.salvar_decisao_qualidade_wave2(text,text,text,text);
drop function if exists public.executar_automacao_evento_wave2(text,text,text,text,jsonb);
drop function if exists public.salvar_automacao_operacional_v2(uuid,text,text,integer,boolean,boolean,text,text,bigint,jsonb,boolean);
drop function if exists public.resolver_checkin_academia_v2(text);
drop function if exists public.criar_checkin_academia_v2(uuid,timestamptz);
drop function if exists public.registrar_presenca_academia_v2(uuid,text,text,text,text);
drop function if exists public.revisar_inscricao_academia_v2(uuid,text,text,boolean);
drop function if exists public.importar_inscricao_academia_v2(uuid,text,text,text,text,text,text,text,text,text,jsonb,text);
drop function if exists public.atualizar_treinamento_academia_v2(uuid,bigint,timestamptz,text,text,boolean);
drop function if exists public.vincular_tarefa_entidades_v2(uuid,bigint,text,uuid,uuid,uuid,text);
drop function if exists public.vincular_recorrencia_fornecedor_v2(uuid,bigint);
drop function if exists public.revisar_asset_fornecedor_v2(uuid,text,text);
drop function if exists public.finalizar_asset_fornecedor_v2(bigint,uuid,text,text,text,text,text,bigint,integer,integer,text,text,uuid,text);
drop function if exists public.resolver_portal_fornecedor_token_v2(text);
drop function if exists public.revogar_portal_fornecedor_token_v2(uuid);
drop function if exists public.criar_portal_fornecedor_token_v2(uuid,timestamptz);
drop function if exists public.registrar_followup_fornecedor_v2(bigint,uuid,uuid,text,text);
drop function if exists public.criar_demanda_para_obrigacao_v2(uuid);
drop function if exists public.salvar_obrigacao_fornecedor_v2(uuid,bigint,text,text,text,text,date,text,text,uuid,uuid,text,text,text,uuid,text);
drop function if exists public.salvar_contato_fornecedor_v2(uuid,bigint,text,text,text,text,text,text,boolean,boolean,text);
drop function if exists public.wave2_auditar(text,text,text,text,bigint,jsonb);
drop function if exists public.wave2_tem_capacidade(text);

-- Trigger de recorrência
drop trigger if exists trg_wave2_propagar_fornecedor_ocorrencia on public.demandas_recorrentes_ocorrencias;
drop function if exists public.wave2_propagar_fornecedor_ocorrencia();

-- Storage bucket: remove somente se vazio; não destrói arquivos silenciosamente.
do $$ begin
  if not exists(select 1 from storage.objects where bucket_id='pmg-supplier-assets') then
    delete from storage.buckets where id='pmg-supplier-assets';
  end if;
end $$;
drop policy if exists "wave2 equipe le supplier assets" on storage.objects;

-- Tabelas Wave 2, em ordem de dependência.
drop table if exists public.fornecedor_portal_submissoes;
drop table if exists public.fornecedor_portal_tokens;
drop table if exists public.fornecedor_followups;
alter table public.fornecedor_obrigacoes drop column if exists asset_principal_id;
drop table if exists public.fornecedor_assets;
drop table if exists public.automacao_execucoes;
drop table if exists public.academia_presencas;
drop table if exists public.academia_inscricoes;
drop table if exists public.academia_representante_aliases;
drop table if exists public.wave2_qualidade_decisoes;
drop table if exists public.operational_audit_events;

-- Relações de tarefas antes de apagar obrigações.
alter table public.tarefas drop column if exists obrigacao_id;
alter table public.tarefas drop column if exists treinamento_id;
alter table public.tarefas drop column if exists campanha_ref;
alter table public.tarefas drop column if exists documento_id;
alter table public.tarefas drop column if exists catalogo_contexto;

drop table if exists public.fornecedor_obrigacoes;
drop table if exists public.fornecedor_contatos;

-- Recorrência / Academia
alter table public.demandas_recorrentes drop column if exists fornecedor_id;

alter table public.academia_reservas drop column if exists fornecedor_id;
alter table public.academia_reservas drop column if exists inscricao_limite;
alter table public.academia_reservas drop column if exists modalidade;
alter table public.academia_reservas drop column if exists local_treinamento;
alter table public.academia_reservas drop column if exists ativo;
alter table public.academia_reservas drop column if exists checkin_token_hash;
alter table public.academia_reservas drop column if exists checkin_expira_em;
alter table public.academia_reservas drop column if exists checkin_revogado_em;

-- Extensões do motor antigo de automação ficam removidas, sem apagar regras antigas.
-- Primeiro apaga apenas as regras operacionais Wave 2; depois remove a coluna usada no filtro.
do $$ begin
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='automacoes_demanda' and column_name='escopo'
  ) then
    delete from public.automacoes_demanda where escopo='operacional';
  end if;
end $$;
alter table public.automacoes_demanda drop column if exists escopo;
alter table public.automacoes_demanda drop column if exists antecedencia;
alter table public.automacoes_demanda drop column if exists acao_criar_alerta;
alter table public.automacoes_demanda drop column if exists acao_criar_demanda;
alter table public.automacoes_demanda drop column if exists fornecedor_id;
alter table public.automacoes_demanda drop column if exists parametros;
alter table public.automacoes_demanda drop constraint if exists automacoes_demanda_gatilho_check;
alter table public.automacoes_demanda add constraint automacoes_demanda_gatilho_check check(gatilho in ('tarefa_criada','status_alterado','prioridade_alterada','revisao','conclusao','prazo_24h','atrasada','sem_movimentacao_3d'));

-- Capacidades novas
alter table public.colaboradores drop column if exists pode_gerenciar_fornecedores;
alter table public.colaboradores drop column if exists pode_aprovar_materiais;
alter table public.colaboradores drop column if exists pode_gerenciar_automacoes;
alter table public.colaboradores drop column if exists pode_corrigir_presenca;
alter table public.colaboradores drop column if exists pode_gerenciar_academia;

commit;
