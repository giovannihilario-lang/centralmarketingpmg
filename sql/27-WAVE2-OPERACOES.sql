-- ============================================================
-- PMG CONNECT — PRODUCT EVOLUTION WAVE 2
-- Calendário agregado, obrigações, materiais, contatos, portal,
-- automações operacionais, Academia e relações de entidades.
-- Requer a migration 26 (Wave 1B) antes desta.
-- Não reescreve histórico financeiro/comercial.
-- ============================================================

begin;

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- CAPACIDADES (gestor sempre possui todas)
-- ------------------------------------------------------------
alter table public.colaboradores add column if not exists pode_gerenciar_fornecedores boolean not null default false;
alter table public.colaboradores add column if not exists pode_aprovar_materiais boolean not null default false;
alter table public.colaboradores add column if not exists pode_gerenciar_automacoes boolean not null default false;
alter table public.colaboradores add column if not exists pode_corrigir_presenca boolean not null default false;
alter table public.colaboradores add column if not exists pode_gerenciar_academia boolean not null default false;

create or replace function public.wave2_tem_capacidade(p_capacidade text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select c.role::text = 'gestor' or case lower(coalesce(p_capacidade,''))
      when 'fornecedores' then c.pode_gerenciar_fornecedores
      when 'materiais' then c.pode_aprovar_materiais
      when 'automacoes' then c.pode_gerenciar_automacoes
      when 'academia' then coalesce(c.pode_gerenciar_academia,false)
      when 'presenca' then c.pode_corrigir_presenca or coalesce(c.pode_gerenciar_academia,false)
      else false end
    from public.colaboradores c
    where c.id = public.meu_colaborador_id() and c.ativo = true
  ), false);
$$;
revoke all on function public.wave2_tem_capacidade(text) from public, anon;
grant execute on function public.wave2_tem_capacidade(text) to authenticated;

