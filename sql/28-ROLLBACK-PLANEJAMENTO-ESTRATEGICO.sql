-- ROLLBACK CONTROLADO | PLANEJAMENTO ESTRATÉGICO
-- ATENÇÃO: remove apenas estruturas desta entrega e APAGA os dados estratégicos nelas armazenados.
begin;
drop function if exists public.criar_demanda_estrategica_v1(uuid);
drop function if exists public.criar_projeto_estrategico_v1(uuid,text,text,date,date,text,text,numeric,jsonb,jsonb,jsonb);
drop table if exists public.estrategia_revisoes cascade;
drop table if exists public.estrategia_medicoes cascade;
drop table if exists public.estrategia_acoes cascade;
drop table if exists public.estrategia_projetos cascade;
drop table if exists public.estrategia_oportunidades cascade;
drop table if exists public.estrategia_config cascade;
drop function if exists public.estrategia_touch_v1();
commit;
