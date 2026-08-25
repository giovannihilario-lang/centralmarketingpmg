-- PMG Connect — Central de Acompanhamento V1.9.5
-- Hotfix estrutural: o status de confirmação passa a pertencer à própria linha.
-- Execute uma vez no SQL Editor do Supabase.

alter table public.acompanhamento_registros
  add column if not exists pagamento_confirmado boolean not null default false;

alter table public.acompanhamento_registros
  add column if not exists pagamento_confirmado_em date;

alter table public.acompanhamento_registros
  add column if not exists pagamento_confirmado_por uuid references public.colaboradores(id) on delete set null;

create index if not exists idx_acompanhamento_pagamento_confirmado
  on public.acompanhamento_registros(ano_referencia, pagamento_confirmado)
  where arquivado_em is null;

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
  v_registro public.acompanhamento_registros%rowtype;
  v_pagamento public.acompanhamento_pagamentos%rowtype;
  v_confirmar boolean;
  v_valor numeric(14,2);
  v_vencimento date;
begin
  if v_ator is null then
    raise exception 'Colaborador nao encontrado ou inativo';
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

  v_confirmar := coalesce(p_confirmado, not coalesce(v_registro.pagamento_confirmado, false));
  v_valor := greatest(coalesce(v_registro.valor_acordado, 0), 0);
  v_vencimento := coalesce(v_registro.data_fim, v_registro.data_inicio, current_date);

  -- Fonte de verdade: a própria linha do acompanhamento.
  update public.acompanhamento_registros
  set
    pagamento_confirmado = v_confirmar,
    pagamento_confirmado_em = case when v_confirmar then current_date else null end,
    pagamento_confirmado_por = case when v_confirmar then v_ator else null end,
    atualizado_por = v_ator
  where id = p_registro_id
  returning * into v_registro;

  -- Mantém a tabela de pagamentos sincronizada apenas para compatibilidade,
  -- histórico e telas legadas. Ela não decide mais o status visual da linha.
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
      valor_pago = case when v_confirmar then v_valor else 0 end,
      status = case when v_confirmar then 'pago' else 'previsto' end,
      pago_em = case when v_confirmar then current_date else null end,
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
      case when v_confirmar then v_valor else 0 end,
      v_vencimento,
      case when v_confirmar then current_date else null end,
      case when v_confirmar then 'pago' else 'previsto' end,
      null,
      nullif(v_registro.fornecedor, ''),
      nullif(v_registro.numero_documento, ''),
      'Status sincronizado com a confirmação da linha do acompanhamento.',
      'confirmacao-linha:' || p_registro_id::text,
      v_ator,
      v_ator
    )
    returning * into v_pagamento;
  end if;

  insert into public.acompanhamento_atividades(
    registro_id, pagamento_id, ator_id, tipo, resumo, detalhes
  ) values (
    p_registro_id,
    v_pagamento.id,
    v_ator,
    'pagamento_editado',
    case when v_confirmar then 'confirmou o pagamento da linha' else 'reabriu o pagamento da linha' end,
    jsonb_build_object(
      'pagamento_confirmado', v_confirmar,
      'valor', v_valor,
      'pagamento_id', v_pagamento.id
    )
  );

  return jsonb_build_object(
    'registro', jsonb_build_object(
      'id', v_registro.id,
      'pagamento_confirmado', v_registro.pagamento_confirmado,
      'pagamento_confirmado_em', v_registro.pagamento_confirmado_em,
      'pagamento_confirmado_por', v_registro.pagamento_confirmado_por
    ),
    'pagamento', to_jsonb(v_pagamento)
  );
end;
$$;

revoke all on function public.confirmar_pagamento_linha_v1(uuid, boolean) from public, anon;
grant execute on function public.confirmar_pagamento_linha_v1(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';

-- Diagnóstico rápido. Deve retornar as três colunas e a função nova.
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'acompanhamento_registros'
  and column_name in ('pagamento_confirmado', 'pagamento_confirmado_em', 'pagamento_confirmado_por')
order by column_name;

select p.proname as funcao, pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'confirmar_pagamento_linha_v1';
