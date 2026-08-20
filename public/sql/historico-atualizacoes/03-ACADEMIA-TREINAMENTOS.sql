-- ============================================================
-- PMG CONNECT — ACADEMIA PMG V3.4.3
-- Treinamentos internos + importação do calendário oficial 2026
-- Seguro para executar sobre V3.4 / V3.4.2.
-- NÃO apaga reservas, solicitações ou treinamentos existentes.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Metadados para distinguir reserva comum de treinamento
-- ------------------------------------------------------------
alter table public.academia_reservas
  add column if not exists tipo_registro text not null default 'reserva',
  add column if not exists categoria_treinamento text,
  add column if not exists dia_inteiro boolean not null default false;

alter table public.academia_reservas
  drop constraint if exists academia_origem_valida;
alter table public.academia_reservas
  add constraint academia_origem_valida
  check (origem in ('manual', 'forms', 'treinamento', 'legado'));

alter table public.academia_reservas
  drop constraint if exists academia_tipo_registro_valido;
alter table public.academia_reservas
  add constraint academia_tipo_registro_valido
  check (tipo_registro in ('reserva', 'treinamento'));

create index if not exists idx_academia_tipo_inicio
  on public.academia_reservas(tipo_registro, inicio_em);

-- ------------------------------------------------------------
-- 2) Bloqueio real no banco para reservas e treinamentos aprovados
-- ------------------------------------------------------------
create or replace function public.validar_bloqueio_academia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'aprovada' then
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
      raise exception 'HORARIO_INDISPONIVEL: já existe uma reserva ou treinamento aprovado que conflita com este período';
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

-- ------------------------------------------------------------
-- 3) RPC: gestor cadastra/edita treinamento e já bloqueia o período
-- ------------------------------------------------------------
drop function if exists public.salvar_treinamento_academia(uuid, text, text, date, time, time, boolean, integer, text);
create function public.salvar_treinamento_academia(
  p_id uuid,
  p_titulo text,
  p_categoria text,
  p_data date,
  p_inicio time,
  p_fim time,
  p_dia_inteiro boolean,
  p_participantes integer,
  p_observacoes text
)
returns public.academia_reservas
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_gestor uuid := public.meu_colaborador_id();
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_abertura time;
  v_fechamento time;
  v_inicio_hora time;
  v_fim_hora time;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_reserva public.academia_reservas%rowtype;
