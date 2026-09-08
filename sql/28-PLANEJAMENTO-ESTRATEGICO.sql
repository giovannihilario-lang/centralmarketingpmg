-- ============================================================
-- PMG CONNECT | PLANEJAMENTO ESTRATÉGICO | 2026-09-04
-- Meta 200M + oportunidades + projetos + ações + medições 90 dias
-- Execute no SQL Editor do Supabase PMG após as migrations atuais.
-- Idempotente e sem alteração destrutiva de dados existentes.
-- ============================================================

begin;
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- CONFIGURAÇÃO EXECUTIVA
-- ------------------------------------------------------------
create table if not exists public.estrategia_config (
  id smallint primary key default 1 check (id = 1),
  titulo text not null default 'PMG Rumo aos R$ 200 milhões',
  meta_faturamento numeric(18,2) not null default 200000000 check (meta_faturamento > 0),
  periodicidade text not null default 'mensal' check (periodicidade in ('mensal','trimestral','anual')),
  ciclo_dias integer not null default 90 check (ciclo_dias between 30 and 365),
  atualizado_por uuid references public.colaboradores(id) on delete set null,
  atualizado_em timestamptz not null default now()
);
insert into public.estrategia_config(id) values(1) on conflict(id) do nothing;

-- ------------------------------------------------------------
-- OPORTUNIDADES
-- O motor comercial gera sinais em leitura. Só os sinais salvos entram aqui.
-- ------------------------------------------------------------
create table if not exists public.estrategia_oportunidades (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('regional','categoria','produto','fornecedor','cliente','manual')),
  chave text,
  titulo text not null check (length(trim(titulo)) > 0),
  descricao text,
  origem text not null default 'manual' check (origem in ('manual','motor_deterministico')),
  regra_id text,
  score numeric(7,2),
  filtros jsonb not null default '{}'::jsonb check (jsonb_typeof(filtros) = 'object'),
  evidencias jsonb not null default '[]'::jsonb check (jsonb_typeof(evidencias) = 'array'),
  periodo_de text,
  periodo_ate text,
  status text not null default 'nova' check (status in ('nova','selecionada','convertida','descartada')),
  criado_por uuid not null references public.colaboradores(id) on delete restrict,
  atualizado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_estrategia_oportunidades_status on public.estrategia_oportunidades(status, criado_em desc);
create index if not exists idx_estrategia_oportunidades_tipo on public.estrategia_oportunidades(tipo, status);

-- ------------------------------------------------------------
-- PROJETOS ESTRATÉGICOS
-- baseline e lineage são preservados no próprio projeto.
-- ------------------------------------------------------------
create table if not exists public.estrategia_projetos (
  id uuid primary key default gen_random_uuid(),
  oportunidade_id uuid references public.estrategia_oportunidades(id) on delete set null,
  titulo text not null check (length(trim(titulo)) > 0),
  objetivo text not null check (length(trim(objetivo)) > 0),
  status text not null default 'ativo' check (status in ('planejamento','ativo','em_risco','atingido','encerrado','cancelado')),
  inicio date not null,
  fim date not null,
  meta_indicador text not null default 'faturamento' check (meta_indicador in ('faturamento','kg','pedidos','clientes','ticket')),
  meta_tipo text not null default 'percentual' check (meta_tipo in ('percentual','absoluta')),
  meta_valor numeric(18,4) not null,
  filtros jsonb not null default '{}'::jsonb check (jsonb_typeof(filtros) = 'object'),
  baseline jsonb not null default '{}'::jsonb check (jsonb_typeof(baseline) = 'object'),
  baseline_lineage jsonb not null default '{}'::jsonb check (jsonb_typeof(baseline_lineage) = 'object'),
  criado_por uuid not null references public.colaboradores(id) on delete restrict,
  atualizado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint estrategia_projeto_periodo check (fim >= inicio),
  constraint estrategia_projeto_meta check (meta_valor >= 0)
);
create index if not exists idx_estrategia_projetos_status on public.estrategia_projetos(status, inicio desc);
create index if not exists idx_estrategia_projetos_oportunidade on public.estrategia_projetos(oportunidade_id) where oportunidade_id is not null;

