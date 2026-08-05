-- ============================================================
-- PMG CONNECT — DISPARO PUSH A CADA 5 MINUTOS
-- ============================================================
-- Rode somente depois de:
-- 1) publicar o projeto na Vercel;
-- 2) configurar CRON_SECRET na Vercel;
-- 3) substituir os dois valores abaixo.
--
-- O lembrete é gerado no banco pelo pg_cron. Este segundo job chama
-- a função da Vercel para entregar a notificação ao Windows mesmo
-- quando ninguém está com a página aberta.
-- ============================================================

create extension if not exists pg_net with schema extensions;

do $$
declare
  v_url text := 'https://SEU-DOMINIO.vercel.app/api/notificar-demandas';
  v_secret text := 'COLE-AQUI-O-MESMO-CRON_SECRET-DA-VERCEL';
  v_id uuid;
  v_jobid bigint;
begin
  if v_url like '%SEU-DOMINIO%' or v_secret like '%COLE-AQUI%' then
    raise exception 'Substitua v_url e v_secret antes de executar este arquivo';
  end if;

  select id into v_id
  from vault.decrypted_secrets
  where name = 'pmg_demandas_push_url'
  limit 1;

  if v_id is null then
    perform vault.create_secret(v_url, 'pmg_demandas_push_url', 'Endpoint Vercel do Push Demandas');
  else
    perform vault.update_secret(v_id, v_url, 'pmg_demandas_push_url', 'Endpoint Vercel do Push Demandas');
  end if;

  select id into v_id
  from vault.decrypted_secrets
  where name = 'pmg_demandas_push_secret'
  limit 1;

  if v_id is null then
    perform vault.create_secret(v_secret, 'pmg_demandas_push_secret', 'CRON_SECRET do Push Demandas');
  else
    perform vault.update_secret(v_id, v_secret, 'pmg_demandas_push_secret', 'CRON_SECRET do Push Demandas');
  end if;

  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'Ative a integração Cron no Supabase antes de continuar';
  end if;

  for v_jobid in
    select jobid from cron.job where jobname = 'pmg-demandas-push'
  loop
    perform cron.unschedule(v_jobid);
  end loop;

  perform cron.schedule(
    'pmg-demandas-push',
    '*/5 * * * *',
    $cron$
      select net.http_post(
        url := (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'pmg_demandas_push_url'
          limit 1
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || (
            select decrypted_secret
            from vault.decrypted_secrets
            where name = 'pmg_demandas_push_secret'
            limit 1
          )
        ),
        body := '{}'::jsonb,
        timeout_milliseconds := 10000
      ) as request_id;
    $cron$
  );
end
$$;

-- Confirma os dois jobs do módulo.
select jobid, jobname, schedule, active
from cron.job
where jobname in ('pmg-demandas-agenda', 'pmg-demandas-push')
order by jobname;
