begin;

-- PMG Connect — Refinamento do sql/39: Edilson (marketing@pmg.com.br)
-- continua editando valores do Planejamento PMG, mas só nas células que
-- estão em aberto. Marcar uma célula como paga (ou reabri-la) e mexer em
-- qualquer célula já paga passa a ser exclusivo de marcos@pmg.com.br —
-- igual ao que já vale para a Planilha de Acompanhamentos.

create or replace function public.bloquear_edicao_planejamento_nao_marcos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_tags text[];
  v_referencia text;
  v_registro_id uuid;
  v_is_planning boolean := false;
  v_confirm_flow boolean := coalesce(current_setting('pmg.confirmacao_planejamento', true), '') = '1';
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_email := lower(coalesce(auth.jwt() ->> 'email', ''));

  if tg_table_name = 'acompanhamento_registros' then
    if tg_op = 'DELETE' then
      v_tags := old.tags; v_referencia := old.referencia;
    else
      v_tags := new.tags; v_referencia := new.referencia;
    end if;
  elsif tg_table_name = 'acompanhamento_pagamentos' then
    v_registro_id := case when tg_op = 'DELETE' then old.registro_id else new.registro_id end;
    select r.tags, r.referencia into v_tags, v_referencia
    from public.acompanhamento_registros r where r.id = v_registro_id;
  end if;

  v_is_planning := coalesce(v_tags, '{}'::text[]) @> array['planejamento']::text[]
                   or lower(coalesce(v_referencia, '')) = 'planejamento';

  if not v_is_planning then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if v_email not in ('marcos@pmg.com.br', 'marketing@pmg.com.br') then
    raise exception 'Somente Marcos e Edilson podem alterar o Planejamento PMG.'
      using errcode = '42501';
  end if;

  if tg_table_name = 'acompanhamento_pagamentos' then
    -- Célula confirmada por Marcos fica travada pra sempre pela aplicação,
    -- exceto dentro da própria RPC de confirmação (via flag de sessão).
    if tg_op <> 'INSERT' and coalesce(old.confirmado_marcos, false) and not v_confirm_flow then
      raise exception 'Esta célula já foi confirmada por Marcos e está travada.'
        using errcode = '42501';
    end if;

    -- confirmado_marcos só pode virar true dentro da RPC oficial.
    if tg_op = 'INSERT' then
      if coalesce(new.confirmado_marcos, false) and not v_confirm_flow then
        raise exception 'A confirmação deve ser feita pelo fluxo oficial de Marcos.'
          using errcode = '42501';
      end if;
    elsif tg_op = 'UPDATE' then
      if coalesce(old.confirmado_marcos, false) is distinct from coalesce(new.confirmado_marcos, false)
         and not v_confirm_flow then
        raise exception 'A confirmação deve ser feita exclusivamente pela RPC de Marcos.'
          using errcode = '42501';
      end if;
    end if;

    -- Só Marcos marca como pago (ou reabre), e só Marcos mexe numa célula
    -- que já está paga (mudar valor, forma de pagamento etc).
    if v_email <> 'marcos@pmg.com.br' then
      if coalesce(new.status, '') = 'pago'
         and (tg_op = 'INSERT' or coalesce(old.status, '') is distinct from 'pago') then
        raise exception 'Somente marcos@pmg.com.br pode marcar uma célula do Planejamento como paga.'
          using errcode = '42501';
      end if;

      if tg_op <> 'INSERT' and coalesce(old.status, '') = 'pago' then
        raise exception 'Somente marcos@pmg.com.br pode alterar uma célula do Planejamento já paga.'
          using errcode = '42501';
      end if;
    end if;
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- Verificação rápida: a função deve mencionar a nova checagem de status pago.
select prosrc ilike '%Somente marcos@pmg.com.br pode marcar%' as tem_regra_pago
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname = 'bloquear_edicao_planejamento_nao_marcos';
