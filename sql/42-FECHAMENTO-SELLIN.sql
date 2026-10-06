-- 42-FECHAMENTO-SELLIN.sql
--
-- Sell-in na aba "Fechamento".
--
-- O que é:
--   Parte dos fornecedores (as planilhas com "-" no nome: Alfama-_, Bem Brasil-,
--   Bunge-, Camil-, McCain-_, Mirella-, Polenghi-, Predilecta-, Seara-, além do
--   arquivo "Aurora (Sell In)") tem acordo sobre o SELL-IN: as NFs que o
--   fornecedor emitiu pra PMG no mês. A conta é sempre a mesma:
--       TOTAL (soma das NFs) × PARTICIPAÇÃO (%) = VERBA
--
--   A aba guarda isso por fornecedor × competência: a lista de NFs, o total, o %
--   e a verba. Entra no e-mail do fechamento como tabela SELL-IN.
--
-- Por que linhas no banco (e não JSON no Storage, como o dashboard):
--   É pouco dado (5 a 30 NFs por fornecedor por mês, poucos KB por ano).
--
-- Segurança: mesma regra das outras tabelas do fechamento (fechamento_equipe()).
-- Diferente dos débitos, a própria equipe pode APAGAR um sell-in (botão
-- "Remover sell-in" da tela), porque ele é refeito a partir da planilha.
--
-- Idempotente: pode rodar mais de uma vez.

-- ───────────────────────── marcação no cadastro ─────────────────────────
alter table public.fechamento_fornecedores
  add column if not exists tem_sellin boolean not null default false,
  add column if not exists sellin_participacao numeric(9,6)
    check (sellin_participacao is null or (sellin_participacao >= 0 and sellin_participacao <= 1));

comment on column public.fechamento_fornecedores.tem_sellin is
  'Fornecedor tem acordo de sell-in: aparece o chip e a cobrança no fechamento do mês.';
comment on column public.fechamento_fornecedores.sellin_participacao is
  'Último % de participação usado (fração: 0.015 = 1,5%). Sugerido no próximo mês.';

-- ───────────────────────── sell-in por competência ─────────────────────────
create table if not exists public.fechamento_sellin (
  id               uuid primary key default gen_random_uuid(),
  fornecedor_id    bigint not null references public.fechamento_fornecedores(id) on delete cascade,
  competencia      date not null check (extract(day from competencia) = 1),
  notas            jsonb not null default '[]'::jsonb check (jsonb_typeof(notas) = 'array'),
  total            numeric(16,2) not null default 0 check (total >= 0),
  participacao     numeric(9,6) not null default 0 check (participacao >= 0 and participacao <= 1),
  verba            numeric(16,2) not null default 0 check (verba >= 0),
  arquivo_nome     text,
  observacao       text,
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  atualizado_por   uuid default auth.uid(),
  unique (fornecedor_id, competencia)
);

comment on table public.fechamento_sellin is
  'Sell-in do fechamento: NFs emitidas pelo fornecedor pra PMG na competência, % de participação e verba (total × %).';
comment on column public.fechamento_sellin.notas is
  '[{"numero":"000058195","emissao":"2026-09-03","cnpj":"11.660.951/0002-94","valor":71956}]';

drop trigger if exists fechamento_sellin_touch on public.fechamento_sellin;
create trigger fechamento_sellin_touch before update on public.fechamento_sellin
  for each row execute procedure public.fechamento_touch();

alter table public.fechamento_sellin enable row level security;
revoke all on public.fechamento_sellin from anon;

drop policy if exists "equipe le fechamento_sellin" on public.fechamento_sellin;
drop policy if exists "equipe cria fechamento_sellin" on public.fechamento_sellin;
drop policy if exists "equipe edita fechamento_sellin" on public.fechamento_sellin;
drop policy if exists "equipe remove fechamento_sellin" on public.fechamento_sellin;

create policy "equipe le fechamento_sellin" on public.fechamento_sellin
  for select to authenticated using (public.fechamento_equipe());
create policy "equipe cria fechamento_sellin" on public.fechamento_sellin
  for insert to authenticated with check (public.fechamento_equipe());
create policy "equipe edita fechamento_sellin" on public.fechamento_sellin
  for update to authenticated using (public.fechamento_equipe()) with check (public.fechamento_equipe());
create policy "equipe remove fechamento_sellin" on public.fechamento_sellin
  for delete to authenticated using (public.fechamento_equipe());

-- log de upload passa a aceitar o tipo 'sellin'
alter table public.fechamento_uploads drop constraint if exists fechamento_uploads_tipo_check;
alter table public.fechamento_uploads add constraint fechamento_uploads_tipo_check
  check (tipo in ('crm','template','sellin'));

-- ───────────────────────── quem já tem sell-in hoje ─────────────────────────
-- (planilhas com tracinho + Aurora, que manda o sell-in num arquivo separado)
update public.fechamento_fornecedores
   set tem_sellin = true
 where nome in ('Alfama','Aurora','Bem Brasil','Bunge','Camil','McCain','Mirella','Polenghi','Predilecta','Seara')
   and tem_sellin = false;
