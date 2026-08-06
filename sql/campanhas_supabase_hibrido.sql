-- ============================================================
-- PMG CONNECT — CAMPANHAS HÍBRIDAS
-- Persistência compartilhada e cache de contingência no Supabase.
-- Execute uma vez no SQL Editor do Supabase. O script é idempotente.
-- ============================================================

create table if not exists public.campanhas_documentos (
  store text not null,
  id text not null,
  campanha_id text,
  dados jsonb not null default '{}'::jsonb,
  atualizado_em timestamptz not null default now(),
  primary key (store, id)
);

create index if not exists idx_campanhas_documentos_store
  on public.campanhas_documentos(store, atualizado_em desc);

create index if not exists idx_campanhas_documentos_campanha
  on public.campanhas_documentos(store, campanha_id, atualizado_em desc)
  where campanha_id is not null;

create table if not exists public.campanhas_cache_sql (
  chave text primary key,
  recurso text not null,
  parametros jsonb not null default '{}'::jsonb,
  dados jsonb not null,
  atualizado_em timestamptz not null default now(),
  expira_em timestamptz not null
);

create index if not exists idx_campanhas_cache_sql_recurso
  on public.campanhas_cache_sql(recurso, atualizado_em desc);

create index if not exists idx_campanhas_cache_sql_expiracao
  on public.campanhas_cache_sql(expira_em);

alter table public.campanhas_documentos enable row level security;
alter table public.campanhas_cache_sql enable row level security;

-- O acesso é feito exclusivamente pelas Vercel Functions com a service role.
-- A service role ignora RLS. Nenhuma policy pública é criada de propósito.

comment on table public.campanhas_documentos is
  'Documentos configuráveis do módulo Campanhas PMG, persistidos pela API serverless.';
comment on table public.campanhas_cache_sql is
  'Últimas respostas válidas do SQL Server para contingência quando o Power BI estiver indisponível.';
