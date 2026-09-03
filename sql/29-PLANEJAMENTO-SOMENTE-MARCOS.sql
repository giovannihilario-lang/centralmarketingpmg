begin;

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

  if v_is_planning and v_email <> 'marcos@pmg.com.br' then
    raise exception 'Somente marcos@pmg.com.br pode alterar o Planejamento PMG.'
      using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

drop trigger if exists trg_planejamento_somente_marcos_registros on public.acompanhamento_registros;
create trigger trg_planejamento_somente_marcos_registros
before insert or update or delete on public.acompanhamento_registros
for each row execute function public.bloquear_edicao_planejamento_nao_marcos();

drop trigger if exists trg_planejamento_somente_marcos_pagamentos on public.acompanhamento_pagamentos;
create trigger trg_planejamento_somente_marcos_pagamentos
before insert or update or delete on public.acompanhamento_pagamentos
for each row execute function public.bloquear_edicao_planejamento_nao_marcos();

revoke all on function public.bloquear_edicao_planejamento_nao_marcos() from public, anon;
grant execute on function public.bloquear_edicao_planejamento_nao_marcos() to authenticated, service_role;

commit;
