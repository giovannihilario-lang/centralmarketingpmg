-- ============================================================
-- PMG CONNECT — HOTFIX V2.5.8
-- Fechamento mensal altera somente a competência escolhida.
-- Também reativa os meses ocultados pela conciliação anual indevida
-- ocorrida em 01/09/2026.
-- ============================================================

create or replace function public.conciliar_origem_competencia_acompanhamentos_v1(
  p_controle text,
  p_ano integer,
  p_modelo text,
  p_competencia date,
  p_fingerprints text[]
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_arquivadas integer := 0;
begin
  if v_ator is null then raise exception 'Colaborador nao encontrado ou inativo'; end if;
  if p_controle not in ('marcos', 'marketing') then raise exception 'Controle invalido'; end if;
  if coalesce(trim(p_modelo), '') = '' then raise exception 'Modelo de origem invalido'; end if;
  if p_competencia is null or extract(year from p_competencia)::integer <> p_ano then
    raise exception 'Competencia invalida';
  end if;

  with arquivadas as (
    update public.acompanhamento_registros r
    set arquivado_em = now(), atualizado_por = v_ator
    where r.controle = p_controle
      and r.ano_referencia = p_ano
      and r.arquivado_em is null
      and r.dados_originais ->> 'arquivo' = p_modelo
      and date_trunc('month', r.data_inicio)::date = date_trunc('month', p_competencia)::date
      and r.fingerprint is not null
      and not (r.fingerprint = any(coalesce(p_fingerprints, '{}'::text[])))
    returning r.id
  )
  insert into public.acompanhamento_atividades(registro_id, ator_id, tipo, resumo, detalhes)
  select id, v_ator, 'arquivado', 'arquivou item ausente na nova versao da competencia',
         jsonb_build_object('modelo', p_modelo, 'competencia', p_competencia)
  from arquivadas;

  get diagnostics v_arquivadas = row_count;
  return v_arquivadas;
end;
$$;

grant execute on function public.conciliar_origem_competencia_acompanhamentos_v1(text, integer, text, date, text[]) to authenticated;

-- Reparo único do incidente: restaura registros oficiais arquivados pela
-- conciliação anual do Fechamento em 01/09/2026, sem criar duplicidades.
do $$
begin
  update public.acompanhamento_registros r
  set arquivado_em = null,
      atualizado_em = now()
  where r.arquivado_em >= timestamptz '2026-09-01 00:00:00+00'
    and r.arquivado_em <  timestamptz '2026-09-03 00:00:00+00'
    and r.ano_referencia = 2026
    and r.controle = 'marketing'
    and r.dados_originais ->> 'arquivo' = 'Fornecedores 2026.xlsx'
    and exists (
      select 1
      from public.acompanhamento_atividades a
      where a.registro_id = r.id
        and a.tipo = 'arquivado'
        and a.resumo = 'arquivou item ausente na nova versao da planilha'
        and a.criado_em >= timestamptz '2026-09-01 00:00:00+00'
        and a.criado_em <  timestamptz '2026-09-03 00:00:00+00'
    )
    and not exists (
      select 1
      from public.acompanhamento_registros ativo
      where ativo.arquivado_em is null
        and ativo.fingerprint = r.fingerprint
        and ativo.id <> r.id
    );
end;
$$;

notify pgrst, 'reload schema';
