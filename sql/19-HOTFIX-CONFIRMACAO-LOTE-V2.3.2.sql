-- PMG Connect — Central de Acompanhamento V2.3.2
-- Confirmação rápida em lote: uma chamada de rede para várias linhas.
-- Execute uma vez no SQL Editor do Supabase para obter o melhor desempenho.

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

  if coalesce(cardinality(p_registro_ids), 0) = 0 then
    return jsonb_build_object('total', 0, 'ids', '[]'::jsonb, 'confirmado', p_confirmado);
  end if;

  if cardinality(p_registro_ids) > 500 then
    raise exception 'Limite de 500 linhas por confirmação em lote';
  end if;

  foreach v_id in array p_registro_ids loop
    -- Reutiliza a regra oficial da confirmação individual.
    perform public.confirmar_pagamento_linha_v1(v_id, p_confirmado);
    v_total := v_total + 1;
    v_ids := array_append(v_ids, v_id);
  end loop;

  return jsonb_build_object(
    'total', v_total,
    'ids', to_jsonb(v_ids),
    'confirmado', p_confirmado
  );
end;
$$;

revoke all on function public.confirmar_pagamentos_lote_v1(uuid[], boolean) from public, anon;
grant execute on function public.confirmar_pagamentos_lote_v1(uuid[], boolean) to authenticated;

notify pgrst, 'reload schema';

select p.proname as funcao, pg_get_function_identity_arguments(p.oid) as argumentos
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'confirmar_pagamentos_lote_v1';
