-- ============================================================
-- PMG CONNECT — ACADEMIA PMG
-- SUBSTITUIÇÃO DA AGENDA OFICIAL 2026
--
-- ESTE SCRIPT:
-- 1) apaga SOMENTE a carga antiga importada da planilha/calendário oficial;
-- 2) NÃO apaga solicitações do Google Forms;
-- 3) NÃO apaga reservas criadas manualmente;
-- 4) NÃO apaga treinamentos futuros cadastrados pelo Connect;
-- 5) insere EXATAMENTE as datas informadas abaixo;
-- 6) usa o horário de abertura/fechamento configurado na Academia PMG;
-- 7) mantém MKT como categoria interna para o Connect exibir em AMARELO.
--
-- Se existir alguma OUTRA reserva aprovada conflitante com uma das datas,
-- o script aborta e desfaz tudo, evitando apagar/duplicar informação.
-- ============================================================

begin;

-- ------------------------------------------------------------
-- 0) Garantias mínimas da estrutura usada pela Academia
-- ------------------------------------------------------------
alter table public.academia_reservas
  add column if not exists tipo_registro text not null default 'reserva',
  add column if not exists categoria_treinamento text,
  add column if not exists dia_inteiro boolean not null default false;

-- ------------------------------------------------------------
-- 1) Apaga SOMENTE a agenda antiga importada
--
-- Abrange:
-- - carga V3.4.3 antiga: academia-planilha-2026:...
-- - eventual carga deste novo script, para ele poder ser reexecutado
--
-- Não toca em Forms, reservas manuais ou treinamentos criados no Connect.
-- ------------------------------------------------------------
delete from public.academia_reservas
where
  (
    forms_linha_chave like 'academia-planilha-2026:%'
    or forms_linha_chave like 'academia-oficial-2026:%'
  )
  and tipo_registro = 'treinamento'
  and origem in ('legado', 'treinamento');

-- ------------------------------------------------------------
-- 2) Cria uma lista temporária EXATAMENTE com os dados informados
--
-- categoria interna:
-- MKT     -> amarelo no Connect
-- Avulso  -> laranja no Connect
--
-- título exibido:
-- Reserva Marketing
-- Avulso
-- ------------------------------------------------------------
create temporary table tmp_academia_oficial_2026 (
  categoria text not null,
  titulo text not null,
  dia date not null,
  cor text not null,
  primary key (categoria, dia)
) on commit drop;

insert into tmp_academia_oficial_2026 (categoria, titulo, dia, cor)
values
  -- RESERVA MARKETING — AMARELO
  ('MKT', 'Reserva Marketing', date '2026-07-10', 'Amarelo'),
  ('MKT', 'Reserva Marketing', date '2026-08-07', 'Amarelo'),
  ('MKT', 'Reserva Marketing', date '2026-08-28', 'Amarelo'),
  ('MKT', 'Reserva Marketing', date '2026-09-25', 'Amarelo'),
  ('MKT', 'Reserva Marketing', date '2026-10-16', 'Amarelo'),
  ('MKT', 'Reserva Marketing', date '2026-11-06', 'Amarelo'),
  ('MKT', 'Reserva Marketing', date '2026-12-04', 'Amarelo'),
  ('MKT', 'Reserva Marketing', date '2026-12-11', 'Amarelo'),

  -- AVULSO — LARANJA
  ('Avulso', 'Avulso', date '2026-07-02', 'Laranja'),
  ('Avulso', 'Avulso', date '2026-07-03', 'Laranja'),
  ('Avulso', 'Avulso', date '2026-07-07', 'Laranja'),
  ('Avulso', 'Avulso', date '2026-07-16', 'Laranja'),
  ('Avulso', 'Avulso', date '2026-07-17', 'Laranja'),
  ('Avulso', 'Avulso', date '2026-07-23', 'Laranja'),
  ('Avulso', 'Avulso', date '2026-07-24', 'Laranja'),
  ('Avulso', 'Avulso', date '2026-07-30', 'Laranja'),
  ('Avulso', 'Avulso', date '2026-07-31', 'Laranja'),
  ('Avulso', 'Avulso', date '2026-08-04', 'Laranja'),
  ('Avulso', 'Avulso', date '2026-08-05', 'Laranja'),
  ('Avulso', 'Avulso', date '2026-08-10', 'Laranja'),
  ('Avulso', 'Avulso', date '2026-08-12', 'Laranja'),
  ('Avulso', 'Avulso', date '2026-08-13', 'Laranja'),
  ('Avulso', 'Avulso', date '2026-08-14', 'Laranja'),
  ('Avulso', 'Avulso', date '2026-08-15', 'Laranja'),
  ('Avulso', 'Avulso', date '2026-08-29', 'Laranja');

