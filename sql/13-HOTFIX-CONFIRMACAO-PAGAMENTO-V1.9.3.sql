-- PMG Connect — Central de Acompanhamento V1.9.3
-- Hotfix definitivo: confirmar pagamento existente OU criar+confirmar em uma única RPC.
-- Executar uma vez no SQL Editor do Supabase.

create or replace function public.confirmar_pagamento_acompanhamento_v1(
  p_pagamento_id uuid,
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
  v_pagamento_id uuid := p_pagamento_id;
  v_vencimento date;
  v_valor numeric(14,2);
  v_fingerprint text;
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

  -- Para as linhas importadas da planilha mensal, o valor oficial é o valor_acordado.
  v_valor := greatest(coalesce(v_registro.valor_acordado, 0), 0);
  v_vencimento := coalesce(v_registro.data_fim, v_registro.data_inicio, current_date);
  v_fingerprint := 'confirmacao:' || p_registro_id::text;

  -- Se o front ainda não conhece um pagamento, procura qualquer pagamento operacional
  -- já ligado a esta linha. Isto também evita duplicidade em cliques repetidos.
  if v_pagamento_id is null then
    select ap.id
      into v_pagamento_id
    from public.acompanhamento_pagamentos ap
    where ap.registro_id = p_registro_id
      and ap.status <> 'cancelado'
    order by
      case when ap.fingerprint = v_fingerprint then 0 else 1 end,
      ap.atualizado_em desc,
      ap.criado_em desc
    limit 1
    for update;
  end if;

  if v_pagamento_id is not null then
    select ap.*
      into v_pagamento
    from public.acompanhamento_pagamentos ap
    where ap.id = v_pagamento_id
      and ap.registro_id = p_registro_id
    for update;

    if not found then
      raise exception 'Pagamento nao encontrado';
    end if;

    v_confirmar := coalesce(p_confirmado, v_pagamento.status <> 'pago');

    update public.acompanhamento_pagamentos
    set
      valor_previsto = case when coalesce(valor_previsto, 0) > 0 then valor_previsto else v_valor end,
      status = case when v_confirmar then 'pago' else 'previsto' end,
      valor_pago = case
        when v_confirmar then case when coalesce(valor_previsto, 0) > 0 then valor_previsto else v_valor end
        else 0
      end,
      pago_em = case when v_confirmar then current_date else null end,
      numero_documento = coalesce(nullif(numero_documento, ''), nullif(v_registro.numero_documento, '')),
      favorecido = coalesce(nullif(favorecido, ''), nullif(v_registro.fornecedor, '')),
      atualizado_por = v_ator,
      atualizado_em = now()
    where id = v_pagamento_id
      and registro_id = p_registro_id
    returning * into v_pagamento;
  else
    v_confirmar := coalesce(p_confirmado, true);

    insert into public.acompanhamento_pagamentos (
      registro_id,
      parcela,
      descricao,
      valor_previsto,
      valor_pago,
      vencimento,
      pago_em,
      status,
      forma_pagamento,
      favorecido,
      numero_documento,
      observacoes,
      fingerprint,
      criado_por,
      atualizado_por
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
      'Pagamento criado e confirmado pela Planilha de Pagamentos.',
      v_fingerprint,
      v_ator,
      v_ator
    )
    returning * into v_pagamento;
  end if;

  insert into public.acompanhamento_atividades(
    registro_id,
    pagamento_id,
    ator_id,
    tipo,
    resumo,
    detalhes
  ) values (
    p_registro_id,
    v_pagamento.id,
    v_ator,
    'pagamento_editado',
    case when v_pagamento.status = 'pago' then 'confirmou o pagamento' else 'reabriu o pagamento' end,
    jsonb_build_object(
      'status', v_pagamento.status,
      'valor_pago', v_pagamento.valor_pago,
      'pago_em', v_pagamento.pago_em
    )
  );

  return to_jsonb(v_pagamento);
end;
$$;

revoke all on function public.confirmar_pagamento_acompanhamento_v1(uuid, uuid, boolean) from public, anon;
grant execute on function public.confirmar_pagamento_acompanhamento_v1(uuid, uuid, boolean) to authenticated;

-- Força o PostgREST/Supabase a atualizar o cache da função imediatamente.
notify pgrst, 'reload schema';

-- Diagnóstico: deve retornar 1 linha com a função e os três argumentos esperados.
select
  p.proname as funcao,
  pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'confirmar_pagamento_acompanhamento_v1';
