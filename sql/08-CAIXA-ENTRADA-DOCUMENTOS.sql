-- ============================================================
-- PMG CONNECT - CAIXA DE ENTRADA DE DOCUMENTOS V1.2
-- Execute DEPOIS de sql/06-CENTRAL-ACOMPANHAMENTO.sql
-- Script idempotente: pode ser executado novamente.
-- ============================================================

create extension if not exists pgcrypto;

create table if not exists public.acompanhamento_documentos_entrada (
  id uuid primary key default gen_random_uuid(),
  nome_arquivo text not null,
  caminho text not null unique,
  mime_type text not null default 'application/pdf',
  tamanho_bytes bigint not null default 0,
  hash_sha256 text,
  total_paginas integer,
  status text not null default 'recebido',
  resumo_analise text,
  analise_bruta jsonb not null default '{}'::jsonb,
  erro_analise text,
  criado_por uuid references public.colaboradores(id) on delete set null,
  atualizado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint documentos_entrada_nome_valido check (length(trim(nome_arquivo)) > 0),
  constraint documentos_entrada_pdf check (mime_type = 'application/pdf'),
  constraint documentos_entrada_tamanho_valido check (tamanho_bytes between 1 and 15728640),
  constraint documentos_entrada_paginas_validas check (total_paginas is null or total_paginas > 0),
  constraint documentos_entrada_status_valido check (
    status in ('recebido', 'analisando', 'aguardando_conferencia', 'parcialmente_conferido', 'conferido', 'erro', 'rejeitado')
  )
);

create unique index if not exists idx_documentos_entrada_hash
  on public.acompanhamento_documentos_entrada(hash_sha256)
  where hash_sha256 is not null;
create index if not exists idx_documentos_entrada_fila
  on public.acompanhamento_documentos_entrada(status, criado_em desc);

create table if not exists public.acompanhamento_documentos_itens (
  id uuid primary key default gen_random_uuid(),
  entrada_id uuid references public.acompanhamento_documentos_entrada(id) on delete cascade not null,
  ordem integer not null default 1,
  paginas integer[] not null default '{1}'::integer[],
  tipo text not null default 'nao_identificado',
  confianca numeric(5,4) not null default 0,
  status text not null default 'aguardando_conferencia',
  dados_extraidos jsonb not null default '{}'::jsonb,
  dados_conferidos jsonb not null default '{}'::jsonb,
  registro_id uuid references public.acompanhamento_registros(id) on delete set null,
  pagamento_id uuid references public.acompanhamento_pagamentos(id) on delete set null,
  conferido_por uuid references public.colaboradores(id) on delete set null,
  conferido_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint documentos_itens_ordem_valida check (ordem > 0),
  constraint documentos_itens_confianca_valida check (confianca between 0 and 1),
  constraint documentos_itens_tipo_valido check (
    tipo in ('desconto_nota', 'deposito', 'extrato_bancario', 'nao_identificado')
  ),
  constraint documentos_itens_status_valido check (
    status in ('aguardando_conferencia', 'aprovado', 'ignorado')
  ),
  unique (entrada_id, ordem)
);

create index if not exists idx_documentos_itens_entrada
  on public.acompanhamento_documentos_itens(entrada_id, ordem);
create index if not exists idx_documentos_itens_registro
  on public.acompanhamento_documentos_itens(registro_id, conferido_em desc)
  where registro_id is not null;
create index if not exists idx_documentos_itens_pendentes
  on public.acompanhamento_documentos_itens(status, criado_em desc)
  where status = 'aguardando_conferencia';

drop trigger if exists trg_documentos_entrada_atualizado on public.acompanhamento_documentos_entrada;
create trigger trg_documentos_entrada_atualizado
before update on public.acompanhamento_documentos_entrada
for each row execute function public.set_acompanhamento_atualizado_em();

drop trigger if exists trg_documentos_itens_atualizado on public.acompanhamento_documentos_itens;
create trigger trg_documentos_itens_atualizado
before update on public.acompanhamento_documentos_itens
for each row execute function public.set_acompanhamento_atualizado_em();

