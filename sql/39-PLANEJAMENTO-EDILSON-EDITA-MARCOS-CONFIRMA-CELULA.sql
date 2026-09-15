begin;

-- PMG Connect — Planejamento PMG passa a aceitar edição de Marcos E Edilson.
-- Antes (sql/29), só marcos@pmg.com.br podia mexer em qualquer linha
-- marcada como planejamento — Edilson (marketing@pmg.com.br) ficava
-- travado o tempo todo, mesmo sem nada confirmado ainda.
--
-- Agora: os dois editam livremente enquanto a célula (uma frente, em um
-- mês específico — uma linha de acompanhamento_pagamentos) não tiver sido
-- confirmada. Quando Marcos confirma, só aquela célula trava — as outras
-- 11 do mesmo mês/frente continuam editáveis por ambos. Mesmo espírito do
-- fluxo de confirmação da Planilha de Acompanhamentos (sql/30), mas o
-- travamento é por célula, não pelo registro inteiro — o Planejamento tem
-- 12 meses por frente e cada mês precisa poder ser confirmado sozinho.

alter table public.acompanhamento_pagamentos
  add column if not exists confirmado_marcos boolean not null default false,
  add column if not exists confirmado_em timestamptz,
  add column if not exists confirmado_por uuid references public.colaboradores(id) on delete set null;

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
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- confirmar_celula_planejamento_v1: única forma de travar uma célula do
-- Planejamento. Espelha confirmar_pagamento_linha_v1 (sql/30), mas atua
-- sobre uma linha de acompanhamento_pagamentos específica (a célula =
-- frente + mês), não sobre o registro inteiro.
create or replace function public.confirmar_celula_planejamento_v1(
  p_pagamento_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_email text := public.pmg_email_usuario_atual();
  v_pagamento public.acompanhamento_pagamentos%rowtype;
  v_registro public.acompanhamento_registros%rowtype;
  v_is_planning boolean;
begin
  if v_ator is null then
    raise exception 'Colaborador nao encontrado ou inativo';
  end if;

  if v_email <> 'marcos@pmg.com.br' then
    raise exception 'Somente marcos@pmg.com.br pode confirmar o Planejamento PMG.'
      using errcode = '42501';
  end if;

  select p.* into v_pagamento
  from public.acompanhamento_pagamentos p
  where p.id = p_pagamento_id
  for update;

  if not found then
    raise exception 'Célula do Planejamento não encontrada';
  end if;

  select r.* into v_registro
  from public.acompanhamento_registros r
  where r.id = v_pagamento.registro_id
    and r.arquivada_em is null;

  if not found then
    raise exception 'O registro desta célula não está mais disponível';
  end if;

  v_is_planning := coalesce(v_registro.tags, '{}'::text[]) @> array['planejamento']::text[]
                    or lower(coalesce(v_registro.referencia, '')) = 'planejamento';

  if not v_is_planning then
    raise exception 'Esta célula não pertence ao Planejamento PMG.'
      using errcode = '42501';
  end if;

  -- Idempotente: se já confirmada, só devolve o estado atual.
  if coalesce(v_pagamento.confirmado_marcos, false) then
    return jsonb_build_object(
      'id', v_pagamento.id,
      'confirmado_marcos', true,
      'confirmado_em', v_pagamento.confirmado_em,
      'confirmado_por', v_pagamento.confirmado_por
    );
  end if;

  perform set_config('pmg.confirmacao_planejamento', '1', true);

  update public.acompanhamento_pagamentos
  set
    confirmado_marcos = true,
    confirmado_em = now(),
    confirmado_por = v_ator,
    atualizado_por = v_ator
  where id = p_pagamento_id
  returning * into v_pagamento;

  insert into public.acompanhamento_atividades(
    registro_id, pagamento_id, ator_id, tipo, resumo, detalhes
  ) values (
    v_pagamento.registro_id,
    v_pagamento.id,
    v_ator,
    'pagamento_editado',
    'confirmou e travou uma célula do Planejamento PMG',
    jsonb_build_object('confirmado_marcos', true, 'pagamento_id', v_pagamento.id)
  );

  return jsonb_build_object(
    'id', v_pagamento.id,
    'confirmado_marcos', true,
    'confirmado_em', v_pagamento.confirmado_em,
    'confirmado_por', v_pagamento.confirmado_por
  );
end;
$$;

revoke all on function public.confirmar_celula_planejamento_v1(uuid) from public, anon;
grant execute on function public.confirmar_celula_planejamento_v1(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;

-- Verificação rápida: coluna nova + RPC nova devem existir.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'acompanhamento_pagamentos'
  and column_name in ('confirmado_marcos', 'confirmado_em', 'confirmado_por')
order by column_name;

select p.proname as funcao
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'confirmar_celula_planejamento_v1';
