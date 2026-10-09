-- Hardening from the Supabase security + performance advisors (2026-10-09).
--
-- 1. handle_new_user() is SECURITY DEFINER and still had Supabase's default
--    EXECUTE grant, so it was listed as /rest/v1/rpc/handle_new_user. Postgres
--    refuses to run a trigger function outside a trigger, so this was not
--    exploitable, but it should not be an exposed RPC. The on_auth_user_created
--    trigger keeps firing: EXECUTE is checked when a trigger is created, not
--    each time it fires.
-- 2. RLS policies called auth.uid() once per row. Wrapping it as
--    (select auth.uid()) lets Postgres evaluate it once per query. Same rules,
--    still SELECT only.
-- 3. assets.job_id is a foreign key with no index (slow deletes/joins by job).
--
-- Safe to run on a live database: one transaction, so no request ever sees a
-- table without its policy.

begin;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles
  for select using ((select auth.uid()) = id);

drop policy if exists "own credits" on public.credit_transactions;
create policy "own credits" on public.credit_transactions
  for select using ((select auth.uid()) = user_id);

drop policy if exists "own jobs" on public.render_jobs;
create policy "own jobs" on public.render_jobs
  for select using ((select auth.uid()) = user_id);

drop policy if exists "own scenes" on public.scenes;
create policy "own scenes" on public.scenes
  for select using (
    (select auth.uid()) = (select user_id from public.render_jobs j where j.id = job_id)
  );

drop policy if exists "own assets" on public.assets;
create policy "own assets" on public.assets
  for select using ((select auth.uid()) = user_id);

drop policy if exists "own subscription" on public.subscriptions;
create policy "own subscription" on public.subscriptions
  for select using ((select auth.uid()) = user_id);

create index if not exists assets_job_idx on public.assets (job_id);

commit;
