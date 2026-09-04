begin;

-- PMG Connect — Permissões da Planilha de Acompanhamentos
-- Regras:
--   • Marcos (marcos@pmg.com.br): edita pendentes e é o único que confirma.
--   • Edilson (marketing@pmg.com.br): edita pendentes, mas não confirma.
--   • Após confirmação, registro + pagamento ficam imutáveis pela aplicação.
--   • Planejamento continua regido pelo SQL 29 (somente Marcos).

create or replace function public.pmg_email_usuario_atual()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select lower(coalesce(auth.jwt() ->> 'email', ''));
$$;

create or replace function public.pmg_registro_e_planilha_acompanhamento(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select
      coalesce(r.controle, '') = 'marketing'
      and coalesce(r.natureza, '') = 'receita'
      and (
        coalesce(r.categoria, '') = 'pendencia'
        or coalesce(r.tags, '{}'::text[]) @> array['fornecedores']::text[]
      )
      and not (
        coalesce(r.tags, '{}'::text[]) @> array['planejamento']::text[]
        or lower(coalesce(r.referencia, '')) = 'planejamento'
      )
    from public.acompanhamento_registros r
    where r.id = p_id
  ), false);
$$;

create or replace function public.pmg_bloquear_registro_acompanhamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.pmg_email_usuario_atual();
  v_old_target boolean := false;
  v_new_target boolean := false;
  v_confirm_flow boolean := coalesce(current_setting('pmg.confirmacao_pagamento', true), '') = '1';
begin
  -- SQL Editor / operações administrativas sem sessão de usuário continuam possíveis.
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if tg_op <> 'INSERT' then
    v_old_target :=
      coalesce(old.controle, '') = 'marketing'
      and coalesce(old.natureza, '') = 'receita'
      and (coalesce(old.categoria, '') = 'pendencia' or coalesce(old.tags, '{}'::text[]) @> array['fornecedores']::text[])
      and not (coalesce(old.tags, '{}'::text[]) @> array['planejamento']::text[] or lower(coalesce(old.referencia, '')) = 'planejamento');
  end if;

  if tg_op <> 'DELETE' then
    v_new_target :=
      coalesce(new.controle, '') = 'marketing'
      and coalesce(new.natureza, '') = 'receita'
      and (coalesce(new.categoria, '') = 'pendencia' or coalesce(new.tags, '{}'::text[]) @> array['fornecedores']::text[])
      and not (coalesce(new.tags, '{}'::text[]) @> array['planejamento']::text[] or lower(coalesce(new.referencia, '')) = 'planejamento');
  end if;

  if not (v_old_target or v_new_target) then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if v_email not in ('marcos@pmg.com.br', 'marketing@pmg.com.br') then
    raise exception 'Somente Marcos e Edilson podem alterar a Planilha de Acompanhamentos.'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if coalesce(new.pagamento_confirmado, false) and not v_confirm_flow then
      raise exception 'A confirmação deve ser feita pelo fluxo oficial do Marcos.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- Linha confirmada vira registro fechado. Nem Marcos reabre/edita pela aplicação.
  if coalesce(old.pagamento_confirmado, false) and not v_confirm_flow then
    raise exception 'Este lançamento já foi confirmado por Marcos e está bloqueado.'
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  -- A coluna de confirmação só pode mudar dentro da RPC oficial.
  if coalesce(old.pagamento_confirmado, false) is distinct from coalesce(new.pagamento_confirmado, false)
     and not v_confirm_flow then
    raise exception 'A confirmação deve ser feita exclusivamente pelo Marcos.'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.pmg_bloquear_pagamento_acompanhamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := public.pmg_email_usuario_atual();
  v_registro_id uuid;
  v_confirmado boolean := false;
  v_target boolean := false;
  v_confirm_flow boolean := coalesce(current_setting('pmg.confirmacao_pagamento', true), '') = '1';
begin
  if auth.uid() is null then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_registro_id := case when tg_op = 'DELETE' then old.registro_id else new.registro_id end;
  v_target := public.pmg_registro_e_planilha_acompanhamento(v_registro_id);

  if not v_target then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  if v_email not in ('marcos@pmg.com.br', 'marketing@pmg.com.br') then
    raise exception 'Somente Marcos e Edilson podem alterar a Planilha de Acompanhamentos.'
      using errcode = '42501';
  end if;

  select coalesce(r.pagamento_confirmado, false)
    into v_confirmado
  from public.acompanhamento_registros r
  where r.id = v_registro_id;

  if v_confirmado and not v_confirm_flow then
    raise exception 'Este lançamento já foi confirmado por Marcos e está bloqueado.'
      using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