begin
  if v_gestor is null then
    raise exception 'Colaborador não encontrado ou inativo';
  end if;
  if not public.sou_gestor() then
    raise exception 'Somente gestores podem cadastrar treinamentos da Academia PMG';
  end if;
  if p_data is null then raise exception 'Informe a data do treinamento'; end if;
  if p_titulo is null or length(trim(p_titulo)) = 0 then raise exception 'Informe o título do treinamento'; end if;

  select horario_abertura, horario_fechamento
    into v_abertura, v_fechamento
  from public.academia_config
  where id = 1;

  v_abertura := coalesce(v_abertura, time '08:00');
  v_fechamento := coalesce(v_fechamento, time '18:00');
  v_inicio_hora := case when coalesce(p_dia_inteiro, false) then v_abertura else p_inicio end;
  v_fim_hora := case when coalesce(p_dia_inteiro, false) then v_fechamento else p_fim end;

  if v_inicio_hora is null or v_fim_hora is null or v_fim_hora <= v_inicio_hora then
    raise exception 'Informe um período válido para o treinamento';
  end if;

  v_inicio := ((p_data + v_inicio_hora)::timestamp at time zone 'America/Sao_Paulo');
  v_fim := ((p_data + v_fim_hora)::timestamp at time zone 'America/Sao_Paulo');

  if exists (
    select 1
    from public.academia_reservas r
    where r.id <> v_id
      and r.status = 'aprovada'
      and r.inicio_em < v_fim
      and r.fim_em > v_inicio
  ) then
    raise exception 'HORARIO_INDISPONIVEL: já existe uma reserva ou treinamento aprovado neste período';
  end if;

  insert into public.academia_reservas (
    id, titulo, solicitante, setor, finalidade,
    inicio_em, fim_em, participantes, status, observacoes,
    origem, tipo_registro, categoria_treinamento, dia_inteiro,
    criado_por, aprovado_por, aprovado_em
  ) values (
    v_id,
    trim(p_titulo),
    'Academia PMG',
    'Marketing',
    'Treinamento interno da Academia PMG',
    v_inicio,
    v_fim,
    p_participantes,
    'aprovada',
    nullif(trim(coalesce(p_observacoes, '')), ''),
    'treinamento',
    'treinamento',
    nullif(trim(coalesce(p_categoria, 'PMG Geral')), ''),
    coalesce(p_dia_inteiro, false),
    v_gestor,
    v_gestor,
    now()
  )
  on conflict (id) do update set
    titulo = excluded.titulo,
    solicitante = excluded.solicitante,
    setor = excluded.setor,
    finalidade = excluded.finalidade,
    inicio_em = excluded.inicio_em,
    fim_em = excluded.fim_em,
    participantes = excluded.participantes,
    status = 'aprovada',
    observacoes = excluded.observacoes,
    origem = 'treinamento',
    tipo_registro = 'treinamento',
    categoria_treinamento = excluded.categoria_treinamento,
    dia_inteiro = excluded.dia_inteiro,
    aprovado_por = v_gestor,
    aprovado_em = now(),
    atualizado_em = now()
  returning * into v_reserva;

  return v_reserva;
end;
$$;

revoke all on function public.salvar_treinamento_academia(uuid, text, text, date, time, time, boolean, integer, text) from public, anon;
grant execute on function public.salvar_treinamento_academia(uuid, text, text, date, time, time, boolean, integer, text) to authenticated;

-- ------------------------------------------------------------
-- 4) RPC de status continua devolvendo a linha atualizada
-- ------------------------------------------------------------
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
  if v_gestor is null then raise exception 'Colaborador não encontrado ou inativo'; end if;
  if not public.sou_gestor() then raise exception 'Somente gestores podem aprovar, recusar ou cancelar reservas'; end if;
  if p_status not in ('solicitada', 'aprovada', 'recusada', 'cancelada') then raise exception 'Status de reserva inválido'; end if;

  select * into v_reserva
  from public.academia_reservas
  where id = p_id
  for update;
  if not found then raise exception 'Reserva não encontrada'; end if;

  if p_status = 'aprovada' and exists (
    select 1 from public.academia_reservas r
    where r.id <> p_id
      and r.status = 'aprovada'
      and r.inicio_em < v_reserva.fim_em
      and r.fim_em > v_reserva.inicio_em
  ) then
    raise exception 'HORARIO_INDISPONIVEL: já existe uma reserva ou treinamento aprovado que conflita com este horário';
  end if;

  update public.academia_reservas
  set status = p_status,
      aprovado_por = case when p_status = 'aprovada' then v_gestor else aprovado_por end,
      aprovado_em = case when p_status = 'aprovada' then now() else aprovado_em end,
      atualizado_em = now()
  where id = p_id
  returning * into v_reserva;

  return v_reserva;
end;
$$;

revoke all on function public.atualizar_status_reserva_academia(uuid, text) from public, anon;
grant execute on function public.atualizar_status_reserva_academia(uuid, text) to authenticated;

-- ------------------------------------------------------------
-- 5) Importação da planilha oficial "Academia PMG.xlsx"
--    Fonte visual: LARANJA = Avulso | AMARELO = MKT
--    Cada data vira treinamento aprovado de período inteiro.
--    Se já houver bloqueio aprovado conflitante, a data é preservada no
--    diagnóstico final e NÃO derruba toda a instalação.
-- ------------------------------------------------------------
do $$
declare
  v_abertura time;
  v_fechamento time;
  v_row record;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_key text;
