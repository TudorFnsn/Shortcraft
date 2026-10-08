-- Async render pipeline: jobs advance one step at a time, across requests.
--
-- A Premium video waits minutes on its AI clips, longer than one serverless
-- call. The orchestrator now persists its progress after every step and resumes
-- from the database (in the background after POST /api/jobs, and from a cron
-- sweep for anything that stalls), so each column below is state that used to
-- live in one long-running function's memory.
--
-- Additive and safe to run on a live database: existing jobs are terminal or
-- get sane defaults.

-- Credits metered so far (the hold is settled against this at the end).
alter table public.render_jobs add column if not exists charged_credits bigint not null default 0;

-- Lease: only the holder may advance the job, so a background run and the cron
-- sweep never execute (and pay for) the same step twice. Expires on its own if
-- the holder dies mid-step.
alter table public.render_jobs add column if not exists locked_by text;
alter table public.render_jobs add column if not exists locked_until timestamptz;

-- The cron sweep looks for unfinished jobs nobody is working on.
create index if not exists render_jobs_active_idx
  on public.render_jobs (status, updated_at)
  where status not in ('done', 'failed');

-- An in-flight provider job for this scene's clip (opaque handle), and the
-- finished clip's own length (the renderer time-fits it to the scene).
alter table public.scenes add column if not exists video_job text;
alter table public.scenes add column if not exists clip_duration_ms int;

-- Take (or renew) the lease. True when p_owner now holds it.
create or replace function public.claim_render_job(p_job uuid, p_owner text, p_ttl_seconds int)
returns boolean
language plpgsql
set search_path = public
as $$
declare
  v_rows int;
begin
  update public.render_jobs
     set locked_by = p_owner,
         locked_until = now() + make_interval(secs => p_ttl_seconds)
   where id = p_job
     and (locked_until is null or locked_until < now() or locked_by = p_owner);
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

-- Give the lease back early (no-op if someone else holds it).
create or replace function public.release_render_job(p_job uuid, p_owner text)
returns void
language sql
set search_path = public
as $$
  update public.render_jobs
     set locked_by = null, locked_until = null
   where id = p_job and locked_by = p_owner;
$$;

-- Only the server (service role) drives jobs.
revoke execute on function public.claim_render_job(uuid, text, int) from public, anon, authenticated;
revoke execute on function public.release_render_job(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_render_job(uuid, text, int) to service_role;
grant execute on function public.release_render_job(uuid, text) to service_role;
