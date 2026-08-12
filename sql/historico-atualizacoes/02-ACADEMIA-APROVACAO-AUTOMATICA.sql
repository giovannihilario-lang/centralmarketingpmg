-- ============================================================
-- PMG CONNECT — ACADEMIA PMG V3.4.2
-- Aprovação = bloqueio automático e imediato do horário.
-- Seguro para executar sobre a V3.4 existente.
-- NÃO apaga reservas nem solicitações.
-- ============================================================

-- 1) Defesa no banco: qualquer registro que se torne APROVADO passa a
--    bloquear o período. O trigger também impede aprovação sobreposta,
--    inclusive se algum cliente futuro tentar atualizar a tabela fora da RPC.
create or replace function public.validar_bloqueio_academia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'aprovada' then
    -- Serializa aprovações do mesmo dia. A Academia é um único espaço físico,
    -- então esse lock é barato e evita duas aprovações simultâneas no mesmo slot.
    perform pg_advisory_xact_lock(
      hashtextextended(
        'academia-pmg:' || (new.inicio_em at time zone 'America/Sao_Paulo')::date::text,
        0
      )
    );

    if exists (
      select 1
      from public.academia_reservas r
      where r.id <> new.id
        and r.status = 'aprovada'
        and r.inicio_em < new.fim_em
        and r.fim_em > new.inicio_em
    ) then
      raise exception 'HORARIO_INDISPONIVEL: já existe uma reserva aprovada que conflita com este período';
    end if;

    if tg_op = 'INSERT' or old.status is distinct from 'aprovada' then
      new.aprovado_em := coalesce(new.aprovado_em, now());
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validar_bloqueio_academia on public.academia_reservas;
create trigger trg_validar_bloqueio_academia
before insert or update of status, inicio_em, fim_em
on public.academia_reservas
for each row
execute function public.validar_bloqueio_academia();

-- 2) RPC usada pelo botão Aprovar / Recusar / Cancelar.
--    Agora devolve a reserva já atualizada para o frontend poder pintar o
--    calendário imediatamente, sem depender de outro ciclo de leitura.
drop function if exists public.atualizar_status_reserva_academia(uuid, text);
create function public.atualizar_status_reserva_academia(
  p_id uuid,
  p_status text
)
returns public.academia_reservas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gestor uuid := public.meu_colaborador_id();
  v_reserva public.academia_reservas%rowtype;
begin
  if v_gestor is null then
    raise exception 'Colaborador não encontrado ou inativo';
  end if;

  if not public.sou_gestor() then
    raise exception 'Somente gestores podem aprovar, recusar ou cancelar reservas';
  end if;

  if p_status not in ('solicitada', 'aprovada', 'recusada', 'cancelada') then
    raise exception 'Status de reserva inválido';
  end if;

  select *
    into v_reserva
  from public.academia_reservas
  where id = p_id
  for update;

  if not found then
    raise exception 'Reserva não encontrada';
  end if;

  if p_status = 'aprovada' then
    -- O trigger acima faz a validação final também. Esta mensagem antecipada
    -- deixa o erro mais legível no Connect.
    if exists (
      select 1
      from public.academia_reservas r
      where r.id <> p_id
        and r.status = 'aprovada'
        and r.inicio_em < v_reserva.fim_em
        and r.fim_em > v_reserva.inicio_em
    ) then
      raise exception 'HORARIO_INDISPONIVEL: já existe uma reserva aprovada que conflita com este horário';
    end if;
  end if;

  update public.academia_reservas
  set status = p_status,
      aprovado_por = case
        when p_status = 'aprovada' then v_gestor
        else aprovado_por
      end,
      aprovado_em = case
        when p_status = 'aprovada' then now()
        else aprovado_em
      end,
      atualizado_em = now()
  where id = p_id
  returning * into v_reserva;

  return v_reserva;
end;
$$;

revoke all on function public.atualizar_status_reserva_academia(uuid, text) from public, anon;
grant execute on function public.atualizar_status_reserva_academia(uuid, text) to authenticated;

-- 3) Mantém Realtime habilitado. Se já estava publicado, nada é duplicado.
alter table public.academia_reservas replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1
       from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'academia_reservas'
     ) then
    alter publication supabase_realtime add table public.academia_reservas;
  end if;
end
$$;

-- 4) Diagnóstico: veja o estado atual da Academia logo depois de executar.
select
  id,
  titulo,
  solicitante,
  status,
  inicio_em at time zone 'America/Sao_Paulo' as inicio_local,
  fim_em at time zone 'America/Sao_Paulo' as fim_local,
  aprovado_em,
  aprovado_por,
  origem
from public.academia_reservas
order by inicio_em desc
limit 50;
