-- ============================================================
-- PMG CONNECT V1.3.0 — GESTAO MKT / CONFERENCIA MENSAL
-- Planejamento PMG + Receita + Fechamento Marketing -> Marcos
-- ============================================================
-- Execute depois dos SQLs 06 a 10. Script idempotente.
-- ============================================================

begin;

-- O Planejamento e previsao. Mes passado nao significa gasto realizado.
update public.acompanhamento_pagamentos p
set
  status = 'previsto',
  valor_pago = 0,
  pago_em = null,
  observacoes = 'Valor planejado. A baixa passa a depender de um gasto real vinculado ou de conferencia manual.',
  atualizado_em = now()
from public.acompanhamento_registros r
where r.id = p.registro_id
  and r.arquivado_em is null
  and r.controle = 'marcos'
  and r.ano_referencia = 2026
  and r.natureza = 'despesa'
  and 'planejamento' = any(coalesce(r.tags, '{}'::text[]))
  and p.status <> 'cancelado';

update public.acompanhamento_registros r
set
  status = case when r.status = 'cancelado' then r.status else 'em_andamento' end,
  atualizado_em = now()
where r.arquivado_em is null
  and r.controle = 'marcos'
  and r.ano_referencia = 2026
  and r.natureza = 'despesa'
  and 'planejamento' = any(coalesce(r.tags, '{}'::text[]));

create table if not exists public.acompanhamento_conferencias (
  id uuid primary key default gen_random_uuid(),
  competencia date not null,
  fornecedor text not null,
  fornecedor_chave text not null,
  status text not null default 'pendente',
  valor_snapshot numeric(14,2) not null default 0,
  observacoes text,
  conferido_por uuid references public.colaboradores(id) on delete set null,
  conferido_em timestamptz,
  criado_por uuid references public.colaboradores(id) on delete set null,
  atualizado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint acompanhamento_conferencia_status_valido check (status in ('pendente', 'conferido', 'divergente')),
  constraint acompanhamento_conferencia_valor_valido check (valor_snapshot >= 0),
  constraint acompanhamento_conferencia_fornecedor_valido check (length(trim(fornecedor)) > 0),
  constraint acompanhamento_conferencia_competencia_valida check (competencia = date_trunc('month', competencia)::date)
);

create unique index if not exists idx_acompanhamento_conferencia_competencia_fornecedor
  on public.acompanhamento_conferencias(competencia, fornecedor_chave);
create index if not exists idx_acompanhamento_conferencias_competencia
  on public.acompanhamento_conferencias(competencia desc, status);

drop trigger if exists trg_acompanhamento_conferencias_atualizado on public.acompanhamento_conferencias;
create trigger trg_acompanhamento_conferencias_atualizado
before update on public.acompanhamento_conferencias
for each row execute function public.set_acompanhamento_atualizado_em();

create or replace function public.salvar_conferencia_acompanhamento_v1(
  p_competencia date,
  p_fornecedor text,
  p_status text default 'conferido',
  p_valor_snapshot numeric default 0,
  p_observacoes text default ''
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_id uuid;
  v_fornecedor text := trim(coalesce(p_fornecedor, ''));
  v_chave text := lower(trim(coalesce(p_fornecedor, '')));
  v_competencia date := date_trunc('month', p_competencia)::date;
  v_status text := coalesce(nullif(trim(p_status), ''), 'conferido');
begin
  if v_ator is null then raise exception 'Colaborador nao encontrado ou inativo'; end if;
  if p_competencia is null then raise exception 'Competencia obrigatoria'; end if;
  if v_fornecedor = '' then raise exception 'Fornecedor obrigatorio'; end if;
  if v_status not in ('pendente', 'conferido', 'divergente') then raise exception 'Status de conferencia invalido'; end if;
  if coalesce(p_valor_snapshot, 0) < 0 then raise exception 'Valor da conferencia nao pode ser negativo'; end if;

  insert into public.acompanhamento_conferencias (
    competencia, fornecedor, fornecedor_chave, status, valor_snapshot, observacoes,
    conferido_por, conferido_em, criado_por, atualizado_por
  ) values (
    v_competencia, v_fornecedor, v_chave, v_status, coalesce(p_valor_snapshot, 0), nullif(trim(p_observacoes), ''),
    case when v_status = 'conferido' then v_ator else null end,
    case when v_status = 'conferido' then now() else null end,
    v_ator, v_ator
  )
  on conflict (competencia, fornecedor_chave)
  do update set
    fornecedor = excluded.fornecedor,
    status = excluded.status,
    valor_snapshot = excluded.valor_snapshot,
    observacoes = excluded.observacoes,
    conferido_por = case when excluded.status = 'conferido' then v_ator else null end,
    conferido_em = case when excluded.status = 'conferido' then now() else null end,
    atualizado_por = v_ator,
    atualizado_em = now()
  returning id into v_id;

  return v_id;
end;
$$;

alter table public.acompanhamento_conferencias enable row level security;

drop policy if exists "equipe le conferencias acompanhamento" on public.acompanhamento_conferencias;
create policy "equipe le conferencias acompanhamento" on public.acompanhamento_conferencias
for select to authenticated using (public.acompanhamento_colaborador_ativo());

revoke all on public.acompanhamento_conferencias from anon, authenticated;
grant select on public.acompanhamento_conferencias to authenticated;
revoke all on function public.salvar_conferencia_acompanhamento_v1(date, text, text, numeric, text) from public;
grant execute on function public.salvar_conferencia_acompanhamento_v1(date, text, text, numeric, text) to authenticated;

commit;

do $$
begin
  alter publication supabase_realtime add table public.acompanhamento_conferencias;
exception when duplicate_object then null;
end $$;

select
  count(*) as conferencias,
  count(*) filter (where status = 'conferido') as conferidas,
  count(*) filter (where status = 'divergente') as divergentes
from public.acompanhamento_conferencias;