-- Substitui a confirmação individual mantendo compatibilidade com o frontend atual.
create or replace function public.confirmar_pagamento_linha_v1(
  p_registro_id uuid,
  p_confirmado boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ator uuid := public.meu_colaborador_id();
  v_email text := public.pmg_email_usuario_atual();
  v_registro public.acompanhamento_registros%rowtype;
  v_pagamento public.acompanhamento_pagamentos%rowtype;
  v_valor numeric(14,2);
  v_vencimento date;
begin
  if v_ator is null then
    raise exception 'Colaborador nao encontrado ou inativo';
  end if;

  if v_email <> 'marcos@pmg.com.br' then
    raise exception 'Somente marcos@pmg.com.br pode confirmar pagamentos.'
      using errcode = '42501';
  end if;

  if p_confirmado is false then
    raise exception 'Pagamentos confirmados nao podem ser reabertos.'
      using errcode = '42501';
  end if;

  select r.*
    into v_registro
  from public.acompanhamento_registros r
  where r.id = p_registro_id
    and r.arquivado_em is null
  for update;

  if not found then
    raise exception 'Acompanhamento nao encontrado';
  end if;

  if not public.pmg_registro_e_planilha_acompanhamento(p_registro_id) then
    raise exception 'Este registro nao pertence a Planilha de Acompanhamentos.'
      using errcode = '42501';
  end if;

  -- Confirmação é idempotente. Se já está confirmada, apenas devolve o estado atual.
  if coalesce(v_registro.pagamento_confirmado, false) then
    select ap.* into v_pagamento
    from public.acompanhamento_pagamentos ap
    where ap.registro_id = p_registro_id and ap.status <> 'cancelado'
    order by ap.atualizado_em desc, ap.criado_em desc
    limit 1;

    return jsonb_build_object(
      'registro', jsonb_build_object(
        'id', v_registro.id,
        'pagamento_confirmado', true,
        'pagamento_confirmado_em', v_registro.pagamento_confirmado_em,
        'pagamento_confirmado_por', v_registro.pagamento_confirmado_por
      ),
      'pagamento', case when v_pagamento.id is null then null else to_jsonb(v_pagamento) end,
      'bloqueado', true
    );
  end if;

  v_valor := greatest(coalesce(v_registro.valor_acordado, 0), 0);
  v_vencimento := coalesce(v_registro.data_fim, v_registro.data_inicio, current_date);

  -- Flag local da transação. Os triggers só deixam a confirmação alterar a linha
  -- e o pagamento enquanto esta RPC oficial estiver executando.
  perform set_config('pmg.confirmacao_pagamento', '1', true);

  update public.acompanhamento_registros
  set
    pagamento_confirmado = true,
    pagamento_confirmado_em = current_date,
    pagamento_confirmado_por = v_ator,
    atualizado_por = v_ator
  where id = p_registro_id
  returning * into v_registro;

  select ap.*
    into v_pagamento
  from public.acompanhamento_pagamentos ap
  where ap.registro_id = p_registro_id
    and ap.status <> 'cancelado'
  order by
    case when ap.vencimento between date_trunc('month', v_vencimento)::date
      and (date_trunc('month', v_vencimento) + interval '1 month - 1 day')::date then 0 else 1 end,
    ap.atualizado_em desc,
    ap.criado_em desc
  limit 1
  for update;

  if found then
    update public.acompanhamento_pagamentos
    set
      valor_previsto = case when coalesce(valor_previsto, 0) > 0 then valor_previsto else v_valor end,
      valor_pago = v_valor,
      status = 'pago',
      pago_em = current_date,
      numero_documento = coalesce(nullif(numero_documento, ''), nullif(v_registro.numero_documento, '')),
      favorecido = coalesce(nullif(favorecido, ''), nullif(v_registro.fornecedor, '')),
      atualizado_por = v_ator
    where id = v_pagamento.id
    returning * into v_pagamento;
  else
    insert into public.acompanhamento_pagamentos (
      registro_id, parcela, descricao, valor_previsto, valor_pago,
      vencimento, pago_em, status, forma_pagamento, favorecido,
      numero_documento, observacoes, fingerprint, criado_por, atualizado_por
    ) values (
      p_registro_id,
      1,
      coalesce(nullif(v_registro.referencia, ''), nullif(v_registro.titulo, ''), 'Pagamento') || ' — confirmação',
      v_valor,
      v_valor,
      v_vencimento,
      current_date,
      'pago',
      null,
      nullif(v_registro.fornecedor, ''),
      nullif(v_registro.numero_documento, ''),
      'Status sincronizado com a confirmação definitiva do Marcos.',
      'confirmacao-linha:' || p_registro_id::text,
      v_ator,
      v_ator
    ) returning * into v_pagamento;
  end if;

  insert into public.acompanhamento_atividades(
    registro_id, pagamento_id, ator_id, tipo, resumo, detalhes
  ) values (
    p_registro_id,
    v_pagamento.id,
    v_ator,
    'pagamento_editado',
    'confirmou definitivamente o pagamento da linha',
    jsonb_build_object(
      'pagamento_confirmado', true,
      'bloqueado', true,
      'valor', v_valor,
      'pagamento_id', v_pagamento.id,
      'confirmado_por_email', v_email
    )
  );

  return jsonb_build_object(
    'registro', jsonb_build_object(
      'id', v_registro.id,
      'pagamento_confirmado', true,
      'pagamento_confirmado_em', v_registro.pagamento_confirmado_em,
      'pagamento_confirmado_por', v_registro.pagamento_confirmado_por
    ),
    'pagamento', to_jsonb(v_pagamento),
    'bloqueado', true
  );
end;
$$;

create or replace function public.confirmar_pagamentos_lote_v1(
  p_registro_ids uuid[],
  p_confirmado boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_total integer := 0;
  v_ids uuid[] := '{}'::uuid[];
begin
  if public.meu_colaborador_id() is null then
    raise exception 'Colaborador nao encontrado ou inativo';
  end if;

  if public.pmg_email_usuario_atual() <> 'marcos@pmg.com.br' then
    raise exception 'Somente marcos@pmg.com.br pode confirmar pagamentos.'
      using errcode = '42501';
  end if;

  if p_confirmado is not true then
    raise exception 'Pagamentos confirmados nao podem ser reabertos.'
      using errcode = '42501';
  end if;

  if coalesce(cardinality(p_registro_ids), 0) = 0 then
    return jsonb_build_object('total', 0, 'ids', '[]'::jsonb, 'confirmado', true);
  end if;

  if cardinality(p_registro_ids) > 500 then
    raise exception 'Limite de 500 linhas por confirmação em lote';
  end if;

  foreach v_id in array p_registro_ids loop
    perform public.confirmar_pagamento_linha_v1(v_id, true);
    v_total := v_total + 1;
    v_ids := array_append(v_ids, v_id);
  end loop;

  return jsonb_build_object('total', v_total, 'ids', to_jsonb(v_ids), 'confirmado', true);
end;
$$;

-- Triggers entram depois de redefinir as RPCs para que a confirmação oficial
-- consiga atravessar o bloqueio apenas durante a própria transação.
drop trigger if exists trg_acompanhamento_permissoes_registros on public.acompanhamento_registros;
create trigger trg_acompanhamento_permissoes_registros
before insert or update or delete on public.acompanhamento_registros
for each row execute function public.pmg_bloquear_registro_acompanhamento();

drop trigger if exists trg_acompanhamento_permissoes_pagamentos on public.acompanhamento_pagamentos;
create trigger trg_acompanhamento_permissoes_pagamentos
before insert or update or delete on public.acompanhamento_pagamentos
for each row execute function public.pmg_bloquear_pagamento_acompanhamento();

revoke all on function public.pmg_email_usuario_atual() from public, anon;
revoke all on function public.pmg_registro_e_planilha_acompanhamento(uuid) from public, anon;
revoke all on function public.pmg_bloquear_registro_acompanhamento() from public, anon;
revoke all on function public.pmg_bloquear_pagamento_acompanhamento() from public, anon;
revoke all on function public.confirmar_pagamento_linha_v1(uuid, boolean) from public, anon;
revoke all on function public.confirmar_pagamentos_lote_v1(uuid[], boolean) from public, anon;

grant execute on function public.pmg_email_usuario_atual() to authenticated, service_role;
grant execute on function public.pmg_registro_e_planilha_acompanhamento(uuid) to authenticated, service_role;
grant execute on function public.pmg_bloquear_registro_acompanhamento() to authenticated, service_role;
grant execute on function public.pmg_bloquear_pagamento_acompanhamento() to authenticated, service_role;
grant execute on function public.confirmar_pagamento_linha_v1(uuid, boolean) to authenticated;
grant execute on function public.confirmar_pagamentos_lote_v1(uuid[], boolean) to authenticated;

notify pgrst, 'reload schema';

commit;

-- Verificação rápida: deve listar os dois triggers e as duas RPCs de confirmação.
select event_object_table as tabela, trigger_name
from information_schema.triggers
where trigger_schema = 'public'
  and trigger_name in ('trg_acompanhamento_permissoes_registros','trg_acompanhamento_permissoes_pagamentos')
order by trigger_name;

select p.proname as funcao, pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('confirmar_pagamento_linha_v1','confirmar_pagamentos_lote_v1')
order by p.proname;
