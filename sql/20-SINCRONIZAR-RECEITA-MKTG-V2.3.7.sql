-- ============================================================
-- PMG CONNECT — V2.3.7
-- MKTG 2026 como fonte oficial da receita realizada
-- ============================================================
-- Faz as linhas da Planilha de Pagamentos reconhecerem
-- automaticamente o que já consta na aba RECEITA do MKTG 2026.
-- Idempotente e seguro para reexecução.
-- ============================================================

alter table public.acompanhamento_registros
  add column if not exists pagamento_confirmado boolean not null default false;
alter table public.acompanhamento_registros
  add column if not exists pagamento_confirmado_em date;
alter table public.acompanhamento_registros
  add column if not exists pagamento_confirmado_por uuid references public.colaboradores(id) on delete set null;

create or replace function public.sincronizar_confirmacoes_mktg_2026_v1()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_atualizadas integer := 0;
begin
  -- A versão V2.3.7 nasce a partir do MKTG 2026 oficial anexado em 25/08/2026.
  -- O mesmo fingerprint é usado pelo importador; futuras reimportações atualizarão
  -- este indicador automaticamente com os novos totais da planilha.
  update public.acompanhamento_registros
  set
    valor_acordado = 3970297.69,
    dados_originais = jsonb_build_object(
      'arquivo', 'MKTG 2026.xlsx',
      'aba', 'RECEITA',
      'indicador', 'receita-realizada',
      'pagamentos_mensais', jsonb_build_array(376464.65, 528111.40, 700919.22, 672694.56, 472527.61, 583854.89, 635720.36, 1, 1, 1, 1, 1),
      'total', 3970297.69
    ),
    atualizado_em = now(),
    atualizado_por = coalesce(v_ator, atualizado_por)
  where fingerprint = 'pmg-f52c3cf5-marcos|indicador|2026|receita realizada'
    and arquivado_em is null;

  if not found then
    insert into public.acompanhamento_registros (
      controle, ano_referencia, natureza, impacta_totais, categoria, titulo, descricao,
      referencia, status, prioridade, data_inicio, data_fim, valor_acordado, tags,
      origem_importacao, fingerprint, dados_originais, criado_por, atualizado_por
    ) values (
      'marcos', 2026, 'indicador', false, 'meta_financeira', 'Receita realizada 2026 — total oficial',
      'Total realizado preservado exatamente da linha SOMA MENSAL da aba RECEITA do MKTG 2026.',
      'SOMA MENSAL', 'concluido', 'normal', date '2026-01-01', date '2026-12-31', 3970297.69,
      array['marcos','indicador','2026','receita-realizada','soma-mensal']::text[],
      'MKTG 2026.xlsx', 'pmg-f52c3cf5-marcos|indicador|2026|receita realizada',
      jsonb_build_object(
        'arquivo', 'MKTG 2026.xlsx',
        'aba', 'RECEITA',
        'indicador', 'receita-realizada',
        'pagamentos_mensais', jsonb_build_array(376464.65, 528111.40, 700919.22, 672694.56, 472527.61, 583854.89, 635720.36, 1, 1, 1, 1, 1),
        'total', 3970297.69
      ),
      v_ator, v_ator
    );
  end if;

  with fonte as (
    select
      regexp_replace(lower(trim(m.fornecedor)), '\s+', ' ', 'g') as fornecedor_key,
      m.dados_originais -> 'pagamentos_mensais' as meses
    from public.acompanhamento_registros m
    where m.arquivado_em is null
      and m.controle = 'marcos'
      and m.ano_referencia = 2026
      and m.natureza = 'receita'
      and m.fornecedor is not null
      and 'previsão' = any(m.tags)
      and 'fornecedor' = any(m.tags)
      and jsonb_typeof(m.dados_originais -> 'pagamentos_mensais') = 'array'
  ), confirmadas as (
    select distinct r.id
    from public.acompanhamento_registros r
    join fonte f
      on f.fornecedor_key = regexp_replace(lower(trim(r.fornecedor)), '\s+', ' ', 'g')
    where r.arquivado_em is null
      and r.controle = 'marketing'
      and r.ano_referencia = 2026
      and r.natureza = 'receita'
      and r.fornecedor is not null
      and 'fornecedores' = any(r.tags)
      and coalesce(
        nullif(
          f.meses ->> ((extract(month from coalesce(r.data_inicio, r.data_fim, date '2026-01-01'))::integer - 1)),
          ''
        )::numeric,
        0
      ) > 1.01
  ), atualizadas as (
    update public.acompanhamento_registros r
    set
      pagamento_confirmado = true,
      pagamento_confirmado_em = coalesce(r.pagamento_confirmado_em, current_date),
      pagamento_confirmado_por = coalesce(r.pagamento_confirmado_por, v_ator),
      atualizado_em = now(),
      atualizado_por = coalesce(v_ator, r.atualizado_por)
    where r.id in (select id from confirmadas)
      and coalesce(r.pagamento_confirmado, false) = false
    returning r.id
  )
  select count(*) into v_atualizadas from atualizadas;

  with fonte as (
    select
      regexp_replace(lower(trim(m.fornecedor)), '\s+', ' ', 'g') as fornecedor_key,
      m.dados_originais -> 'pagamentos_mensais' as meses
    from public.acompanhamento_registros m
    where m.arquivado_em is null
      and m.controle = 'marcos'
      and m.ano_referencia = 2026
      and m.natureza = 'receita'
      and m.fornecedor is not null
      and 'previsão' = any(m.tags)
      and 'fornecedor' = any(m.tags)
      and jsonb_typeof(m.dados_originais -> 'pagamentos_mensais') = 'array'
  ), confirmadas as (
    select distinct r.id
    from public.acompanhamento_registros r
    join fonte f
      on f.fornecedor_key = regexp_replace(lower(trim(r.fornecedor)), '\s+', ' ', 'g')
    where r.arquivado_em is null
      and r.controle = 'marketing'
      and r.ano_referencia = 2026
      and r.natureza = 'receita'
      and r.fornecedor is not null
      and 'fornecedores' = any(r.tags)
      and coalesce(
        nullif(
          f.meses ->> ((extract(month from coalesce(r.data_inicio, r.data_fim, date '2026-01-01'))::integer - 1)),
          ''
        )::numeric,
        0
      ) > 1.01
  )
  update public.acompanhamento_pagamentos p
  set
    status = 'pago',
    valor_pago = greatest(coalesce(p.valor_pago, 0), coalesce(p.valor_previsto, 0)),
    pago_em = coalesce(p.pago_em, p.vencimento, current_date),
    atualizado_em = now(),
    atualizado_por = coalesce(v_ator, p.atualizado_por)
  where p.registro_id in (select id from confirmadas)
    and p.status <> 'cancelado'
    and p.status <> 'pago';

  return v_atualizadas;
end;
$$;

grant execute on function public.sincronizar_confirmacoes_mktg_2026_v1() to authenticated;

-- Sincroniza imediatamente instalações que já possuem o MKTG 2026 importado.
select public.sincronizar_confirmacoes_mktg_2026_v1() as linhas_confirmadas_pela_fonte;