-- ------------------------------------------------------------
-- ATUALIZA O ESTADO DO PDF A PARTIR DOS ITENS CONFERIDOS
-- ------------------------------------------------------------

create or replace function public.atualizar_status_entrada_documento_v1(p_entrada_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer;
  v_pendentes integer;
  v_aprovados integer;
begin
  select count(*),
         count(*) filter (where status = 'aguardando_conferencia'),
         count(*) filter (where status = 'aprovado')
    into v_total, v_pendentes, v_aprovados
  from public.acompanhamento_documentos_itens
  where entrada_id = p_entrada_id;

  update public.acompanhamento_documentos_entrada
  set status = case
    when v_total = 0 then 'recebido'
    when v_pendentes = 0 then 'conferido'
    when v_aprovados > 0 or v_pendentes < v_total then 'parcialmente_conferido'
    else 'aguardando_conferencia'
  end,
  atualizado_por = public.meu_colaborador_id()
  where id = p_entrada_id;
end;
$$;

-- ------------------------------------------------------------
-- RECEBIMENTO E LEITURA AUTOMATICA
-- ------------------------------------------------------------

create or replace function public.criar_entrada_documento_v1(
  p_nome_arquivo text,
  p_caminho text,
  p_mime_type text,
  p_tamanho_bytes bigint,
  p_hash_sha256 text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_id uuid;
  v_uid text := auth.uid()::text;
begin
  if v_ator is null then raise exception 'Colaborador nao encontrado ou inativo'; end if;
  if coalesce(p_mime_type, '') <> 'application/pdf' then raise exception 'Somente arquivos PDF sao aceitos'; end if;
  if coalesce(p_tamanho_bytes, 0) < 1 or p_tamanho_bytes > 15728640 then
    raise exception 'O PDF deve ter no maximo 15 MB';
  end if;
  if trim(coalesce(p_caminho, '')) not like v_uid || '/entrada/%' then
    raise exception 'Caminho de armazenamento invalido';
  end if;

  if nullif(trim(coalesce(p_hash_sha256, '')), '') is not null then
    select id into v_id
    from public.acompanhamento_documentos_entrada
    where hash_sha256 = lower(trim(p_hash_sha256))
    limit 1;
    if v_id is not null then return v_id; end if;
  end if;

  insert into public.acompanhamento_documentos_entrada(
    nome_arquivo, caminho, mime_type, tamanho_bytes, hash_sha256,
    status, criado_por, atualizado_por
  ) values (
    trim(p_nome_arquivo), trim(p_caminho), p_mime_type, p_tamanho_bytes,
    nullif(lower(trim(coalesce(p_hash_sha256, ''))), ''),
    'recebido', v_ator, v_ator
  ) returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.iniciar_analise_documento_v1(p_entrada_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
begin
  if v_ator is null then raise exception 'Colaborador nao encontrado ou inativo'; end if;
  update public.acompanhamento_documentos_entrada
  set status = 'analisando', erro_analise = null, atualizado_por = v_ator
  where id = p_entrada_id and status in ('recebido', 'erro', 'analisando');
  if not found then raise exception 'Documento nao encontrado ou indisponivel para nova leitura'; end if;
end;
$$;

create or replace function public.registrar_analise_documento_v1(
  p_entrada_id uuid,
  p_resultado jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_documentos jsonb := coalesce(p_resultado -> 'documentos', '[]'::jsonb);
  v_total integer := 0;
begin
  if v_ator is null then raise exception 'Colaborador nao encontrado ou inativo'; end if;
  if not exists (
    select 1 from public.acompanhamento_documentos_entrada
    where id = p_entrada_id and status in ('analisando', 'erro')
  ) then
    raise exception 'Documento nao encontrado ou fora da etapa de leitura';
  end if;
  if exists (
    select 1 from public.acompanhamento_documentos_itens
    where entrada_id = p_entrada_id and status <> 'aguardando_conferencia'
  ) then
    raise exception 'A analise nao pode ser substituida depois do inicio da conferencia';
  end if;

  delete from public.acompanhamento_documentos_itens where entrada_id = p_entrada_id;

  insert into public.acompanhamento_documentos_itens(
    entrada_id, ordem, paginas, tipo, confianca, status, dados_extraidos
  )
  select
    p_entrada_id,
    greatest(coalesce((item ->> 'ordem')::integer, ord::integer), 1),
    coalesce(
      array(select greatest(value::integer, 1) from jsonb_array_elements_text(coalesce(item -> 'paginas', '[1]'::jsonb))),
      '{1}'::integer[]
    ),
    case
      when item ->> 'tipo' in ('desconto_nota', 'deposito', 'extrato_bancario', 'nao_identificado') then item ->> 'tipo'
      when item ->> 'tipo' in ('cadastro_pagamento', 'pedido_compra') then 'desconto_nota'
      when item ->> 'tipo' = 'danfe' then 'deposito'
      else 'nao_identificado' end,
    least(greatest(coalesce((item ->> 'confianca')::numeric, 0), 0), 1),
    'aguardando_conferencia',
    item
  from jsonb_array_elements(v_documentos) with ordinality as docs(item, ord);

  get diagnostics v_total = row_count;
  if v_total = 0 then
    insert into public.acompanhamento_documentos_itens(
      entrada_id, ordem, paginas, tipo, confianca, status, dados_extraidos
    ) values (
      p_entrada_id, 1, '{1}', 'nao_identificado', 0, 'aguardando_conferencia',
      jsonb_build_object('alertas', jsonb_build_array('A leitura automatica nao identificou um documento.'))
    );
    v_total := 1;
  end if;

  update public.acompanhamento_documentos_entrada
  set total_paginas = greatest(coalesce((p_resultado ->> 'total_paginas')::integer, 1), 1),
      resumo_analise = nullif(trim(p_resultado ->> 'resumo'), ''),
      analise_bruta = p_resultado,
      erro_analise = null,
      status = 'aguardando_conferencia',
      atualizado_por = v_ator
  where id = p_entrada_id;

  return v_total;
end;
$$;

create or replace function public.registrar_erro_documento_v1(
  p_entrada_id uuid,
  p_erro text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
begin
  if v_ator is null then raise exception 'Colaborador nao encontrado ou inativo'; end if;
  update public.acompanhamento_documentos_entrada
  set status = 'erro', erro_analise = left(coalesce(p_erro, 'Falha na leitura automatica'), 1000), atualizado_por = v_ator
  where id = p_entrada_id and status = 'analisando';
end;
$$;

-- ------------------------------------------------------------
-- CONFERENCIA OBRIGATORIA E LANCAMENTO
-- ------------------------------------------------------------

create or replace function public.aprovar_documento_acompanhamento_v1(
  p_item_id uuid,
  p_dados jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_item public.acompanhamento_documentos_itens%rowtype;
  v_acao text := coalesce(nullif(p_dados ->> 'acao', ''), 'novo');
  v_registro_id uuid;
  v_pagamento_id uuid;
  v_criar_pagamento boolean := coalesce((p_dados ->> 'criar_pagamento')::boolean, false);
begin
  if v_ator is null then raise exception 'Colaborador nao encontrado ou inativo'; end if;

  select * into v_item
  from public.acompanhamento_documentos_itens
  where id = p_item_id
  for update;

  if v_item.id is null then raise exception 'Item de documento nao encontrado'; end if;
  if v_item.status <> 'aguardando_conferencia' then raise exception 'Este documento ja foi conferido'; end if;
  if v_acao not in ('novo', 'vincular', 'somente_anexar', 'ignorar') then raise exception 'Acao de conferencia invalida'; end if;

  if v_acao = 'ignorar' then
    update public.acompanhamento_documentos_itens
    set status = 'ignorado', dados_conferidos = p_dados,
        conferido_por = v_ator, conferido_em = now()
    where id = p_item_id;
    perform public.atualizar_status_entrada_documento_v1(v_item.entrada_id);
    return jsonb_build_object('status', 'ignorado');
  end if;

  if coalesce((p_dados ->> 'conferencia_confirmada')::boolean, false) is not true then
    raise exception 'Confirme que o documento original e os valores foram conferidos';
  end if;

  if v_acao = 'novo' then
    v_registro_id := public.salvar_acompanhamento_v1(null, coalesce(p_dados -> 'acompanhamento', '{}'::jsonb));
  else
    v_registro_id := nullif(p_dados ->> 'registro_id', '')::uuid;
    if v_registro_id is null or not exists (
      select 1 from public.acompanhamento_registros where id = v_registro_id and arquivado_em is null
    ) then raise exception 'Selecione um acompanhamento valido'; end if;
  end if;

  if v_acao <> 'somente_anexar' and v_criar_pagamento then
    v_pagamento_id := public.salvar_pagamento_acompanhamento_v1(
      null,
      v_registro_id,
      coalesce(p_dados -> 'pagamento', '{}'::jsonb)
    );
  end if;

  update public.acompanhamento_documentos_itens
  set status = 'aprovado', dados_conferidos = p_dados,
      registro_id = v_registro_id, pagamento_id = v_pagamento_id,
      conferido_por = v_ator, conferido_em = now()
  where id = p_item_id;

  insert into public.acompanhamento_atividades(
    registro_id, pagamento_id, ator_id, tipo, resumo, detalhes
  ) values (
    v_registro_id, v_pagamento_id, v_ator, 'documento_conferido',
    'conferiu e vinculou um documento da caixa de entrada',
    jsonb_build_object('item_id', p_item_id, 'acao', v_acao, 'tipo', v_item.tipo)
  );

  perform public.atualizar_status_entrada_documento_v1(v_item.entrada_id);
  return jsonb_build_object(
    'status', 'aprovado',
    'registro_id', v_registro_id,
    'pagamento_id', v_pagamento_id
  );
end;
$$;

-- ------------------------------------------------------------
-- RLS E PERMISSOES
-- ------------------------------------------------------------

alter table public.acompanhamento_documentos_entrada enable row level security;
alter table public.acompanhamento_documentos_itens enable row level security;

drop policy if exists "equipe le documentos entrada" on public.acompanhamento_documentos_entrada;
create policy "equipe le documentos entrada" on public.acompanhamento_documentos_entrada
for select to authenticated using (public.acompanhamento_colaborador_ativo());

drop policy if exists "equipe le itens documentos" on public.acompanhamento_documentos_itens;
create policy "equipe le itens documentos" on public.acompanhamento_documentos_itens
for select to authenticated using (public.acompanhamento_colaborador_ativo());

revoke all on public.acompanhamento_documentos_entrada from anon, authenticated;
revoke all on public.acompanhamento_documentos_itens from anon, authenticated;
grant select on public.acompanhamento_documentos_entrada to authenticated;
grant select on public.acompanhamento_documentos_itens to authenticated;

revoke all on function public.atualizar_status_entrada_documento_v1(uuid) from public;
revoke all on function public.criar_entrada_documento_v1(text, text, text, bigint, text) from public;
revoke all on function public.iniciar_analise_documento_v1(uuid) from public;
revoke all on function public.registrar_analise_documento_v1(uuid, jsonb) from public;
revoke all on function public.registrar_erro_documento_v1(uuid, text) from public;
revoke all on function public.aprovar_documento_acompanhamento_v1(uuid, jsonb) from public;

grant execute on function public.criar_entrada_documento_v1(text, text, text, bigint, text) to authenticated;
grant execute on function public.iniciar_analise_documento_v1(uuid) to authenticated;
grant execute on function public.registrar_analise_documento_v1(uuid, jsonb) to authenticated;
grant execute on function public.registrar_erro_documento_v1(uuid, text) to authenticated;
grant execute on function public.aprovar_documento_acompanhamento_v1(uuid, jsonb) to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.acompanhamento_documentos_entrada;
exception when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.acompanhamento_documentos_itens;
exception when duplicate_object then null;
end $$;

-- FIM
