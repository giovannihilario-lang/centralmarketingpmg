-- PMG Connect — Central de Acompanhamento V1.9.2
-- Hotfix: confirmação única de pagamento com persistência atômica.
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
  v_pagamento public.acompanhamento_pagamentos%rowtype;
  v_confirmar boolean;
begin
  if v_ator is null then
    raise exception 'Colaborador nao encontrado ou inativo';
  end if;

  if not exists (
    select 1
    from public.acompanhamento_registros r
    where r.id = p_registro_id
      and r.arquivado_em is null
  ) then
    raise exception 'Acompanhamento nao encontrado';
  end if;

  select ap.*
    into v_pagamento
  from public.acompanhamento_pagamentos ap
  where ap.id = p_pagamento_id
    and ap.registro_id = p_registro_id
  for update;

  if not found then
    raise exception 'Pagamento nao encontrado';
  end if;

  v_confirmar := coalesce(p_confirmado, v_pagamento.status <> 'pago');

  update public.acompanhamento_pagamentos
  set
    status = case when v_confirmar then 'pago' else 'previsto' end,
    valor_pago = case when v_confirmar then valor_previsto else 0 end,
    pago_em = case when v_confirmar then current_date else null end,
    atualizado_por = v_ator
  where id = p_pagamento_id
    and registro_id = p_registro_id
  returning * into v_pagamento;

  insert into public.acompanhamento_atividades(
    registro_id,
    pagamento_id,
    ator_id,
    tipo,
    resumo,
    detalhes
  ) values (
    p_registro_id,
    p_pagamento_id,
    v_ator,
    'pagamento_editado',
    case when v_confirmar then 'confirmou o pagamento' else 'reabriu o pagamento' end,
    jsonb_build_object(
      'status', v_pagamento.status,
      'valor_pago', v_pagamento.valor_pago,
      'pago_em', v_pagamento.pago_em
    )
  );

  return jsonb_build_object(
    'id', v_pagamento.id,
    'registro_id', v_pagamento.registro_id,
    'parcela', v_pagamento.parcela,
    'descricao', v_pagamento.descricao,
    'valor_previsto', v_pagamento.valor_previsto,
    'valor_pago', v_pagamento.valor_pago,
    'vencimento', v_pagamento.vencimento,
    'pago_em', v_pagamento.pago_em,
    'status', v_pagamento.status,
    'forma_pagamento', v_pagamento.forma_pagamento,
    'favorecido', v_pagamento.favorecido,
    'numero_documento', v_pagamento.numero_documento,
    'observacoes', v_pagamento.observacoes,
    'fingerprint', v_pagamento.fingerprint,
    'atualizado_em', v_pagamento.atualizado_em
  );
end;
$$;

revoke all on function public.confirmar_pagamento_acompanhamento_v1(uuid, uuid, boolean) from public, anon;
grant execute on function public.confirmar_pagamento_acompanhamento_v1(uuid, uuid, boolean) to authenticated;

-- Checagem simples de instalação.
select p.proname as funcao_instalada
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'confirmar_pagamento_acompanhamento_v1';