begin
  select coalesce(horario_abertura, time '08:00'), coalesce(horario_fechamento, time '18:00')
    into v_abertura, v_fechamento
  from public.academia_config where id = 1;
  v_abertura := coalesce(v_abertura, time '08:00');
  v_fechamento := coalesce(v_fechamento, time '18:00');

  for v_row in
    select * from (values
      ('Avulso'::text, date '2026-07-02'),
      ('Avulso', date '2026-07-03'),
      ('Avulso', date '2026-07-07'),
      ('MKT',    date '2026-07-10'),
      ('Avulso', date '2026-07-16'),
      ('Avulso', date '2026-07-17'),
      ('Avulso', date '2026-07-23'),
      ('Avulso', date '2026-07-24'),
      ('Avulso', date '2026-07-30'),
      ('Avulso', date '2026-07-31'),
      ('Avulso', date '2026-08-04'),
      ('Avulso', date '2026-08-05'),
      ('MKT',    date '2026-08-07'),
      ('Avulso', date '2026-08-10'),
      ('Avulso', date '2026-08-12'),
      ('Avulso', date '2026-08-13'),
      ('Avulso', date '2026-08-14'),
      ('Avulso', date '2026-08-15'),
      ('MKT',    date '2026-08-28'),
      ('Avulso', date '2026-08-29'),
      ('MKT',    date '2026-09-25'),
      ('MKT',    date '2026-10-16'),
      ('MKT',    date '2026-11-06'),
      ('MKT',    date '2026-12-04'),
      ('MKT',    date '2026-12-11')
    ) as t(categoria, dia)
  loop
    v_inicio := ((v_row.dia + v_abertura)::timestamp at time zone 'America/Sao_Paulo');
    v_fim := ((v_row.dia + v_fechamento)::timestamp at time zone 'America/Sao_Paulo');
    v_key := 'academia-planilha-2026:' || lower(v_row.categoria) || ':' || v_row.dia::text;

    if exists (select 1 from public.academia_reservas where forms_linha_chave = v_key) then
      continue;
    end if;

    if exists (
      select 1 from public.academia_reservas r
      where r.status = 'aprovada'
        and r.inicio_em < v_fim
        and r.fim_em > v_inicio
    ) then
      raise notice 'IMPORTACAO_PULADA: % % possui outro bloqueio aprovado', v_row.categoria, v_row.dia;
      continue;
    end if;

    insert into public.academia_reservas (
      titulo, solicitante, setor, finalidade,
      inicio_em, fim_em, status, observacoes,
      origem, forms_linha_chave, forms_payload,
      tipo_registro, categoria_treinamento, dia_inteiro,
      aprovado_em
    ) values (
      'Treinamento PMG · ' || v_row.categoria,
      'Agenda oficial Academia PMG',
      'Marketing',
      'Treinamento PMG - calendário oficial 2026',
      v_inicio,
      v_fim,
      'aprovada',
      'Importado da planilha Academia PMG.xlsx. Laranja = Avulso; Amarelo = MKT.',
      'legado',
      v_key,
      jsonb_build_object('fonte','Academia PMG.xlsx','categoria',v_row.categoria,'data',v_row.dia),
      'treinamento',
      v_row.categoria,
      true,
      now()
    );
  end loop;
end
$$;

-- ------------------------------------------------------------
-- 6) Realtime + diagnóstico
-- ------------------------------------------------------------
alter table public.academia_reservas replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'academia_reservas'
     ) then
    alter publication supabase_realtime add table public.academia_reservas;
  end if;
end
$$;

select
  inicio_em at time zone 'America/Sao_Paulo' as inicio_local,
  fim_em at time zone 'America/Sao_Paulo' as fim_local,
  categoria_treinamento,
  titulo,
  status,
  origem,
  dia_inteiro
from public.academia_reservas
where tipo_registro = 'treinamento'
order by inicio_em;