-- ------------------------------------------------------------
-- 3) Valida conflitos ANTES de inserir
--
-- Caso exista outro evento/reserva APROVADO no mesmo período,
-- levanta erro e o "begin" faz a operação inteira ser desfeita.
-- Assim não ficamos com agenda pela metade.
-- ------------------------------------------------------------
do $$
declare
  v_abertura time;
  v_fechamento time;
  v_conflitos text;
begin
  select
    coalesce(horario_abertura, time '08:00'),
    coalesce(horario_fechamento, time '18:00')
  into v_abertura, v_fechamento
  from public.academia_config
  where id = 1;

  v_abertura := coalesce(v_abertura, time '08:00');
  v_fechamento := coalesce(v_fechamento, time '18:00');

  select string_agg(
    to_char(t.dia, 'DD/MM/YYYY') || ' (' || t.titulo || ')' ||
    ' conflita com "' || r.titulo || '"',
    E'\n'
    order by t.dia
  )
  into v_conflitos
  from tmp_academia_oficial_2026 t
  join public.academia_reservas r
    on r.status = 'aprovada'
   and r.inicio_em <
       ((t.dia + v_fechamento)::timestamp at time zone 'America/Sao_Paulo')
   and r.fim_em >
       ((t.dia + v_abertura)::timestamp at time zone 'America/Sao_Paulo');

  if v_conflitos is not null then
    raise exception E'CONFLITO NA ACADEMIA PMG.\nNenhum dado foi substituído.\n\n%', v_conflitos;
  end if;
end
$$;

-- ------------------------------------------------------------
-- 4) Insere a nova agenda oficial
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
  select
    coalesce(horario_abertura, time '08:00'),
    coalesce(horario_fechamento, time '18:00')
  into v_abertura, v_fechamento
  from public.academia_config
  where id = 1;

  v_abertura := coalesce(v_abertura, time '08:00');
  v_fechamento := coalesce(v_fechamento, time '18:00');

  for v_row in
    select *
    from tmp_academia_oficial_2026
    order by dia, categoria
  loop
    v_inicio :=
      ((v_row.dia + v_abertura)::timestamp at time zone 'America/Sao_Paulo');

    v_fim :=
      ((v_row.dia + v_fechamento)::timestamp at time zone 'America/Sao_Paulo');

    v_key :=
      'academia-oficial-2026:' ||
      case when v_row.categoria = 'MKT' then 'marketing' else 'avulso' end ||
      ':' || v_row.dia::text;

    insert into public.academia_reservas (
      titulo,
      solicitante,
      setor,
      finalidade,
      inicio_em,
      fim_em,
      status,
      observacoes,
      origem,
      forms_linha_chave,
      forms_payload,
      tipo_registro,
      categoria_treinamento,
      dia_inteiro,
      aprovado_em
    )
    values (
      v_row.titulo,
      'Agenda oficial Academia PMG',
      'Marketing',
      case
        when v_row.categoria = 'MKT'
          then 'Reserva Marketing - calendário oficial 2026'
        else 'Avulso - calendário oficial 2026'
      end,
      v_inicio,
      v_fim,
      'aprovada',
      'Agenda oficial 2026. ' ||
      case
        when v_row.categoria = 'MKT' then 'Amarelo = Reserva Marketing.'
        else 'Laranja = Avulso.'
      end,
      'legado',
      v_key,
      jsonb_build_object(
        'fonte', 'Agenda oficial Academia PMG 2026',
        'categoria', v_row.categoria,
        'titulo', v_row.titulo,
        'cor', v_row.cor,
        'data', v_row.dia
      ),
      'treinamento',
      v_row.categoria,
      true,
      now()
    );
  end loop;
end
$$;

commit;

-- ============================================================
-- 5) CONFERÊNCIA FINAL
-- Deve retornar exatamente 25 linhas:
-- 8 Reserva Marketing + 17 Avulso
-- ============================================================
select
  case
    when categoria_treinamento = 'MKT' then 'Reserva Marketing'
    else categoria_treinamento
  end as tipo,
  to_char(
    inicio_em at time zone 'America/Sao_Paulo',
    'DD/MM/YYYY'
  ) as data,
  case
    when categoria_treinamento = 'MKT' then 'Amarelo'
    when categoria_treinamento = 'Avulso' then 'Laranja'
    else null
  end as cor,
  status,
  dia_inteiro
from public.academia_reservas
where forms_linha_chave like 'academia-oficial-2026:%'
order by inicio_em, categoria_treinamento;

-- Conferência numérica:
select
  count(*) as total,
  count(*) filter (where categoria_treinamento = 'MKT') as reserva_marketing,
  count(*) filter (where categoria_treinamento = 'Avulso') as avulso
from public.academia_reservas
where forms_linha_chave like 'academia-oficial-2026:%';

-- Resultado esperado:
-- total = 25
-- reserva_marketing = 8
-- avulso = 17