-- ------------------------------------------------------------
-- AÇÕES INTERDEPARTAMENTAIS
-- ------------------------------------------------------------
create table if not exists public.estrategia_acoes (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.estrategia_projetos(id) on delete cascade,
  departamento text not null check (departamento in ('Comercial','Logística','Marketing','Compras','Financeiro','Estoque','Diretoria','Outros')),
  titulo text not null check (length(trim(titulo)) > 0),
  descricao text,
  responsavel_id uuid references public.colaboradores(id) on delete set null,
  prazo date,
  status text not null default 'pendente' check (status in ('pendente','andamento','bloqueada','concluida','cancelada')),
  tarefa_id uuid references public.tarefas(id) on delete set null,
  ordem integer not null default 100,
  criado_por uuid not null references public.colaboradores(id) on delete restrict,
  atualizado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_estrategia_acoes_projeto on public.estrategia_acoes(projeto_id, status, ordem);
create index if not exists idx_estrategia_acoes_responsavel on public.estrategia_acoes(responsavel_id, status) where responsavel_id is not null;
create unique index if not exists idx_estrategia_acoes_tarefa on public.estrategia_acoes(tarefa_id) where tarefa_id is not null;

-- ------------------------------------------------------------
-- MEDIÇÕES
-- Append-only para preservar a história do ciclo.
-- ------------------------------------------------------------
create table if not exists public.estrategia_medicoes (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.estrategia_projetos(id) on delete cascade,
  medido_em date not null default current_date,
  marco text not null default 'manual' check (marco in ('baseline','mes1','mes2','mes3','manual')),
  periodo_de text,
  periodo_ate text,
  indicadores jsonb not null check (jsonb_typeof(indicadores) = 'object'),
  lineage jsonb not null default '{}'::jsonb check (jsonb_typeof(lineage) = 'object'),
  criado_por uuid not null references public.colaboradores(id) on delete restrict,
  criado_em timestamptz not null default now()
);
create index if not exists idx_estrategia_medicoes_projeto on public.estrategia_medicoes(projeto_id, medido_em desc, criado_em desc);

-- ------------------------------------------------------------
-- FECHAMENTOS / APRENDIZADOS
-- ------------------------------------------------------------
create table if not exists public.estrategia_revisoes (
  id uuid primary key default gen_random_uuid(),
  projeto_id uuid not null references public.estrategia_projetos(id) on delete cascade,
  resultado text not null check (resultado in ('atingido','parcial','nao_atingido')),
  funcionou text,
  nao_funcionou text,
  gargalos text,
  proximo_passo text,
  criado_por uuid not null references public.colaboradores(id) on delete restrict,
  criado_em timestamptz not null default now()
);
create index if not exists idx_estrategia_revisoes_projeto on public.estrategia_revisoes(projeto_id, criado_em desc);

-- ------------------------------------------------------------
-- TOUCH CONTROLADO
-- ------------------------------------------------------------
create or replace function public.estrategia_touch_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

drop trigger if exists trg_estrategia_config_touch on public.estrategia_config;
create trigger trg_estrategia_config_touch before update on public.estrategia_config for each row execute function public.estrategia_touch_v1();
drop trigger if exists trg_estrategia_oportunidades_touch on public.estrategia_oportunidades;
create trigger trg_estrategia_oportunidades_touch before update on public.estrategia_oportunidades for each row execute function public.estrategia_touch_v1();
drop trigger if exists trg_estrategia_projetos_touch on public.estrategia_projetos;
create trigger trg_estrategia_projetos_touch before update on public.estrategia_projetos for each row execute function public.estrategia_touch_v1();

-- A fotografia inicial do projeto é evidência histórica, não campo editável.
create or replace function public.estrategia_projeto_preservar_baseline_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.baseline is distinct from old.baseline
     or new.baseline_lineage is distinct from old.baseline_lineage
     or new.criado_por is distinct from old.criado_por
     or new.criado_em is distinct from old.criado_em then
    raise exception 'Baseline e autoria do projeto estratégico são imutáveis';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_estrategia_projetos_preservar_baseline on public.estrategia_projetos;
create trigger trg_estrategia_projetos_preservar_baseline
before update on public.estrategia_projetos
for each row execute function public.estrategia_projeto_preservar_baseline_v1();
drop trigger if exists trg_estrategia_acoes_touch on public.estrategia_acoes;
create trigger trg_estrategia_acoes_touch before update on public.estrategia_acoes for each row execute function public.estrategia_touch_v1();

-- ------------------------------------------------------------
-- RPC TRANSACIONAL: CRIAR PROJETO + BASELINE
-- ------------------------------------------------------------
create or replace function public.criar_projeto_estrategico_v1(
  p_oportunidade_id uuid,
  p_titulo text,
  p_objetivo text,
  p_inicio date,
  p_fim date,
  p_meta_indicador text,
  p_meta_tipo text,
  p_meta_valor numeric,
  p_filtros jsonb,
  p_baseline jsonb,
  p_lineage jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_id uuid;
  v_periodo_de text;
  v_periodo_ate text;
begin
  if auth.uid() is null or v_ator is null then raise exception 'Sessão PMG obrigatória'; end if;
  if p_titulo is null or length(trim(p_titulo)) = 0 then raise exception 'Informe o título do projeto'; end if;
  if p_objetivo is null or length(trim(p_objetivo)) = 0 then raise exception 'Informe o objetivo do projeto'; end if;
  if p_inicio is null or p_fim is null or p_fim < p_inicio then raise exception 'Período do projeto inválido'; end if;
  if p_meta_indicador not in ('faturamento','kg','pedidos','clientes','ticket') then raise exception 'Indicador de meta inválido'; end if;
  if p_meta_tipo not in ('percentual','absoluta') then raise exception 'Tipo de meta inválido'; end if;
  if coalesce(p_meta_valor,-1) < 0 then raise exception 'Meta inválida'; end if;
  if jsonb_typeof(coalesce(p_filtros,'{}'::jsonb)) <> 'object' then raise exception 'Filtros inválidos'; end if;
  if jsonb_typeof(coalesce(p_baseline,'{}'::jsonb)) <> 'object' then raise exception 'Baseline inválido'; end if;

  insert into public.estrategia_projetos(
    oportunidade_id,titulo,objetivo,status,inicio,fim,meta_indicador,meta_tipo,meta_valor,
    filtros,baseline,baseline_lineage,criado_por,atualizado_por
  ) values(
    p_oportunidade_id,trim(p_titulo),trim(p_objetivo),'ativo',p_inicio,p_fim,p_meta_indicador,p_meta_tipo,p_meta_valor,
    coalesce(p_filtros,'{}'::jsonb),coalesce(p_baseline,'{}'::jsonb),coalesce(p_lineage,'{}'::jsonb),v_ator,v_ator
  ) returning id into v_id;

  v_periodo_de := coalesce(p_lineage #>> '{period,de}', null);
  v_periodo_ate := coalesce(p_lineage #>> '{period,ate}', null);
  insert into public.estrategia_medicoes(projeto_id,medido_em,marco,periodo_de,periodo_ate,indicadores,lineage,criado_por)
  values(v_id,p_inicio,'baseline',v_periodo_de,v_periodo_ate,coalesce(p_baseline,'{}'::jsonb),coalesce(p_lineage,'{}'::jsonb),v_ator);

  if p_oportunidade_id is not null then
    update public.estrategia_oportunidades
      set status='convertida', atualizado_por=v_ator, atualizado_em=now()
      where id=p_oportunidade_id;
  end if;

  return v_id;
end;
$$;

-- ------------------------------------------------------------
-- RPC: AÇÃO ESTRATÉGICA -> DEMANDA
-- Mantém a ação vinculada à tarefa real do módulo Demandas.
-- ------------------------------------------------------------
create or replace function public.criar_demanda_estrategica_v1(p_acao_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_acao public.estrategia_acoes%rowtype;
  v_projeto public.estrategia_projetos%rowtype;
  v_tarefa uuid;
begin
  if auth.uid() is null or v_ator is null then raise exception 'Sessão PMG obrigatória'; end if;
  select * into v_acao from public.estrategia_acoes where id=p_acao_id for update;
  if not found then raise exception 'Ação estratégica não encontrada'; end if;
  if v_acao.tarefa_id is not null then return v_acao.tarefa_id; end if;
  select * into v_projeto from public.estrategia_projetos where id=v_acao.projeto_id;
  if not found then raise exception 'Projeto estratégico não encontrado'; end if;

  insert into public.tarefas(titulo,descricao,status,prioridade,responsavel_id,criado_por,prazo,tags)
  values(
    v_acao.titulo,
    concat('Projeto estratégico: ',v_projeto.titulo,E'\n\n',coalesce(v_acao.descricao,'')),
    'nova'::public.status_tarefa,
    case when v_acao.prazo is not null and v_acao.prazo <= (now() at time zone 'America/Sao_Paulo')::date + 3
      then 'alta'::public.prioridade_tarefa else 'media'::public.prioridade_tarefa end,
    v_acao.responsavel_id,
    v_ator,
    v_acao.prazo,
    array['estrategia','planejamento-90-dias']
  ) returning id into v_tarefa;

  update public.estrategia_acoes
    set tarefa_id=v_tarefa, atualizado_por=v_ator, atualizado_em=now()
    where id=v_acao.id;
  return v_tarefa;
end;
$$;

-- ------------------------------------------------------------
-- RLS E GRANTS
-- Apenas contas autenticadas e vinculadas a colaboradores ativos.
-- Histórico de medições é append-only para usuários comuns.
-- ------------------------------------------------------------
alter table public.estrategia_config enable row level security;
alter table public.estrategia_oportunidades enable row level security;
alter table public.estrategia_projetos enable row level security;
alter table public.estrategia_acoes enable row level security;
alter table public.estrategia_medicoes enable row level security;
alter table public.estrategia_revisoes enable row level security;

revoke all on table public.estrategia_config from anon, authenticated;
revoke all on table public.estrategia_oportunidades from anon, authenticated;
revoke all on table public.estrategia_projetos from anon, authenticated;
revoke all on table public.estrategia_acoes from anon, authenticated;
revoke all on table public.estrategia_medicoes from anon, authenticated;
revoke all on table public.estrategia_revisoes from anon, authenticated;

grant select on table public.estrategia_config to authenticated;
grant select,insert,update,delete on table public.estrategia_oportunidades to authenticated;
grant select,insert,update,delete on table public.estrategia_projetos to authenticated;
grant select,insert,update,delete on table public.estrategia_acoes to authenticated;
grant select,insert,delete on table public.estrategia_medicoes to authenticated;
grant select,insert,delete on table public.estrategia_revisoes to authenticated;

revoke all on function public.criar_projeto_estrategico_v1(uuid,text,text,date,date,text,text,numeric,jsonb,jsonb,jsonb) from public, anon, authenticated;
revoke all on function public.criar_demanda_estrategica_v1(uuid) from public, anon, authenticated;
grant execute on function public.criar_projeto_estrategico_v1(uuid,text,text,date,date,text,text,numeric,jsonb,jsonb,jsonb) to authenticated;
grant execute on function public.criar_demanda_estrategica_v1(uuid) to authenticated;

-- CONFIG
drop policy if exists estrategia_config_select on public.estrategia_config;
create policy estrategia_config_select on public.estrategia_config for select to authenticated
using ((select public.meu_colaborador_id()) is not null);

-- OPORTUNIDADES
drop policy if exists estrategia_oportunidades_select on public.estrategia_oportunidades;
create policy estrategia_oportunidades_select on public.estrategia_oportunidades for select to authenticated
using ((select public.meu_colaborador_id()) is not null);
drop policy if exists estrategia_oportunidades_insert on public.estrategia_oportunidades;
create policy estrategia_oportunidades_insert on public.estrategia_oportunidades for insert to authenticated
with check (criado_por = (select public.meu_colaborador_id()));
drop policy if exists estrategia_oportunidades_update on public.estrategia_oportunidades;
create policy estrategia_oportunidades_update on public.estrategia_oportunidades for update to authenticated
using ((select public.meu_colaborador_id()) is not null)
with check (coalesce(atualizado_por,(select public.meu_colaborador_id())) = (select public.meu_colaborador_id()));
drop policy if exists estrategia_oportunidades_delete on public.estrategia_oportunidades;
create policy estrategia_oportunidades_delete on public.estrategia_oportunidades for delete to authenticated
using ((select public.sou_gestor()));

-- PROJETOS
drop policy if exists estrategia_projetos_select on public.estrategia_projetos;
create policy estrategia_projetos_select on public.estrategia_projetos for select to authenticated
using ((select public.meu_colaborador_id()) is not null);
drop policy if exists estrategia_projetos_insert on public.estrategia_projetos;
create policy estrategia_projetos_insert on public.estrategia_projetos for insert to authenticated
with check (criado_por = (select public.meu_colaborador_id()));
drop policy if exists estrategia_projetos_update on public.estrategia_projetos;
create policy estrategia_projetos_update on public.estrategia_projetos for update to authenticated
using ((select public.meu_colaborador_id()) is not null)
with check (coalesce(atualizado_por,(select public.meu_colaborador_id())) = (select public.meu_colaborador_id()));
drop policy if exists estrategia_projetos_delete on public.estrategia_projetos;
create policy estrategia_projetos_delete on public.estrategia_projetos for delete to authenticated
using ((select public.sou_gestor()));

-- AÇÕES
drop policy if exists estrategia_acoes_select on public.estrategia_acoes;
create policy estrategia_acoes_select on public.estrategia_acoes for select to authenticated
using ((select public.meu_colaborador_id()) is not null);
drop policy if exists estrategia_acoes_insert on public.estrategia_acoes;
create policy estrategia_acoes_insert on public.estrategia_acoes for insert to authenticated
with check (criado_por = (select public.meu_colaborador_id()));
drop policy if exists estrategia_acoes_update on public.estrategia_acoes;
create policy estrategia_acoes_update on public.estrategia_acoes for update to authenticated
using ((select public.meu_colaborador_id()) is not null)
with check (coalesce(atualizado_por,(select public.meu_colaborador_id())) = (select public.meu_colaborador_id()));
drop policy if exists estrategia_acoes_delete on public.estrategia_acoes;
create policy estrategia_acoes_delete on public.estrategia_acoes for delete to authenticated
using ((select public.sou_gestor()));

-- MEDIÇÕES: leitura + insert para equipe. Delete apenas gestor. Sem UPDATE.
drop policy if exists estrategia_medicoes_select on public.estrategia_medicoes;
create policy estrategia_medicoes_select on public.estrategia_medicoes for select to authenticated
using ((select public.meu_colaborador_id()) is not null);
drop policy if exists estrategia_medicoes_insert on public.estrategia_medicoes;
create policy estrategia_medicoes_insert on public.estrategia_medicoes for insert to authenticated
with check (criado_por = (select public.meu_colaborador_id()));
drop policy if exists estrategia_medicoes_delete on public.estrategia_medicoes;
create policy estrategia_medicoes_delete on public.estrategia_medicoes for delete to authenticated
using ((select public.sou_gestor()));

-- REVISÕES
drop policy if exists estrategia_revisoes_select on public.estrategia_revisoes;
create policy estrategia_revisoes_select on public.estrategia_revisoes for select to authenticated
using ((select public.meu_colaborador_id()) is not null);
drop policy if exists estrategia_revisoes_insert on public.estrategia_revisoes;
create policy estrategia_revisoes_insert on public.estrategia_revisoes for insert to authenticated
with check (criado_por = (select public.meu_colaborador_id()));
drop policy if exists estrategia_revisoes_delete on public.estrategia_revisoes;
create policy estrategia_revisoes_delete on public.estrategia_revisoes for delete to authenticated
using ((select public.sou_gestor()));

commit;