-- ------------------------------------------------------------
-- AUDITORIA OPERACIONAL
-- ------------------------------------------------------------
create table if not exists public.operational_audit_events (
  id uuid primary key default gen_random_uuid(),
  modulo text not null,
  acao text not null,
  entidade_tipo text not null,
  entidade_id text not null,
  fornecedor_id bigint references public.fornecedores(id) on delete set null,
  ator_id uuid references public.colaboradores(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  constraint operational_audit_texto check (length(trim(modulo))>0 and length(trim(acao))>0 and length(trim(entidade_tipo))>0 and length(trim(entidade_id))>0)
);
create index if not exists idx_operational_audit_entity on public.operational_audit_events(entidade_tipo, entidade_id, criado_em desc);
create index if not exists idx_operational_audit_supplier on public.operational_audit_events(fornecedor_id, criado_em desc) where fornecedor_id is not null;

create or replace function public.wave2_auditar(
  p_modulo text, p_acao text, p_entidade_tipo text, p_entidade_id text,
  p_fornecedor_id bigint default null, p_metadata jsonb default '{}'::jsonb
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  insert into public.operational_audit_events(modulo,acao,entidade_tipo,entidade_id,fornecedor_id,ator_id,metadata)
  values(trim(p_modulo),trim(p_acao),trim(p_entidade_tipo),trim(p_entidade_id),p_fornecedor_id,public.meu_colaborador_id(),coalesce(p_metadata,'{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.wave2_auditar(text,text,text,text,bigint,jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------
-- CONTATOS DE FORNECEDOR
-- ------------------------------------------------------------
create table if not exists public.fornecedor_contatos (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id bigint not null references public.fornecedores(id) on delete cascade,
  nome text not null,
  departamento text not null default 'Outros',
  cargo text,
  email text,
  telefone text,
  whatsapp text,
  preferido boolean not null default false,
  ativo boolean not null default true,
  observacoes text,
  criado_por uuid references public.colaboradores(id) on delete set null,
  atualizado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint fornecedor_contatos_nome check(length(trim(nome))>0),
  constraint fornecedor_contatos_departamento check(departamento in ('Comercial','Marketing','Financeiro','Diretoria','Logistica','Outros'))
);
create index if not exists idx_fornecedor_contatos_supplier on public.fornecedor_contatos(fornecedor_id, ativo, departamento);
create unique index if not exists idx_fornecedor_contato_preferido_area on public.fornecedor_contatos(fornecedor_id, departamento) where preferido=true and ativo=true;

-- ------------------------------------------------------------
-- OBRIGAÇÕES / PENDÊNCIAS DE FORNECEDOR
-- ------------------------------------------------------------
create table if not exists public.fornecedor_obrigacoes (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id bigint not null references public.fornecedores(id) on delete cascade,
  tipo text not null,
  titulo text not null,
  descricao text,
  contexto text not null default 'geral',
  prazo date,
  status text not null default 'pendente',
  direcao_responsabilidade text not null default 'fornecedor',
  responsavel_id uuid references public.colaboradores(id) on delete set null,
  contato_id uuid references public.fornecedor_contatos(id) on delete set null,
  campanha_ref text,
  projeto_ref text,
  catalogo_contexto text,
  documento_id uuid references public.acompanhamento_documentos_entrada(id) on delete set null,
  tarefa_id uuid references public.tarefas(id) on delete set null,
  recebido_em timestamptz,
  aprovado_em timestamptz,
  observacoes text,
  criado_por uuid references public.colaboradores(id) on delete set null,
  atualizado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint fornecedor_obrigacao_tipo check(tipo in ('anuncio_catalogo','logo','imagem_produto','nota_fiscal','recibo','contrato','material_evento','painel_info','foto','confirmacao','material_pagamento','informacao','outro')),
  constraint fornecedor_obrigacao_status check(status in ('pendente','solicitado','recebido','em_revisao','ajuste_solicitado','aprovado','dispensado')),
  constraint fornecedor_obrigacao_direcao check(direcao_responsabilidade in ('pmg','fornecedor','concluido')),
  constraint fornecedor_obrigacao_titulo check(length(trim(titulo))>0)
);
create index if not exists idx_fornecedor_obrigacoes_supplier on public.fornecedor_obrigacoes(fornecedor_id,status,prazo);
create index if not exists idx_fornecedor_obrigacoes_due on public.fornecedor_obrigacoes(prazo,status,direcao_responsabilidade) where status not in ('aprovado','dispensado');
create index if not exists idx_fornecedor_obrigacoes_catalogo on public.fornecedor_obrigacoes(catalogo_contexto,fornecedor_id) where contexto='catalogo';

-- ------------------------------------------------------------
-- ASSETS / MATERIAIS DIGITAIS
-- ------------------------------------------------------------
create table if not exists public.fornecedor_assets (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id bigint not null references public.fornecedores(id) on delete cascade,
  obrigacao_id uuid references public.fornecedor_obrigacoes(id) on delete set null,
  tipo text not null default 'Outro',
  contexto text,
  campanha_ref text,
  catalogo_contexto text,
  nome_original text not null,
  storage_bucket text not null default 'pmg-supplier-assets',
  storage_path text not null,
  mime text not null,
  extensao text,
  tamanho_bytes bigint not null,
  largura integer,
  altura integer,
  sha256 text not null,
  status_revisao text not null default 'aguardando',
  versao integer not null default 1,
  origem text not null default 'interno',
  enviado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint fornecedor_assets_tipo check(tipo in ('Logo','Imagem de produto','Anuncio','Campanha','Institucional','Evento','Documento','Outro')),
  constraint fornecedor_assets_revisao check(status_revisao in ('aguardando','aprovado','ajuste_solicitado','rejeitado')),
  constraint fornecedor_assets_origem check(origem in ('interno','portal_fornecedor')),
  constraint fornecedor_assets_size check(tamanho_bytes > 0 and tamanho_bytes <= 10485760),
  constraint fornecedor_assets_hash check(sha256 ~ '^[a-f0-9]{64}$')
);
create unique index if not exists idx_fornecedor_assets_path on public.fornecedor_assets(storage_bucket,storage_path);
create unique index if not exists idx_fornecedor_assets_hash_supplier on public.fornecedor_assets(fornecedor_id,sha256);
create index if not exists idx_fornecedor_assets_supplier on public.fornecedor_assets(fornecedor_id,tipo,criado_em desc);
create index if not exists idx_fornecedor_assets_obligation on public.fornecedor_assets(obrigacao_id,criado_em desc) where obrigacao_id is not null;

alter table public.fornecedor_obrigacoes add column if not exists asset_principal_id uuid references public.fornecedor_assets(id) on delete set null;

-- ------------------------------------------------------------
-- FOLLOW-UP
-- ------------------------------------------------------------
create table if not exists public.fornecedor_followups (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id bigint not null references public.fornecedores(id) on delete cascade,
  obrigacao_id uuid references public.fornecedor_obrigacoes(id) on delete set null,
  contato_id uuid references public.fornecedor_contatos(id) on delete set null,
  canal text not null default 'email',
  observacoes text,
  realizado_por uuid references public.colaboradores(id) on delete set null,
  realizado_em timestamptz not null default now(),
  constraint fornecedor_followup_canal check(canal in ('email','whatsapp','telefone','reuniao','outro'))
);
create index if not exists idx_fornecedor_followups_supplier on public.fornecedor_followups(fornecedor_id,realizado_em desc);

-- ------------------------------------------------------------
-- PORTAL EXTERNO ESCOPADO
-- ------------------------------------------------------------
create table if not exists public.fornecedor_portal_tokens (
  id uuid primary key default gen_random_uuid(),
  fornecedor_id bigint not null references public.fornecedores(id) on delete cascade,
  obrigacao_id uuid not null references public.fornecedor_obrigacoes(id) on delete cascade,
  token_hash text not null unique,
  token_prefix text not null,
  allowed_mimes text[] not null default array['image/jpeg','image/png','image/webp','application/pdf'],
  max_bytes integer not null default 10485760,
  expira_em timestamptz,
  revogado_em timestamptz,
  criado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  ultimo_acesso_em timestamptz,
  constraint fornecedor_portal_max check(max_bytes between 1024 and 10485760)
);
create index if not exists idx_fornecedor_portal_active on public.fornecedor_portal_tokens(obrigacao_id,expira_em) where revogado_em is null;

create table if not exists public.fornecedor_portal_submissoes (
  id uuid primary key default gen_random_uuid(),
  token_id uuid not null references public.fornecedor_portal_tokens(id) on delete restrict,
  fornecedor_id bigint not null references public.fornecedores(id) on delete cascade,
  obrigacao_id uuid not null references public.fornecedor_obrigacoes(id) on delete cascade,
  asset_id uuid references public.fornecedor_assets(id) on delete set null,
  mensagem text,
  sha256 text,
  status text not null default 'recebido',
  recebido_em timestamptz not null default now(),
  constraint fornecedor_portal_submission_status check(status in ('recebido','duplicado','falhou'))
);
create index if not exists idx_fornecedor_submissoes_obligation on public.fornecedor_portal_submissoes(obrigacao_id,recebido_em desc);
create unique index if not exists idx_fornecedor_submissoes_token_hash on public.fornecedor_portal_submissoes(token_id,sha256) where sha256 is not null;

-- ------------------------------------------------------------
-- QUALIDADE DE DADOS WAVE 2
-- ------------------------------------------------------------
create table if not exists public.wave2_qualidade_decisoes (
  issue_key text primary key,
  modulo text not null,
  estado text not null,
  observacoes text,
  atualizado_por uuid references public.colaboradores(id) on delete set null,
  atualizado_em timestamptz not null default now(),
  constraint wave2_quality_state check(estado in ('resolvido','ignorado'))
);

-- ------------------------------------------------------------
-- RELAÇÕES DE DEMANDAS
-- ------------------------------------------------------------
alter table public.tarefas add column if not exists campanha_ref text;
alter table public.tarefas add column if not exists documento_id uuid references public.acompanhamento_documentos_entrada(id) on delete set null;
alter table public.tarefas add column if not exists obrigacao_id uuid references public.fornecedor_obrigacoes(id) on delete set null;
alter table public.tarefas add column if not exists treinamento_id uuid references public.academia_reservas(id) on delete set null;
alter table public.tarefas add column if not exists catalogo_contexto text;
create index if not exists idx_tarefas_obrigacao on public.tarefas(obrigacao_id) where obrigacao_id is not null;
create index if not exists idx_tarefas_treinamento on public.tarefas(treinamento_id) where treinamento_id is not null;

-- Recorrências agora preservam fornecedor.
alter table public.demandas_recorrentes add column if not exists fornecedor_id bigint references public.fornecedores(id) on delete set null;
create index if not exists idx_demandas_recorrentes_fornecedor on public.demandas_recorrentes(fornecedor_id) where fornecedor_id is not null;

create or replace function public.wave2_propagar_fornecedor_ocorrencia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_fornecedor bigint;
begin
  if new.tarefa_id is null then return new; end if;
  select r.fornecedor_id into v_fornecedor from public.demandas_recorrentes r where r.id=new.recorrencia_id;
  if v_fornecedor is not null then
    update public.tarefas set fornecedor_id=v_fornecedor where id=new.tarefa_id and fornecedor_id is distinct from v_fornecedor;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_wave2_propagar_fornecedor_ocorrencia on public.demandas_recorrentes_ocorrencias;
create trigger trg_wave2_propagar_fornecedor_ocorrencia
after insert or update of tarefa_id on public.demandas_recorrentes_ocorrencias
for each row execute function public.wave2_propagar_fornecedor_ocorrencia();

create or replace function public.vincular_recorrencia_fornecedor_v2(p_recorrencia_id uuid,p_fornecedor_id bigint)
returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_rec public.demandas_recorrentes;
begin
  if auth.uid() is null or v_ator is null then raise exception 'Sessão PMG obrigatória'; end if;
  if p_fornecedor_id is not null and not exists(select 1 from public.fornecedores f where f.id=p_fornecedor_id) then raise exception 'Fornecedor inválido'; end if;
  select * into v_rec from public.demandas_recorrentes where id=p_recorrencia_id for update;
  if not found then raise exception 'Recorrência não encontrada'; end if;
  if not public.sou_gestor()
     and v_rec.criado_por is distinct from v_ator
     and v_rec.responsavel_id is distinct from v_ator
     and not exists(select 1 from public.demanda_recorrente_responsaveis rr where rr.recorrencia_id=p_recorrencia_id and rr.colaborador_id=v_ator)
  then raise exception 'Você não pode alterar o fornecedor desta recorrência'; end if;
  update public.demandas_recorrentes set fornecedor_id=p_fornecedor_id, atualizado_em=now() where id=p_recorrencia_id;
  update public.tarefas t set fornecedor_id=p_fornecedor_id
  from public.demandas_recorrentes_ocorrencias o
  where o.recorrencia_id=p_recorrencia_id and o.tarefa_id=t.id;
  return p_recorrencia_id;
end;
$$;

create or replace function public.vincular_tarefa_entidades_v2(
  p_tarefa_id uuid,
  p_fornecedor_id bigint default null,
  p_campanha_ref text default null,
  p_documento_id uuid default null,
  p_obrigacao_id uuid default null,
  p_treinamento_id uuid default null,
  p_catalogo_contexto text default null
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_tarefa public.tarefas;
begin
  if auth.uid() is null or v_ator is null then raise exception 'Sessão PMG obrigatória'; end if;
  select * into v_tarefa from public.tarefas where id=p_tarefa_id for update;
  if not found then raise exception 'Demanda não encontrada'; end if;
  if not public.sou_gestor()
     and v_tarefa.criado_por is distinct from v_ator
     and v_tarefa.responsavel_id is distinct from v_ator
     and not exists(select 1 from public.tarefa_responsaveis tr where tr.tarefa_id=p_tarefa_id and tr.colaborador_id=v_ator)
  then raise exception 'Você não pode alterar os relacionamentos desta demanda'; end if;
  if p_fornecedor_id is not null and not exists(select 1 from public.fornecedores f where f.id=p_fornecedor_id) then raise exception 'Fornecedor inválido'; end if;
  if p_documento_id is not null and not exists(select 1 from public.acompanhamento_documentos_entrada d where d.id=p_documento_id) then raise exception 'Documento inválido'; end if;
  if p_obrigacao_id is not null and not exists(select 1 from public.fornecedor_obrigacoes o where o.id=p_obrigacao_id and (p_fornecedor_id is null or o.fornecedor_id=p_fornecedor_id)) then raise exception 'Obrigação inválida para este fornecedor'; end if;
  if p_treinamento_id is not null and not exists(select 1 from public.academia_reservas a where a.id=p_treinamento_id and a.tipo_registro='treinamento') then raise exception 'Treinamento inválido'; end if;
  update public.tarefas set
    fornecedor_id=p_fornecedor_id,
    campanha_ref=nullif(trim(coalesce(p_campanha_ref,'')),''),
    documento_id=p_documento_id,
    obrigacao_id=p_obrigacao_id,
    treinamento_id=p_treinamento_id,
    catalogo_contexto=nullif(trim(coalesce(p_catalogo_contexto,'')),''),
    atualizado_em=now()
  where id=p_tarefa_id;
  return p_tarefa_id;
end;
$$;

-- ------------------------------------------------------------
-- ACADEMIA PMG — INSCRIÇÕES / PRESENÇA SEM DUPLICAR REPRESENTANTES
-- ------------------------------------------------------------
alter table public.academia_reservas add column if not exists fornecedor_id bigint references public.fornecedores(id) on delete set null;
alter table public.academia_reservas add column if not exists inscricao_limite timestamptz;
alter table public.academia_reservas add column if not exists modalidade text not null default 'presencial';
alter table public.academia_reservas add column if not exists local_treinamento text;
alter table public.academia_reservas add column if not exists ativo boolean not null default true;
alter table public.academia_reservas add column if not exists checkin_token_hash text;
alter table public.academia_reservas add column if not exists checkin_expira_em timestamptz;
alter table public.academia_reservas add column if not exists checkin_revogado_em timestamptz;

do $$ begin
  alter table public.academia_reservas add constraint academia_modalidade_wave2 check(modalidade in ('presencial','online','hibrido'));
exception when duplicate_object then null; end $$;

create table if not exists public.academia_representante_aliases (
  id uuid primary key default gen_random_uuid(),
  representante_codigo text not null,
  representante_nome text not null,
  alias_original text not null,
  alias_normalizado text not null,
  estado text not null default 'confirmado',
  criado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  constraint academia_rep_alias_state check(estado in ('confirmado','rejeitado'))
);
create unique index if not exists idx_academia_rep_alias on public.academia_representante_aliases(alias_normalizado) where estado='confirmado';

create table if not exists public.academia_inscricoes (
  id uuid primary key default gen_random_uuid(),
  treinamento_id uuid not null references public.academia_reservas(id) on delete cascade,
  representante_codigo text,
  representante_nome text not null,
  email text,
  telefone text,
  regiao text,
  fornecedor_texto text,
  origem text not null default 'forms',
  source_key text not null,
  match_status text not null default 'pendente',
  match_metodo text,
  payload jsonb not null default '{}'::jsonb,
  criado_por uuid references public.colaboradores(id) on delete set null,
  revisado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  revisado_em timestamptz,
  constraint academia_inscricao_match check(match_status in ('pendente','resolvido','ambiguo','ignorado')),
  constraint academia_inscricao_origem check(origem in ('forms','manual','historico')),
  constraint academia_inscricao_nome check(length(trim(representante_nome))>0)
);
create unique index if not exists idx_academia_inscricao_source on public.academia_inscricoes(treinamento_id,source_key);
create unique index if not exists idx_academia_inscricao_rep_resolved on public.academia_inscricoes(treinamento_id,representante_codigo) where representante_codigo is not null and match_status='resolvido';
create index if not exists idx_academia_inscricao_training on public.academia_inscricoes(treinamento_id,match_status);

create table if not exists public.academia_presencas (
  id uuid primary key default gen_random_uuid(),
  treinamento_id uuid not null references public.academia_reservas(id) on delete cascade,
  representante_codigo text not null,
  representante_nome text not null,
  metodo text not null default 'manual',
  presente_em timestamptz not null default now(),
  registrado_por uuid references public.colaboradores(id) on delete set null,
  corrigido_por uuid references public.colaboradores(id) on delete set null,
  corrigido_em timestamptz,
  observacoes text,
  constraint academia_presenca_metodo check(metodo in ('qr','manual','importado'))
);
create unique index if not exists idx_academia_presenca_unica on public.academia_presencas(treinamento_id,representante_codigo);
create index if not exists idx_academia_presenca_training on public.academia_presencas(treinamento_id,presente_em desc);

-- ------------------------------------------------------------
-- AUTOMAÇÃO: EVOLUI O MOTOR EXISTENTE
-- ------------------------------------------------------------
alter table public.automacoes_demanda add column if not exists escopo text not null default 'demandas';
alter table public.automacoes_demanda add column if not exists antecedencia integer;
alter table public.automacoes_demanda add column if not exists acao_criar_alerta boolean not null default true;
alter table public.automacoes_demanda add column if not exists acao_criar_demanda boolean not null default false;
alter table public.automacoes_demanda add column if not exists fornecedor_id bigint references public.fornecedores(id) on delete set null;
alter table public.automacoes_demanda add column if not exists parametros jsonb not null default '{}'::jsonb;

alter table public.automacoes_demanda drop constraint if exists automacoes_demanda_gatilho_check;
alter table public.automacoes_demanda add constraint automacoes_demanda_gatilho_check check(gatilho in (
  'tarefa_criada','status_alterado','prioridade_alterada','revisao','conclusao','prazo_24h','atrasada','sem_movimentacao_3d',
  'obrigacao_prazo','obrigacao_atrasada','material_recebido','pagamento_prazo','pagamento_atrasado','campanha_inicio','campanha_fim',
  'documento_revisao','documento_concluido','snapshot_desatualizado','bridge_indisponivel','importacao_falhou',
  'academia_inscricao_prazo','academia_nao_inscrito','academia_treinamento_proximo'
));

do $$ begin
  alter table public.automacoes_demanda add constraint automacoes_demanda_escopo_wave2 check(escopo in ('demandas','operacional'));
exception when duplicate_object then null; end $$;

create table if not exists public.automacao_execucoes (
  id uuid primary key default gen_random_uuid(),
  automacao_id uuid not null references public.automacoes_demanda(id) on delete cascade,
  gatilho text not null,
  entidade_tipo text not null,
  entidade_id text not null,
  idempotency_key text not null unique,
  status text not null default 'processando',
  tentativa integer not null default 1,
  acao_resumo jsonb not null default '{}'::jsonb,
  error_category text,
  error_message text,
  criado_em timestamptz not null default now(),
  finalizado_em timestamptz,
  constraint automacao_exec_status check(status in ('processando','sucesso','erro','ignorado'))
);
create index if not exists idx_automacao_exec_recent on public.automacao_execucoes(criado_em desc,status);
create index if not exists idx_automacao_exec_rule on public.automacao_execucoes(automacao_id,criado_em desc);

-- ------------------------------------------------------------
-- STORAGE PRIVADO
-- ------------------------------------------------------------
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('pmg-supplier-assets','pmg-supplier-assets',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;

-- ------------------------------------------------------------
-- RLS / SELECT
-- ------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'operational_audit_events','fornecedor_contatos','fornecedor_obrigacoes','fornecedor_assets','fornecedor_followups',
    'fornecedor_portal_tokens','fornecedor_portal_submissoes','wave2_qualidade_decisoes','academia_representante_aliases',
    'academia_inscricoes','academia_presencas','automacao_execucoes'
  ] LOOP
    EXECUTE format('alter table public.%I enable row level security',t);
    EXECUTE format('revoke all on table public.%I from anon, authenticated',t);
    EXECUTE format('grant select on table public.%I to authenticated',t);
    EXECUTE format('drop policy if exists %I on public.%I','wave2_equipe_le_'||t,t);
    EXECUTE format('create policy %I on public.%I for select to authenticated using (public.meu_colaborador_id() is not null)','wave2_equipe_le_'||t,t);
  END LOOP;
END $$;

-- Portal token não deve expor hashes nem submissões por Data API mesmo autenticada.
revoke select on public.fornecedor_portal_tokens from authenticated;
revoke select on public.fornecedor_portal_submissoes from authenticated;

-- Storage: apenas equipe autenticada lê; uploads internos usam signed upload gerado no backend.
drop policy if exists "wave2 equipe le supplier assets" on storage.objects;
create policy "wave2 equipe le supplier assets" on storage.objects for select to authenticated
using(bucket_id='pmg-supplier-assets' and public.meu_colaborador_id() is not null);

-- ------------------------------------------------------------
-- RPCs OPERACIONAIS
-- ------------------------------------------------------------
create or replace function public.salvar_contato_fornecedor_v2(
  p_id uuid,p_fornecedor_id bigint,p_nome text,p_departamento text,p_cargo text,p_email text,p_telefone text,p_whatsapp text,p_preferido boolean,p_ativo boolean,p_observacoes text
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_ator uuid:=public.meu_colaborador_id();
begin
  if auth.uid() is null or v_ator is null then raise exception 'Sessão PMG obrigatória'; end if;
  if not public.wave2_tem_capacidade('fornecedores') then raise exception 'Sem permissão para gerenciar contatos'; end if;
  if nullif(trim(p_nome),'') is null then raise exception 'Informe o nome do contato'; end if;
  if p_preferido then update public.fornecedor_contatos set preferido=false where fornecedor_id=p_fornecedor_id and departamento=p_departamento and ativo=true and (p_id is null or id<>p_id); end if;
  insert into public.fornecedor_contatos(id,fornecedor_id,nome,departamento,cargo,email,telefone,whatsapp,preferido,ativo,observacoes,criado_por,atualizado_por)
  values(coalesce(p_id,gen_random_uuid()),p_fornecedor_id,trim(p_nome),p_departamento,nullif(trim(coalesce(p_cargo,'')),''),nullif(trim(coalesce(p_email,'')),''),nullif(trim(coalesce(p_telefone,'')),''),nullif(trim(coalesce(p_whatsapp,'')),''),coalesce(p_preferido,false),coalesce(p_ativo,true),nullif(trim(coalesce(p_observacoes,'')),''),v_ator,v_ator)
  on conflict(id) do update set nome=excluded.nome,departamento=excluded.departamento,cargo=excluded.cargo,email=excluded.email,telefone=excluded.telefone,whatsapp=excluded.whatsapp,preferido=excluded.preferido,ativo=excluded.ativo,observacoes=excluded.observacoes,atualizado_por=v_ator,atualizado_em=now()
  returning id into v_id;
  perform public.wave2_auditar('fornecedores',case when p_id is null then 'contato_criado' else 'contato_atualizado' end,'fornecedor_contato',v_id::text,p_fornecedor_id,'{}'::jsonb);
  return v_id;
end;
$$;

create or replace function public.salvar_obrigacao_fornecedor_v2(
  p_id uuid,p_fornecedor_id bigint,p_tipo text,p_titulo text,p_descricao text,p_contexto text,p_prazo date,p_status text,p_direcao text,p_responsavel_id uuid,p_contato_id uuid,p_campanha_ref text,p_projeto_ref text,p_catalogo_contexto text,p_documento_id uuid,p_observacoes text
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_ator uuid:=public.meu_colaborador_id();v_direcao text:=p_direcao;
begin
  if auth.uid() is null or v_ator is null then raise exception 'Sessão PMG obrigatória'; end if;
  if not public.wave2_tem_capacidade('fornecedores') then raise exception 'Sem permissão para gerenciar obrigações'; end if;
  if p_status in ('aprovado','dispensado') then v_direcao:='concluido'; end if;
  if p_status in ('recebido','em_revisao','ajuste_solicitado') and v_direcao='concluido' then v_direcao:='pmg'; end if;
  insert into public.fornecedor_obrigacoes(id,fornecedor_id,tipo,titulo,descricao,contexto,prazo,status,direcao_responsabilidade,responsavel_id,contato_id,campanha_ref,projeto_ref,catalogo_contexto,documento_id,observacoes,criado_por,atualizado_por,recebido_em,aprovado_em)
  values(coalesce(p_id,gen_random_uuid()),p_fornecedor_id,p_tipo,trim(p_titulo),nullif(trim(coalesce(p_descricao,'')),''),coalesce(nullif(trim(p_contexto),''),'geral'),p_prazo,p_status,v_direcao,p_responsavel_id,p_contato_id,nullif(trim(coalesce(p_campanha_ref,'')),''),nullif(trim(coalesce(p_projeto_ref,'')),''),nullif(trim(coalesce(p_catalogo_contexto,'')),''),p_documento_id,nullif(trim(coalesce(p_observacoes,'')),''),v_ator,v_ator,case when p_status in ('recebido','em_revisao','aprovado') then now() else null end,case when p_status='aprovado' then now() else null end)
  on conflict(id) do update set tipo=excluded.tipo,titulo=excluded.titulo,descricao=excluded.descricao,contexto=excluded.contexto,prazo=excluded.prazo,status=excluded.status,direcao_responsabilidade=excluded.direcao_responsabilidade,responsavel_id=excluded.responsavel_id,contato_id=excluded.contato_id,campanha_ref=excluded.campanha_ref,projeto_ref=excluded.projeto_ref,catalogo_contexto=excluded.catalogo_contexto,documento_id=excluded.documento_id,observacoes=excluded.observacoes,atualizado_por=v_ator,atualizado_em=now(),recebido_em=coalesce(public.fornecedor_obrigacoes.recebido_em,excluded.recebido_em),aprovado_em=case when excluded.status='aprovado' then coalesce(public.fornecedor_obrigacoes.aprovado_em,now()) else null end
  returning id into v_id;
  perform public.wave2_auditar('fornecedores',case when p_id is null then 'obrigacao_criada' else 'obrigacao_atualizada' end,'fornecedor_obrigacao',v_id::text,p_fornecedor_id,jsonb_build_object('status',p_status,'direcao',v_direcao));
  return v_id;
end;
$$;

create or replace function public.criar_demanda_para_obrigacao_v2(p_obrigacao_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare o public.fornecedor_obrigacoes;v_id uuid;v_ator uuid:=public.meu_colaborador_id();
begin
  if auth.uid() is null or v_ator is null then raise exception 'Sessão PMG obrigatória'; end if;
  select * into o from public.fornecedor_obrigacoes where id=p_obrigacao_id for update;
  if not found then raise exception 'Obrigação não encontrada'; end if;
  if o.tarefa_id is not null then return o.tarefa_id; end if;
  insert into public.tarefas(titulo,descricao,status,prioridade,responsavel_id,criado_por,prazo,fornecedor_id,obrigacao_id,tags)
  values(o.titulo,coalesce(o.descricao,'Pendência de fornecedor'), 'nova'::public.status_tarefa,
    case when o.prazo is not null and o.prazo<=(now() at time zone 'America/Sao_Paulo')::date+2 then 'alta'::public.prioridade_tarefa else 'media'::public.prioridade_tarefa end,
    o.responsavel_id,v_ator,o.prazo,o.fornecedor_id,o.id,array['fornecedor','obrigacao']) returning id into v_id;
  update public.fornecedor_obrigacoes set tarefa_id=v_id,atualizado_em=now(),atualizado_por=v_ator where id=o.id;
  perform public.wave2_auditar('fornecedores','demanda_criada_para_obrigacao','fornecedor_obrigacao',o.id::text,o.fornecedor_id,jsonb_build_object('tarefa_id',v_id));
  return v_id;
end;
$$;

create or replace function public.registrar_followup_fornecedor_v2(p_fornecedor_id bigint,p_obrigacao_id uuid,p_contato_id uuid,p_canal text,p_observacoes text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_ator uuid:=public.meu_colaborador_id();
begin
  if auth.uid() is null or v_ator is null then raise exception 'Sessão PMG obrigatória'; end if;
  insert into public.fornecedor_followups(fornecedor_id,obrigacao_id,contato_id,canal,observacoes,realizado_por)
  values(p_fornecedor_id,p_obrigacao_id,p_contato_id,p_canal,nullif(trim(coalesce(p_observacoes,'')),''),v_ator) returning id into v_id;
  perform public.wave2_auditar('fornecedores','followup_registrado','fornecedor_followup',v_id::text,p_fornecedor_id,jsonb_build_object('obrigacao_id',p_obrigacao_id,'canal',p_canal));
  return v_id;
end;
$$;

create or replace function public.criar_portal_fornecedor_token_v2(p_obrigacao_id uuid,p_expira_em timestamptz default null)
returns text language plpgsql security definer set search_path=''
as $$
declare o public.fornecedor_obrigacoes;v_raw text;v_hash text;v_ator uuid:=public.meu_colaborador_id();
begin
  if auth.uid() is null or v_ator is null then raise exception 'Sessão PMG obrigatória'; end if;
  if not public.wave2_tem_capacidade('fornecedores') then raise exception 'Sem permissão para gerar link externo'; end if;
  select * into o from public.fornecedor_obrigacoes where id=p_obrigacao_id;
  if not found then raise exception 'Obrigação não encontrada'; end if;
  v_raw:=encode(extensions.gen_random_bytes(32),'hex');
  v_hash:=encode(extensions.digest(v_raw,'sha256'),'hex');
  insert into public.fornecedor_portal_tokens(fornecedor_id,obrigacao_id,token_hash,token_prefix,expira_em,criado_por)
  values(o.fornecedor_id,o.id,v_hash,left(v_raw,8),coalesce(p_expira_em,now()+interval '14 days'),v_ator);
  perform public.wave2_auditar('fornecedores','portal_token_criado','fornecedor_obrigacao',o.id::text,o.fornecedor_id,jsonb_build_object('prefix',left(v_raw,8)));
  return v_raw;
end;
$$;

create or replace function public.revogar_portal_fornecedor_token_v2(p_token_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare t public.fornecedor_portal_tokens;
begin
  if auth.uid() is null or not public.wave2_tem_capacidade('fornecedores') then raise exception 'Sem permissão'; end if;
  update public.fornecedor_portal_tokens set revogado_em=now() where id=p_token_id returning * into t;
  if not found then raise exception 'Token não encontrado'; end if;
  perform public.wave2_auditar('fornecedores','portal_token_revogado','fornecedor_obrigacao',t.obrigacao_id::text,t.fornecedor_id,jsonb_build_object('token_id',t.id));
end;
$$;

-- Uso exclusivo do backend com service role. Retorna apenas contexto mínimo do token.
create or replace function public.resolver_portal_fornecedor_token_v2(p_token text)
returns table(token_id uuid,fornecedor_id bigint,obrigacao_id uuid,fornecedor_nome text,titulo text,descricao text,prazo date,status text,allowed_mimes text[],max_bytes integer)
language sql security definer set search_path=''
as $$
  select t.id,t.fornecedor_id,t.obrigacao_id,f.nome,o.titulo,o.descricao,o.prazo,o.status,t.allowed_mimes,t.max_bytes
  from public.fornecedor_portal_tokens t
  join public.fornecedores f on f.id=t.fornecedor_id
  join public.fornecedor_obrigacoes o on o.id=t.obrigacao_id and o.fornecedor_id=t.fornecedor_id
  where t.token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex')
    and t.revogado_em is null and (t.expira_em is null or t.expira_em>now())
    and o.status not in ('aprovado','dispensado')
  limit 1;
$$;
revoke all on function public.resolver_portal_fornecedor_token_v2(text) from public,anon,authenticated;
grant execute on function public.resolver_portal_fornecedor_token_v2(text) to service_role;

create or replace function public.finalizar_asset_fornecedor_v2(
  p_fornecedor_id bigint,p_obrigacao_id uuid,p_nome text,p_bucket text,p_path text,p_mime text,p_ext text,p_size bigint,p_width integer,p_height integer,p_sha256 text,p_origem text,p_token_id uuid default null,p_mensagem text default null
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_existing uuid;v_submission uuid;v_obligation public.fornecedor_obrigacoes;v_tipo text;v_contexto text;v_catalogo text;
begin
  if current_user not in ('service_role','postgres') and auth.uid() is null then raise exception 'Não autorizado'; end if;
  if p_obrigacao_id is not null then
    select * into v_obligation from public.fornecedor_obrigacoes o where o.id=p_obrigacao_id and o.fornecedor_id=p_fornecedor_id;
    if not found then raise exception 'Obrigação fora do escopo do fornecedor'; end if;
  end if;
  v_tipo:=case
    when v_obligation.tipo='logo' then 'Logo'
    when v_obligation.tipo='anuncio_catalogo' then 'Anuncio'
    when v_obligation.tipo in ('imagem_produto','foto') then 'Imagem de produto'
    when v_obligation.tipo='material_evento' then 'Evento'
    when v_obligation.tipo in ('nota_fiscal','recibo','contrato','material_pagamento') or p_mime='application/pdf' then 'Documento'
    when v_obligation.contexto='campanha' then 'Campanha'
    else case when p_mime like 'image/%' then 'Imagem de produto' else 'Outro' end
  end;
  v_contexto:=v_obligation.contexto;
  v_catalogo:=v_obligation.catalogo_contexto;
  if p_token_id is not null and not exists (
    select 1 from public.fornecedor_portal_tokens t
    where t.id=p_token_id and t.fornecedor_id=p_fornecedor_id and t.obrigacao_id=p_obrigacao_id
      and t.revogado_em is null and (t.expira_em is null or t.expira_em>now())
  ) then
    raise exception 'Token externo fora do escopo, expirado ou revogado';
  end if;
  if p_token_id is not null then
    select s.asset_id into v_existing from public.fornecedor_portal_submissoes s
    where s.token_id=p_token_id and s.sha256=lower(p_sha256) limit 1;
    if v_existing is not null then return v_existing; end if;
  end if;
  select id into v_existing from public.fornecedor_assets where fornecedor_id=p_fornecedor_id and sha256=lower(p_sha256) limit 1;
  if v_existing is not null then
    if p_obrigacao_id is not null then update public.fornecedor_obrigacoes set asset_principal_id=v_existing,status='recebido',direcao_responsabilidade='pmg',recebido_em=coalesce(recebido_em,now()),atualizado_em=now() where id=p_obrigacao_id and fornecedor_id=p_fornecedor_id; end if;
    if p_token_id is not null then
      insert into public.fornecedor_portal_submissoes(token_id,fornecedor_id,obrigacao_id,asset_id,mensagem,sha256,status)
      values(p_token_id,p_fornecedor_id,p_obrigacao_id,v_existing,p_mensagem,lower(p_sha256),'duplicado')
      on conflict(token_id,sha256) where sha256 is not null do nothing;
    end if;
    return v_existing;
  end if;
  insert into public.fornecedor_assets(fornecedor_id,obrigacao_id,tipo,contexto,catalogo_contexto,nome_original,storage_bucket,storage_path,mime,extensao,tamanho_bytes,largura,altura,sha256,origem)
  values(p_fornecedor_id,p_obrigacao_id,v_tipo,v_contexto,v_catalogo,p_nome,p_bucket,p_path,p_mime,p_ext,p_size,p_width,p_height,lower(p_sha256),p_origem)
  returning id into v_id;
  if p_obrigacao_id is not null then update public.fornecedor_obrigacoes set asset_principal_id=v_id,status='recebido',direcao_responsabilidade='pmg',recebido_em=coalesce(recebido_em,now()),atualizado_em=now() where id=p_obrigacao_id and fornecedor_id=p_fornecedor_id; end if;
  if p_token_id is not null then
    insert into public.fornecedor_portal_submissoes(token_id,fornecedor_id,obrigacao_id,asset_id,mensagem,sha256,status)
    values(p_token_id,p_fornecedor_id,p_obrigacao_id,v_id,p_mensagem,lower(p_sha256),'recebido')
    on conflict(token_id,sha256) where sha256 is not null do nothing;
  end if;
  perform public.wave2_auditar('materiais','material_recebido','fornecedor_asset',v_id::text,p_fornecedor_id,jsonb_build_object('obrigacao_id',p_obrigacao_id,'origem',p_origem));
  return v_id;
end;
$$;
revoke all on function public.finalizar_asset_fornecedor_v2(bigint,uuid,text,text,text,text,text,bigint,integer,integer,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.finalizar_asset_fornecedor_v2(bigint,uuid,text,text,text,text,text,bigint,integer,integer,text,text,uuid,text) to service_role;

create or replace function public.revisar_asset_fornecedor_v2(p_asset_id uuid,p_status text,p_observacao text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare a public.fornecedor_assets;v_ator uuid:=public.meu_colaborador_id();
begin
  if auth.uid() is null or not public.wave2_tem_capacidade('materiais') then raise exception 'Sem permissão para revisar materiais'; end if;
  if p_status not in ('aprovado','ajuste_solicitado','rejeitado') then raise exception 'Status inválido'; end if;
  update public.fornecedor_assets set status_revisao=p_status,atualizado_em=now() where id=p_asset_id returning * into a;
  if not found then raise exception 'Material não encontrado'; end if;
  if a.obrigacao_id is not null then
    update public.fornecedor_obrigacoes set status=case when p_status='aprovado' then 'aprovado' when p_status='ajuste_solicitado' then 'ajuste_solicitado' else 'em_revisao' end,
      direcao_responsabilidade=case when p_status='aprovado' then 'concluido' when p_status='ajuste_solicitado' then 'fornecedor' else 'pmg' end,
      aprovado_em=case when p_status='aprovado' then now() else null end, atualizado_em=now(), atualizado_por=v_ator
    where id=a.obrigacao_id;
  end if;
  perform public.wave2_auditar('materiais','material_'||p_status,'fornecedor_asset',a.id::text,a.fornecedor_id,jsonb_build_object('observacao',p_observacao));
  return a.id;
end;
$$;

-- ------------------------------------------------------------
-- ACADEMIA RPCs
-- ------------------------------------------------------------
create or replace function public.atualizar_treinamento_academia_v2(p_treinamento_id uuid,p_fornecedor_id bigint,p_inscricao_limite timestamptz,p_modalidade text,p_local text,p_ativo boolean)
returns uuid language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.wave2_tem_capacidade('academia') then raise exception 'Sem permissão para gerenciar Academia'; end if;
  update public.academia_reservas set fornecedor_id=p_fornecedor_id,inscricao_limite=p_inscricao_limite,modalidade=p_modalidade,local_treinamento=nullif(trim(coalesce(p_local,'')),''),ativo=coalesce(p_ativo,true),atualizado_em=now()
  where id=p_treinamento_id and tipo_registro='treinamento';
  if not found then raise exception 'Treinamento não encontrado'; end if;
  perform public.wave2_auditar('academia','treinamento_configurado','academia_treinamento',p_treinamento_id::text,p_fornecedor_id,'{}'::jsonb);
  return p_treinamento_id;
end;
$$;

create or replace function public.importar_inscricao_academia_v2(
  p_treinamento_id uuid,p_source_key text,p_nome text,p_codigo text,p_email text,p_telefone text,p_regiao text,p_fornecedor_texto text,p_match_status text,p_match_metodo text,p_payload jsonb,p_origem text default 'forms'
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_ator uuid:=public.meu_colaborador_id();
begin
  if auth.uid() is null or not public.wave2_tem_capacidade('academia') then raise exception 'Sem permissão para importar inscrições'; end if;
  insert into public.academia_inscricoes(treinamento_id,representante_codigo,representante_nome,email,telefone,regiao,fornecedor_texto,origem,source_key,match_status,match_metodo,payload,criado_por,revisado_por,revisado_em)
  values(p_treinamento_id,nullif(trim(coalesce(p_codigo,'')),''),trim(p_nome),nullif(trim(coalesce(p_email,'')),''),nullif(trim(coalesce(p_telefone,'')),''),nullif(trim(coalesce(p_regiao,'')),''),nullif(trim(coalesce(p_fornecedor_texto,'')),''),p_origem,trim(p_source_key),p_match_status,nullif(trim(coalesce(p_match_metodo,'')),''),coalesce(p_payload,'{}'::jsonb),v_ator,case when p_match_status='resolvido' then v_ator end,case when p_match_status='resolvido' then now() end)
  on conflict(treinamento_id,source_key) do update set representante_codigo=excluded.representante_codigo,representante_nome=excluded.representante_nome,email=excluded.email,telefone=excluded.telefone,regiao=excluded.regiao,fornecedor_texto=excluded.fornecedor_texto,match_status=excluded.match_status,match_metodo=excluded.match_metodo,payload=excluded.payload,revisado_por=case when excluded.match_status='resolvido' then v_ator else public.academia_inscricoes.revisado_por end,revisado_em=case when excluded.match_status='resolvido' then now() else public.academia_inscricoes.revisado_em end
  returning id into v_id;
  perform public.wave2_auditar('academia','inscricao_importada','academia_inscricao',v_id::text,null,jsonb_build_object('treinamento_id',p_treinamento_id,'match_status',p_match_status));
  return v_id;
end;
$$;

create or replace function public.revisar_inscricao_academia_v2(p_inscricao_id uuid,p_representante_codigo text,p_representante_nome text,p_criar_alias boolean default false)
returns uuid language plpgsql security definer set search_path=''
as $$
declare i public.academia_inscricoes;v_ator uuid:=public.meu_colaborador_id();v_alias text;
begin
  if auth.uid() is null or not public.wave2_tem_capacidade('academia') then raise exception 'Sem permissão'; end if;
  select * into i from public.academia_inscricoes where id=p_inscricao_id for update;
  if not found then raise exception 'Inscrição não encontrada'; end if;
  update public.academia_inscricoes set representante_codigo=trim(p_representante_codigo),representante_nome=trim(p_representante_nome),match_status='resolvido',match_metodo='revisao',revisado_por=v_ator,revisado_em=now() where id=p_inscricao_id;
  if p_criar_alias then
    v_alias:=trim(regexp_replace(lower(extensions.unaccent(i.representante_nome)),'[^a-z0-9]+',' ','g'));
    insert into public.academia_representante_aliases(representante_codigo,representante_nome,alias_original,alias_normalizado,estado,criado_por)
    values(trim(p_representante_codigo),trim(p_representante_nome),i.representante_nome,v_alias,'confirmado',v_ator)
    on conflict do nothing;
  end if;
  perform public.wave2_auditar('academia','inscricao_revisada','academia_inscricao',p_inscricao_id::text,null,jsonb_build_object('representante_codigo',p_representante_codigo));
  return p_inscricao_id;
end;
$$;

create or replace function public.registrar_presenca_academia_v2(p_treinamento_id uuid,p_codigo text,p_nome text,p_metodo text,p_observacoes text default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_ator uuid:=public.meu_colaborador_id();
begin
  if auth.uid() is null or not public.wave2_tem_capacidade('presenca') then raise exception 'Sem permissão para registrar presença'; end if;
  insert into public.academia_presencas(treinamento_id,representante_codigo,representante_nome,metodo,registrado_por,observacoes)
  values(p_treinamento_id,trim(p_codigo),trim(p_nome),p_metodo,v_ator,nullif(trim(coalesce(p_observacoes,'')),''))
  on conflict(treinamento_id,representante_codigo) do update set representante_nome=excluded.representante_nome,metodo=excluded.metodo,corrigido_por=v_ator,corrigido_em=now(),observacoes=coalesce(excluded.observacoes,public.academia_presencas.observacoes)
  returning id into v_id;
  perform public.wave2_auditar('academia','presenca_registrada','academia_presenca',v_id::text,null,jsonb_build_object('treinamento_id',p_treinamento_id,'metodo',p_metodo));
  return v_id;
end;
$$;

create or replace function public.criar_checkin_academia_v2(p_treinamento_id uuid,p_expira_em timestamptz default null)
returns text language plpgsql security definer set search_path=''
as $$
declare v_raw text;
begin
  if auth.uid() is null or not public.wave2_tem_capacidade('academia') then raise exception 'Sem permissão'; end if;
  v_raw:=encode(extensions.gen_random_bytes(24),'hex');
  update public.academia_reservas set checkin_token_hash=encode(extensions.digest(v_raw,'sha256'),'hex'),checkin_expira_em=coalesce(p_expira_em,fim_em+interval '4 hours'),checkin_revogado_em=null,atualizado_em=now() where id=p_treinamento_id and tipo_registro='treinamento';
  if not found then raise exception 'Treinamento não encontrado'; end if;
  perform public.wave2_auditar('academia','qr_checkin_criado','academia_treinamento',p_treinamento_id::text,null,'{}'::jsonb);
  return v_raw;
end;
$$;

create or replace function public.resolver_checkin_academia_v2(p_token text)
returns table(treinamento_id uuid,titulo text,inicio_em timestamptz,fim_em timestamptz,local_treinamento text)
language sql security definer set search_path=''
as $$
  select a.id,a.titulo,a.inicio_em,a.fim_em,a.local_treinamento from public.academia_reservas a
  where a.checkin_token_hash=encode(extensions.digest(coalesce(p_token,''),'sha256'),'hex') and a.checkin_revogado_em is null
    and (a.checkin_expira_em is null or a.checkin_expira_em>now()) and a.ativo=true and a.tipo_registro='treinamento' limit 1;
$$;
revoke all on function public.resolver_checkin_academia_v2(text) from public,anon,authenticated;
grant execute on function public.resolver_checkin_academia_v2(text) to service_role;

-- ------------------------------------------------------------
-- AUTOMAÇÕES WAVE 2: MESMA TABELA, HISTÓRICO + IDEMPOTÊNCIA
-- ------------------------------------------------------------
create or replace function public.salvar_automacao_operacional_v2(
  p_id uuid,p_nome text,p_gatilho text,p_antecedencia integer,p_acao_alerta boolean,p_acao_demanda boolean,p_nivel text,p_mensagem text,p_fornecedor_id bigint,p_parametros jsonb,p_ativo boolean
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_ator uuid:=public.meu_colaborador_id();
begin
  if auth.uid() is null or not public.wave2_tem_capacidade('automacoes') then raise exception 'Sem permissão para configurar automações'; end if;
  if p_gatilho not in ('obrigacao_prazo','obrigacao_atrasada','material_recebido','pagamento_prazo','pagamento_atrasado','campanha_inicio','campanha_fim','documento_revisao','documento_concluido','snapshot_desatualizado','bridge_indisponivel','importacao_falhou','academia_inscricao_prazo','academia_nao_inscrito','academia_treinamento_proximo') then raise exception 'Gatilho operacional inválido'; end if;
  if not coalesce(p_acao_alerta,false) and not coalesce(p_acao_demanda,false) then raise exception 'Selecione ao menos uma ação segura'; end if;
  insert into public.automacoes_demanda(id,nome,ativo,gatilho,condicao_campo,acao_destino,nivel,mensagem,criado_por,escopo,antecedencia,acao_criar_alerta,acao_criar_demanda,fornecedor_id,parametros)
  values(coalesce(p_id,gen_random_uuid()),trim(p_nome),coalesce(p_ativo,true),p_gatilho,'qualquer','responsavel',p_nivel,nullif(trim(coalesce(p_mensagem,'')),''),v_ator,'operacional',p_antecedencia,coalesce(p_acao_alerta,true),coalesce(p_acao_demanda,false),p_fornecedor_id,coalesce(p_parametros,'{}'::jsonb))
  on conflict(id) do update set nome=excluded.nome,ativo=excluded.ativo,gatilho=excluded.gatilho,nivel=excluded.nivel,mensagem=excluded.mensagem,escopo='operacional',antecedencia=excluded.antecedencia,acao_criar_alerta=excluded.acao_criar_alerta,acao_criar_demanda=excluded.acao_criar_demanda,fornecedor_id=excluded.fornecedor_id,parametros=excluded.parametros,atualizado_em=now()
  returning id into v_id;
  perform public.wave2_auditar('automacoes',case when p_id is null then 'regra_criada' else 'regra_atualizada' end,'automacao',v_id::text,p_fornecedor_id,jsonb_build_object('gatilho',p_gatilho));
  return v_id;
end;
$$;

create or replace function public.executar_automacao_evento_wave2(
  p_gatilho text,p_entidade_tipo text,p_entidade_id text,p_idempotencia text,p_contexto jsonb default '{}'::jsonb
) returns integer language plpgsql security definer set search_path=''
as $$
declare r public.automacoes_demanda;v_exec uuid;v_resp uuid;v_msg text;v_task uuid;v_total integer:=0;v_existing public.automacao_execucoes;v_supplier bigint;
begin
  if auth.uid() is null and coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then raise exception 'Sessão PMG obrigatória'; end if;
  v_supplier:=nullif(p_contexto->>'fornecedor_id','')::bigint;
  for r in select * from public.automacoes_demanda where ativo=true and escopo='operacional' and gatilho=p_gatilho and (fornecedor_id is null or fornecedor_id=v_supplier) loop
    begin
      select * into v_existing from public.automacao_execucoes where idempotency_key='wave2:'||r.id||':'||p_idempotencia for update;
      if found and v_existing.status='sucesso' then continue; end if;
      if found then
        update public.automacao_execucoes set status='processando',tentativa=tentativa+1,error_category=null,error_message=null where id=v_existing.id returning id into v_exec;
      else
        insert into public.automacao_execucoes(automacao_id,gatilho,entidade_tipo,entidade_id,idempotency_key,status)
        values(r.id,p_gatilho,p_entidade_tipo,p_entidade_id,'wave2:'||r.id||':'||p_idempotencia,'processando') returning id into v_exec;
      end if;
      v_resp:=nullif(p_contexto->>'responsavel_id','')::uuid;
      if v_resp is null then select c.id into v_resp from public.colaboradores c where c.ativo=true and c.role::text='gestor' order by c.criado_em limit 1; end if;
      v_msg:=coalesce(r.mensagem,p_contexto->>'mensagem','Automação operacional: '||r.nome);
      if r.acao_criar_alerta and v_resp is not null then
        insert into public.notificacoes(colaborador_id,tipo,mensagem,chave_deduplicacao,nivel,origem_automacao_id)
        values(v_resp,'status_mudou'::public.tipo_notificacao,v_msg,'wave2-alert:'||v_exec,coalesce(r.nivel,'normal'),r.id)
        on conflict(chave_deduplicacao) do nothing;
      end if;
      if r.acao_criar_demanda then
        insert into public.tarefas(titulo,descricao,status,prioridade,responsavel_id,criado_por,prazo,fornecedor_id,tags)
        values(coalesce(p_contexto->>'titulo',r.nome),v_msg,'nova'::public.status_tarefa,case when r.nivel='critica' then 'urgente'::public.prioridade_tarefa when r.nivel='importante' then 'alta'::public.prioridade_tarefa else 'media'::public.prioridade_tarefa end,v_resp,coalesce(public.meu_colaborador_id(),v_resp),nullif(p_contexto->>'prazo','')::date,v_supplier,array['automacao','wave2']) returning id into v_task;
      end if;
      update public.automacao_execucoes set status='sucesso',acao_resumo=jsonb_build_object('alerta',r.acao_criar_alerta,'demanda',v_task),finalizado_em=now() where id=v_exec;
      perform public.wave2_auditar('automacoes','execucao_sucesso',p_entidade_tipo,p_entidade_id,v_supplier,jsonb_build_object('automacao_id',r.id,'execucao_id',v_exec));
      v_total:=v_total+1;
    exception when others then
      if v_exec is not null then update public.automacao_execucoes set status='erro',error_category=sqlstate,error_message=left(sqlerrm,500),finalizado_em=now() where id=v_exec; end if;
    end;
  end loop;
  return v_total;
end;
$$;

-- Processador periódico chamado pelo mesmo cron de Demandas. Não duplica ações graças às chaves idempotentes.
create or replace function public.processar_automacoes_operacionais_wave2()
returns integer language plpgsql security definer set search_path=''
as $$
declare o public.fornecedor_obrigacoes;p public.acompanhamento_pagamentos;d record;t public.academia_reservas;imp record;v_total integer:=0;v_today date:=current_date;v_key text;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then raise exception 'Execução exclusiva do serviço'; end if;
  for o in select * from public.fornecedor_obrigacoes where status not in ('aprovado','dispensado') and prazo is not null and prazo between v_today-interval '45 days' and v_today+interval '60 days' loop
    if o.prazo < v_today then v_key:='obligation:'||o.id||':overdue:'||v_today; v_total:=v_total+public.executar_automacao_evento_wave2('obrigacao_atrasada','fornecedor_obrigacao',o.id::text,v_key,jsonb_build_object('fornecedor_id',o.fornecedor_id,'responsavel_id',o.responsavel_id,'titulo',o.titulo,'prazo',o.prazo,'mensagem',o.titulo)); end if;
    for d in select antecedencia from public.automacoes_demanda where ativo=true and escopo='operacional' and gatilho='obrigacao_prazo' and antecedencia is not null loop
      if o.prazo-v_today=d.antecedencia then v_key:='obligation:'||o.id||':due:'||d.antecedencia||':'||v_today; v_total:=v_total+public.executar_automacao_evento_wave2('obrigacao_prazo','fornecedor_obrigacao',o.id::text,v_key,jsonb_build_object('fornecedor_id',o.fornecedor_id,'responsavel_id',o.responsavel_id,'titulo',o.titulo,'prazo',o.prazo)); end if;
    end loop;
    if o.status='recebido' then v_total:=v_total+public.executar_automacao_evento_wave2('material_recebido','fornecedor_obrigacao',o.id::text,'obligation:'||o.id||':received:'||coalesce(o.recebido_em::date,v_today),jsonb_build_object('fornecedor_id',o.fornecedor_id,'responsavel_id',o.responsavel_id,'titulo',o.titulo)); end if;
  end loop;
  for p in select * from public.acompanhamento_pagamentos where status not in ('pago','cancelado') and vencimento between v_today-interval '45 days' and v_today+interval '60 days' loop
    if p.vencimento<v_today then v_total:=v_total+public.executar_automacao_evento_wave2('pagamento_atrasado','pagamento',p.id::text,'payment:'||p.id||':overdue:'||v_today,jsonb_build_object('prazo',p.vencimento,'titulo','Acompanhar pagamento vencido')); end if;
    for d in select antecedencia from public.automacoes_demanda where ativo=true and escopo='operacional' and gatilho='pagamento_prazo' and antecedencia is not null loop if p.vencimento-v_today=d.antecedencia then v_total:=v_total+public.executar_automacao_evento_wave2('pagamento_prazo','pagamento',p.id::text,'payment:'||p.id||':due:'||d.antecedencia||':'||v_today,jsonb_build_object('prazo',p.vencimento,'titulo','Acompanhar pagamento')); end if; end loop;
  end loop;
  for d in select i.id,i.status,i.criado_em from public.acompanhamento_documentos_itens i where i.status='aguardando_conferencia' and i.criado_em<now()-interval '1 hour' order by i.criado_em limit 300 loop
    v_total:=v_total+public.executar_automacao_evento_wave2('documento_revisao','documento',d.id::text,'document:'||d.id||':review:'||v_today,jsonb_build_object('titulo','Revisar documento')); end loop;
  for d in select i.id,i.status,i.atualizado_em from public.acompanhamento_documentos_itens i where i.status='aprovado' and i.atualizado_em>=now()-interval '2 days' order by i.atualizado_em limit 300 loop
    v_total:=v_total+public.executar_automacao_evento_wave2('documento_concluido','documento',d.id::text,'document:'||d.id||':approved:'||d.atualizado_em::date,jsonb_build_object('titulo','Documento concluído'));
  end loop;
  for imp in select i.id,i.nome_arquivo,i.erros,i.criado_em from public.acompanhamento_importacoes i where jsonb_typeof(i.erros)='array' and jsonb_array_length(i.erros)>0 and i.criado_em>=now()-interval '7 days' order by i.criado_em desc limit 200 loop
    v_total:=v_total+public.executar_automacao_evento_wave2('importacao_falhou','importacao',imp.id::text,'import:'||imp.id||':failed',jsonb_build_object('titulo','Revisar importação · '||coalesce(imp.nome_arquivo,'arquivo'),'mensagem',jsonb_array_length(imp.erros)||' erro(s) na importação'));
  end loop;
  for t in select * from public.academia_reservas where tipo_registro='treinamento' and ativo=true and inicio_em::date between v_today and v_today+interval '60 days' loop
    for d in select gatilho,antecedencia from public.automacoes_demanda where ativo=true and escopo='operacional' and gatilho in ('academia_inscricao_prazo','academia_treinamento_proximo') and antecedencia is not null loop
      if d.gatilho='academia_inscricao_prazo' and t.inscricao_limite is not null and t.inscricao_limite::date-v_today=d.antecedencia then v_total:=v_total+public.executar_automacao_evento_wave2(d.gatilho,'treinamento',t.id::text,'training:'||t.id||':registration:'||d.antecedencia||':'||v_today,jsonb_build_object('fornecedor_id',t.fornecedor_id,'titulo',t.titulo,'prazo',t.inscricao_limite::date)); end if;
      if d.gatilho='academia_treinamento_proximo' and t.inicio_em::date-v_today=d.antecedencia then v_total:=v_total+public.executar_automacao_evento_wave2(d.gatilho,'treinamento',t.id::text,'training:'||t.id||':due:'||d.antecedencia||':'||v_today,jsonb_build_object('fornecedor_id',t.fornecedor_id,'titulo',t.titulo,'prazo',t.inicio_em::date)); end if;
    end loop;
  end loop;
  return v_total;
end;
$$;
revoke all on function public.processar_automacoes_operacionais_wave2() from public,anon,authenticated;
grant execute on function public.processar_automacoes_operacionais_wave2() to service_role;

grant execute on function public.executar_automacao_evento_wave2(text,text,text,text,jsonb) to service_role;

-- ------------------------------------------------------------
-- QUALIDADE / DECISÕES
-- ------------------------------------------------------------
create or replace function public.salvar_decisao_qualidade_wave2(p_issue_key text,p_modulo text,p_estado text,p_observacoes text default null)
returns text language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or public.meu_colaborador_id() is null then raise exception 'Sessão PMG obrigatória'; end if;
  if p_estado not in ('resolvido','ignorado') then raise exception 'Estado inválido'; end if;
  insert into public.wave2_qualidade_decisoes(issue_key,modulo,estado,observacoes,atualizado_por)
  values(trim(p_issue_key),trim(p_modulo),p_estado,nullif(trim(coalesce(p_observacoes,'')),''),public.meu_colaborador_id())
  on conflict(issue_key) do update set modulo=excluded.modulo,estado=excluded.estado,observacoes=excluded.observacoes,atualizado_por=excluded.atualizado_por,atualizado_em=now();
  return trim(p_issue_key);
end;
$$;

-- ------------------------------------------------------------
-- GRANTS RPCs
-- ------------------------------------------------------------
DO $$
DECLARE sig text;
BEGIN
  FOREACH sig IN ARRAY ARRAY[
    'public.salvar_contato_fornecedor_v2(uuid,bigint,text,text,text,text,text,text,boolean,boolean,text)',
    'public.salvar_obrigacao_fornecedor_v2(uuid,bigint,text,text,text,text,date,text,text,uuid,uuid,text,text,text,uuid,text)',
    'public.criar_demanda_para_obrigacao_v2(uuid)',
    'public.registrar_followup_fornecedor_v2(bigint,uuid,uuid,text,text)',
    'public.criar_portal_fornecedor_token_v2(uuid,timestamptz)',
    'public.revogar_portal_fornecedor_token_v2(uuid)',
    'public.revisar_asset_fornecedor_v2(uuid,text,text)',
    'public.vincular_recorrencia_fornecedor_v2(uuid,bigint)',
    'public.vincular_tarefa_entidades_v2(uuid,bigint,text,uuid,uuid,uuid,text)',
    'public.atualizar_treinamento_academia_v2(uuid,bigint,timestamptz,text,text,boolean)',
    'public.importar_inscricao_academia_v2(uuid,text,text,text,text,text,text,text,text,text,jsonb,text)',
    'public.revisar_inscricao_academia_v2(uuid,text,text,boolean)',
    'public.registrar_presenca_academia_v2(uuid,text,text,text,text)',
    'public.criar_checkin_academia_v2(uuid,timestamptz)',
    'public.salvar_automacao_operacional_v2(uuid,text,text,integer,boolean,boolean,text,text,bigint,jsonb,boolean)',
    'public.executar_automacao_evento_wave2(text,text,text,text,jsonb)',
    'public.salvar_decisao_qualidade_wave2(text,text,text,text)'
  ] LOOP
    EXECUTE 'revoke all on function '||sig||' from public, anon';
    EXECUTE 'grant execute on function '||sig||' to authenticated';
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- REPLICA IDENTITY para telas operacionais em tempo real futuras
-- ------------------------------------------------------------
alter table public.fornecedor_obrigacoes replica identity full;
alter table public.fornecedor_assets replica identity full;
alter table public.automacao_execucoes replica identity full;
alter table public.academia_inscricoes replica identity full;
alter table public.academia_presencas replica identity full;

commit;

-- Conferência segura
select
  (select count(*) from public.fornecedor_obrigacoes) as obrigacoes,
  (select count(*) from public.fornecedor_contatos) as contatos,
  (select count(*) from public.fornecedor_assets) as assets,
  (select count(*) from public.automacao_execucoes) as execucoes_automacao,
  (select count(*) from public.academia_inscricoes) as inscricoes,
  (select count(*) from public.academia_presencas) as presencas;
