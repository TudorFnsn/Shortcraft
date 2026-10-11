-- 0007: run the render-job sweep every minute from the database.
--
-- Vercel Hobby only allows daily crons (a deploy with a per-minute cron
-- fails), so Supabase pg_cron calls GET /api/cron/advance-jobs every minute
-- through pg_net. vercel.json keeps a daily Vercel cron as a backstop.
--
-- No secrets live in this file. The app URL and CRON_SECRET are read from
-- Supabase Vault at call time; until both exist the tick does nothing.
-- Owner, once, after deploy (SQL Editor):
--   select vault.create_secret('https://<your-domain>', 'shortcraft_app_url');
--   select vault.create_secret('<same value as CRON_SECRET in Vercel>', 'shortcraft_cron_secret');
-- To change one later: vault.update_secret(<id>, '<new value>') using the id
-- from `select id, name from vault.secrets`.
--
-- Re-runnable: extensions/schema are "if not exists", the function is
-- "create or replace", and cron.schedule replaces a job with the same name.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

-- Not exposed through the Data API; nothing here should be callable as an RPC.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.advance_jobs_tick()
returns bigint
language plpgsql
set search_path = ''
as $$
declare
  app_url text;
  cron_secret text;
begin
  select decrypted_secret into app_url
    from vault.decrypted_secrets where name = 'shortcraft_app_url';
  select decrypted_secret into cron_secret
    from vault.decrypted_secrets where name = 'shortcraft_cron_secret';
  if app_url is null or cron_secret is null then
    return null; -- not configured yet: do nothing
  end if;

  -- pg_net is asynchronous: this queues the request and returns its id. The
  -- route answers 202 at once and drives the jobs in the background.
  return net.http_get(
    url := rtrim(app_url, '/') || '/api/cron/advance-jobs',
    headers := jsonb_build_object('Authorization', 'Bearer ' || cron_secret),
    timeout_milliseconds := 10000
  );
end;
$$;

revoke execute on function private.advance_jobs_tick() from public, anon, authenticated;

select cron.schedule(
  'shortcraft-advance-jobs',
  '* * * * *',
  'select private.advance_jobs_tick()'
);

-- One run per minute is 1,440 history rows a day; keep a week.
select cron.schedule(
  'shortcraft-cron-history-cleanup',
  '17 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$
);
