-- ============================================================
-- PMG CONNECT V1.4.0 — CONTROLES OPERACIONAIS E EXECUCAO
-- Execute depois dos SQLs 06 a 11. Script idempotente.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- ATIVIDADES OPERACIONAIS DO PLANEJAMENTO
-- ------------------------------------------------------------

create table if not exists public.acompanhamento_planejamento_atividades (
  id uuid primary key default gen_random_uuid(),
  registro_id uuid not null references public.acompanhamento_registros(id) on delete cascade,
  pagamento_id uuid references public.acompanhamento_pagamentos(id) on delete set null,
  titulo text not null,
  descricao text,
  responsavel_id uuid references public.colaboradores(id) on delete set null,
  prazo date,
  status text not null default 'planejada',
  percentual integer not null default 0,
  custo_previsto numeric(14,2) not null default 0,
  custo_realizado numeric(14,2) not null default 0,
  evidencia text,
  concluido_em timestamptz,
  criado_por uuid references public.colaboradores(id) on delete set null,
  atualizado_por uuid references public.colaboradores(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint planejamento_atividade_titulo_valido check (length(trim(titulo)) > 0),
  constraint planejamento_atividade_status_valido check (status in ('planejada', 'em_andamento', 'bloqueada', 'concluida')),
  constraint planejamento_atividade_percentual_valido check (percentual between 0 and 100),
  constraint planejamento_atividade_custos_validos check (custo_previsto >= 0 and custo_realizado >= 0)
);

create index if not exists idx_planejamento_atividades_registro
  on public.acompanhamento_planejamento_atividades(registro_id, status, prazo);
create index if not exists idx_planejamento_atividades_responsavel
  on public.acompanhamento_planejamento_atividades(responsavel_id, status, prazo);
create unique index if not exists idx_planejamento_atividade_pagamento
  on public.acompanhamento_planejamento_atividades(pagamento_id)
  where pagamento_id is not null;

drop trigger if exists trg_planejamento_atividade_atualizado on public.acompanhamento_planejamento_atividades;
create trigger trg_planejamento_atividade_atualizado
before update on public.acompanhamento_planejamento_atividades
for each row execute function public.set_acompanhamento_atualizado_em();

create or replace function public.salvar_atividade_planejamento_v1(
  p_atividade_id uuid,
  p_dados jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_id uuid := p_atividade_id;
  v_registro uuid := nullif(p_dados ->> 'registro_id', '')::uuid;
  v_pagamento uuid := nullif(p_dados ->> 'pagamento_id', '')::uuid;
  v_status text := coalesce(nullif(trim(p_dados ->> 'status'), ''), 'planejada');
  v_percentual integer := greatest(0, least(100, coalesce(nullif(p_dados ->> 'percentual', '')::integer, 0)));
begin
  if v_ator is null then raise exception 'Colaborador nao encontrado ou inativo'; end if;
  if v_registro is null or not exists (
    select 1 from public.acompanhamento_registros r
    where r.id = v_registro and r.arquivado_em is null and r.controle = 'marcos'
      and r.natureza = 'despesa' and 'planejamento' = any(coalesce(r.tags, '{}'::text[]))
  ) then raise exception 'Selecione uma frente valida do Planejamento PMG'; end if;
  if trim(coalesce(p_dados ->> 'titulo', '')) = '' then raise exception 'Titulo da atividade obrigatorio'; end if;
  if v_status not in ('planejada', 'em_andamento', 'bloqueada', 'concluida') then raise exception 'Status da atividade invalido'; end if;
  if v_pagamento is not null and exists (
    select 1 from public.acompanhamento_pagamentos p where p.id = v_pagamento and p.status = 'pago'
  ) then
    v_status := 'concluida';
    v_percentual := 100;
  elsif v_status = 'concluida' then
    v_percentual := 100;
  end if;

  if v_id is null then
    insert into public.acompanhamento_planejamento_atividades (
      registro_id, pagamento_id, titulo, descricao, responsavel_id, prazo, status, percentual,
      custo_previsto, custo_realizado, evidencia, concluido_em, criado_por, atualizado_por
    ) values (
      v_registro, v_pagamento, trim(p_dados ->> 'titulo'), nullif(trim(p_dados ->> 'descricao'), ''),
      nullif(p_dados ->> 'responsavel_id', '')::uuid, nullif(p_dados ->> 'prazo', '')::date,
      v_status, v_percentual,
      greatest(coalesce(nullif(p_dados ->> 'custo_previsto', '')::numeric, 0), 0),
      greatest(coalesce(nullif(p_dados ->> 'custo_realizado', '')::numeric, 0), 0),
      nullif(trim(p_dados ->> 'evidencia'), ''), case when v_status = 'concluida' then now() else null end,
      v_ator, v_ator
    ) returning id into v_id;
  else
    update public.acompanhamento_planejamento_atividades set
      registro_id = v_registro,
      pagamento_id = v_pagamento,
      titulo = trim(p_dados ->> 'titulo'),
      descricao = nullif(trim(p_dados ->> 'descricao'), ''),
      responsavel_id = nullif(p_dados ->> 'responsavel_id', '')::uuid,
      prazo = nullif(p_dados ->> 'prazo', '')::date,
      status = v_status,
      percentual = v_percentual,
      custo_previsto = greatest(coalesce(nullif(p_dados ->> 'custo_previsto', '')::numeric, 0), 0),
      custo_realizado = greatest(coalesce(nullif(p_dados ->> 'custo_realizado', '')::numeric, 0), 0),
      evidencia = nullif(trim(p_dados ->> 'evidencia'), ''),
      concluido_em = case when v_status = 'concluida' then coalesce(concluido_em, now()) else null end,
      atualizado_por = v_ator
    where id = v_id;
    if not found then raise exception 'Atividade nao encontrada'; end if;
  end if;

  insert into public.acompanhamento_atividades(registro_id, pagamento_id, ator_id, tipo, resumo, detalhes)
  values (v_registro, v_pagamento, v_ator, 'planejamento_atividade',
    case when v_status = 'concluida' then 'concluiu uma atividade estrategica' else 'atualizou uma atividade estrategica' end,
    jsonb_build_object('atividade_id', v_id, 'status', v_status, 'percentual', v_percentual));
  return v_id;
end;
$$;

create or replace function public.sincronizar_atividade_pagamento_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'pago' and old.status is distinct from new.status then
    update public.acompanhamento_planejamento_atividades
    set status = 'concluida', percentual = 100, custo_realizado = greatest(new.valor_pago, new.valor_previsto),
        concluido_em = coalesce(concluido_em, now()), atualizado_por = public.meu_colaborador_id()
    where pagamento_id = new.id and status <> 'concluida';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sincronizar_atividade_pagamento on public.acompanhamento_pagamentos;
create trigger trg_sincronizar_atividade_pagamento
after update of status, valor_pago on public.acompanhamento_pagamentos
for each row execute function public.sincronizar_atividade_pagamento_v1();

-- ------------------------------------------------------------
-- VALIDACOES DE BAIXA E DOCUMENTOS
-- ------------------------------------------------------------

create or replace function public.validar_baixa_pagamento_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'pago' and new.fingerprint is null then
    if new.pago_em is null then raise exception 'Informe a data realizada para confirmar a baixa'; end if;
    if coalesce(nullif(trim(new.forma_pagamento), ''), 'Nao informado') in ('Nao informado', 'Não informado') then
      raise exception 'Informe a forma de pagamento para confirmar a baixa';
    end if;
    if nullif(trim(new.numero_documento), '') is null then raise exception 'Informe o documento ou NF para confirmar a baixa'; end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validar_baixa_pagamento on public.acompanhamento_pagamentos;
create trigger trg_validar_baixa_pagamento
before insert or update on public.acompanhamento_pagamentos
for each row execute function public.validar_baixa_pagamento_v1();

create or replace function public.bloquear_pdf_sem_conferencia_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if lower(coalesce(new.mime_type, '')) = 'application/pdf' or lower(new.nome) like '%.pdf' then
    raise exception 'PDFs devem entrar pela Caixa de Documentos e passar por conferencia';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_bloquear_pdf_sem_conferencia on public.acompanhamento_anexos;
create trigger trg_bloquear_pdf_sem_conferencia
before insert on public.acompanhamento_anexos
for each row execute function public.bloquear_pdf_sem_conferencia_v1();

-- Historico e anexos sobrevivem a exclusao controlada de uma parcela.
alter table public.acompanhamento_atividades drop constraint if exists acompanhamento_atividades_pagamento_id_fkey;
alter table public.acompanhamento_atividades add constraint acompanhamento_atividades_pagamento_id_fkey
  foreign key (pagamento_id) references public.acompanhamento_pagamentos(id) on delete set null;
alter table public.acompanhamento_anexos drop constraint if exists acompanhamento_anexos_pagamento_id_fkey;
alter table public.acompanhamento_anexos add constraint acompanhamento_anexos_pagamento_id_fkey
  foreign key (pagamento_id) references public.acompanhamento_pagamentos(id) on delete set null;

-- Atualiza também instalações existentes do SQL 06, preservando os IDs dos
-- movimentos quando a planilha é reorganizada.
create or replace function public.salvar_pagamento_acompanhamento_v1(
  p_pagamento_id uuid,
  p_registro_id uuid,
  p_dados jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_id uuid := p_pagamento_id;
  v_novo boolean := p_pagamento_id is null;
  v_status text := coalesce(nullif(p_dados ->> 'status', ''), 'previsto');
  v_valor numeric := greatest(coalesce(nullif(p_dados ->> 'valor_previsto', '')::numeric, 0), 0);
begin
  if v_ator is null then raise exception 'Colaborador nao encontrado ou inativo'; end if;
  if not exists (select 1 from public.acompanhamento_registros r where r.id = p_registro_id and r.arquivado_em is null) then
    raise exception 'Acompanhamento nao encontrado';
  end if;
  if v_status = 'pago' and nullif(trim(p_dados ->> 'fingerprint'), '') is null then
    if nullif(p_dados ->> 'pago_em', '') is null then raise exception 'Informe a data realizada para confirmar a baixa'; end if;
    if coalesce(nullif(trim(p_dados ->> 'forma_pagamento'), ''), 'Não informado') = 'Não informado' then raise exception 'Informe a forma de pagamento para confirmar a baixa'; end if;
    if nullif(trim(p_dados ->> 'numero_documento'), '') is null then raise exception 'Informe o documento ou NF para confirmar a baixa'; end if;
  end if;

  if v_id is null and nullif(trim(p_dados ->> 'fingerprint'), '') is not null then
    select ap.id into v_id from public.acompanhamento_pagamentos ap
    where ap.registro_id = p_registro_id and ap.fingerprint = nullif(trim(p_dados ->> 'fingerprint'), '')
    limit 1;
    if v_id is not null then v_novo := false; end if;
  end if;

  if v_id is null and nullif(trim(p_dados ->> 'fingerprint'), '') is not null then
    select ap.id into v_id
    from public.acompanhamento_pagamentos ap
    where ap.registro_id = p_registro_id
      and ap.fingerprint like 'pmg-%'
      and coalesce(ap.descricao, '') = coalesce(nullif(trim(p_dados ->> 'descricao'), ''), '')
      and coalesce(ap.vencimento::text, '') = coalesce(nullif(p_dados ->> 'vencimento', ''), '')
      and coalesce(ap.favorecido, '') = coalesce(nullif(trim(p_dados ->> 'favorecido'), ''), '')
    order by (ap.parcela = greatest(coalesce(nullif(p_dados ->> 'parcela', '')::integer, 1), 1)) desc, ap.atualizado_em desc
    limit 1;
    if v_id is not null then v_novo := false; end if;
  end if;

  if v_id is null then
    insert into public.acompanhamento_pagamentos (
      registro_id, parcela, descricao, valor_previsto, valor_pago, vencimento,
      pago_em, status, forma_pagamento, favorecido, numero_documento,
      observacoes, fingerprint, criado_por, atualizado_por
    ) values (
      p_registro_id,
      greatest(coalesce(nullif(p_dados ->> 'parcela', '')::integer, 1), 1),
      nullif(trim(p_dados ->> 'descricao'), ''), v_valor,
      greatest(coalesce(nullif(p_dados ->> 'valor_pago', '')::numeric, case when v_status = 'pago' then v_valor else 0 end), 0),
      nullif(p_dados ->> 'vencimento', '')::date, nullif(p_dados ->> 'pago_em', '')::date,
      v_status, nullif(trim(p_dados ->> 'forma_pagamento'), ''), nullif(trim(p_dados ->> 'favorecido'), ''),
      nullif(trim(p_dados ->> 'numero_documento'), ''), nullif(trim(p_dados ->> 'observacoes'), ''),
      nullif(trim(p_dados ->> 'fingerprint'), ''), v_ator, v_ator
    ) returning id into v_id;
  else
    update public.acompanhamento_pagamentos set
      parcela = greatest(coalesce(nullif(p_dados ->> 'parcela', '')::integer, parcela), 1),
      descricao = nullif(trim(p_dados ->> 'descricao'), ''), valor_previsto = v_valor,
      valor_pago = greatest(coalesce(nullif(p_dados ->> 'valor_pago', '')::numeric, case when v_status = 'pago' then v_valor else 0 end), 0),
      vencimento = nullif(p_dados ->> 'vencimento', '')::date, pago_em = nullif(p_dados ->> 'pago_em', '')::date,
      status = v_status, forma_pagamento = nullif(trim(p_dados ->> 'forma_pagamento'), ''),
      favorecido = nullif(trim(p_dados ->> 'favorecido'), ''), numero_documento = nullif(trim(p_dados ->> 'numero_documento'), ''),
      observacoes = nullif(trim(p_dados ->> 'observacoes'), ''),
      fingerprint = coalesce(nullif(trim(p_dados ->> 'fingerprint'), ''), fingerprint), atualizado_por = v_ator
    where id = v_id and registro_id = p_registro_id;
    if not found then raise exception 'Pagamento nao encontrado'; end if;
  end if;

  insert into public.acompanhamento_atividades(registro_id, pagamento_id, ator_id, tipo, resumo, detalhes)
  values (p_registro_id, v_id, v_ator,
    case when v_novo then 'pagamento_criado' else 'pagamento_editado' end,
    case when v_status = 'pago' then 'registrou um pagamento' else 'atualizou uma previsao de pagamento' end,
    jsonb_build_object('status', v_status, 'valor', v_valor));
  return v_id;
end;
$$;

create or replace function public.importar_acompanhamentos_v1(
  p_controle text,
  p_ano integer,
  p_nome_arquivo text,
  p_linhas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_importacao uuid;
  v_item jsonb;
  v_registro jsonb;
  v_pagamento jsonb;
  v_id uuid;
  v_existente uuid;
  v_criadas integer := 0;
  v_atualizadas integer := 0;
  v_ignoradas integer := 0;
  v_indice integer := 0;
  v_erros jsonb := '[]'::jsonb;
begin
  if v_ator is null then raise exception 'Colaborador nao encontrado ou inativo'; end if;
  if p_controle not in ('marcos', 'marketing') then raise exception 'Controle invalido'; end if;
  if jsonb_typeof(p_linhas) <> 'array' then raise exception 'Linhas de importacao invalidas'; end if;

  insert into public.acompanhamento_importacoes(controle, ano_referencia, nome_arquivo, total_linhas, criado_por)
  values (p_controle, p_ano, coalesce(nullif(trim(p_nome_arquivo), ''), 'planilha.xlsx'), jsonb_array_length(p_linhas), v_ator)
  returning id into v_importacao;

  for v_item in select value from jsonb_array_elements(p_linhas)
  loop
    v_indice := v_indice + 1;
    begin
      v_registro := coalesce(v_item -> 'registro', '{}'::jsonb)
        || jsonb_build_object(
          'controle', p_controle,
          'ano_referencia', coalesce((v_item -> 'registro' ->> 'ano_referencia')::integer, p_ano),
          'origem_importacao', p_nome_arquivo,
          'linha_origem', coalesce((v_item -> 'registro' ->> 'linha_origem')::integer, v_indice + 1)
        );

      if trim(coalesce(v_registro ->> 'titulo', '')) = '' then
        v_ignoradas := v_ignoradas + 1;
        continue;
      end if;

      select r.id into v_existente
      from public.acompanhamento_registros r
      where r.fingerprint = nullif(v_registro ->> 'fingerprint', '')
        and r.arquivado_em is null
      limit 1;

      -- Compatibilidade com as cargas anteriores, cujos fingerprints incluíam
      -- o número físico da linha. A identidade oficial passa a ser semântica:
      -- arquivo/aba + fornecedor + categoria + natureza do detalhamento.
      if v_existente is null and coalesce(v_registro -> 'dados_originais' ->> 'aba', '') <> '' then
        select r.id into v_existente
        from public.acompanhamento_registros r
        where r.arquivado_em is null
          and r.controle = p_controle
          and r.ano_referencia = coalesce((v_registro ->> 'ano_referencia')::integer, p_ano)
          and coalesce(r.dados_originais ->> 'arquivo', r.origem_importacao, '') = coalesce(v_registro -> 'dados_originais' ->> 'arquivo', p_nome_arquivo, '')
          and coalesce(r.dados_originais ->> 'aba', '') = coalesce(v_registro -> 'dados_originais' ->> 'aba', '')
          and coalesce(r.fornecedor, '') = coalesce(nullif(trim(v_registro ->> 'fornecedor'), ''), '')
          and r.categoria = coalesce(nullif(trim(v_registro ->> 'categoria'), ''), 'outro')
          and r.natureza = coalesce(nullif(trim(v_registro ->> 'natureza'), ''), 'neutro')
          and (
            (coalesce(nullif(trim(v_registro ->> 'fornecedor'), ''), '') <> '' and coalesce(nullif(trim(v_registro ->> 'categoria'), ''), 'outro') <> 'pendencia')
            or (r.titulo = trim(v_registro ->> 'titulo') and coalesce(r.descricao, '') = coalesce(nullif(trim(v_registro ->> 'descricao'), ''), ''))
          )
          and ('centro-custo' = any(coalesce(r.tags, '{}'::text[]))) = exists (
            select 1 from jsonb_array_elements_text(coalesce(v_registro -> 'tags', '[]'::jsonb)) tag where tag = 'centro-custo'
          )
          and coalesce(r.centro_custo, '') = coalesce(nullif(trim(v_registro ->> 'centro_custo'), ''), '')
        order by r.atualizado_em desc
        limit 1;
      end if;

      v_id := public.salvar_acompanhamento_v1(v_existente, v_registro);
      if v_existente is null then v_criadas := v_criadas + 1;
      else v_atualizadas := v_atualizadas + 1;
      end if;

      if jsonb_typeof(v_item -> 'pagamentos') = 'array' then
        for v_pagamento in select value from jsonb_array_elements(v_item -> 'pagamentos')
        loop
          perform public.salvar_pagamento_acompanhamento_v1(null, v_id, v_pagamento);
        end loop;

        -- Remove somente movimentos gerados por importacao que desapareceram
        -- da nova versao da mesma linha. Pagamentos manuais, sem fingerprint,
        -- permanecem preservados.
        delete from public.acompanhamento_pagamentos ap
        where ap.registro_id = v_id
          and ap.fingerprint like 'pmg-%'
          and not exists (
            select 1
            from jsonb_array_elements(v_item -> 'pagamentos') pagamento_atual
            where pagamento_atual ->> 'fingerprint' = ap.fingerprint
          );
      end if;
    exception when others then
      v_ignoradas := v_ignoradas + 1;
      v_erros := v_erros || jsonb_build_array(jsonb_build_object('linha', v_indice + 1, 'erro', sqlerrm));
    end;
  end loop;

  update public.acompanhamento_importacoes set
    linhas_criadas = v_criadas,
    linhas_atualizadas = v_atualizadas,
    linhas_ignoradas = v_ignoradas,
    erros = v_erros
  where id = v_importacao;

  return jsonb_build_object(
    'importacao_id', v_importacao,
    'criadas', v_criadas,
    'atualizadas', v_atualizadas,
    'ignoradas', v_ignoradas,
    'erros', v_erros
  );
end;
$$;

-- ------------------------------------------------------------
-- ACESSO UNIFICADO DA CENTRAL
-- ------------------------------------------------------------
drop trigger if exists trg_gestor_importacoes on public.acompanhamento_importacoes;
drop trigger if exists trg_gestor_conferencias on public.acompanhamento_conferencias;
drop trigger if exists trg_gestor_excluir_pagamento on public.acompanhamento_pagamentos;
drop trigger if exists trg_proteger_arquivamento on public.acompanhamento_registros;
drop function if exists public.exigir_gestor_acompanhamento_v1();
drop function if exists public.proteger_arquivamento_acompanhamento_v1();

-- O login ativo continua obrigatório e todas as ações preservam ator e data.
-- Dentro da Central, importação, conferência, arquivamento e manutenção
-- seguem as mesmas políticas RLS para toda a equipe autenticada.

-- ------------------------------------------------------------
-- RLS E PERMISSOES
-- ------------------------------------------------------------

alter table public.acompanhamento_planejamento_atividades enable row level security;
drop policy if exists "equipe le atividades planejamento" on public.acompanhamento_planejamento_atividades;
create policy "equipe le atividades planejamento" on public.acompanhamento_planejamento_atividades
for select to authenticated using (public.acompanhamento_colaborador_ativo());
revoke all on public.acompanhamento_planejamento_atividades from anon, authenticated;
grant select on public.acompanhamento_planejamento_atividades to authenticated;
revoke all on function public.salvar_atividade_planejamento_v1(uuid, jsonb) from public;
grant execute on function public.salvar_atividade_planejamento_v1(uuid, jsonb) to authenticated;

commit;

do $$
begin
  alter publication supabase_realtime add table public.acompanhamento_planejamento_atividades;
exception when duplicate_object then null;
end $$;

select
  count(*) as atividades,
  count(*) filter (where status = 'concluida') as concluidas,
  count(*) filter (where status <> 'concluida' and prazo < current_date) as atrasadas
from public.acompanhamento_planejamento_atividades;
