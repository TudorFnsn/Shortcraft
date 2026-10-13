-- 0008: when the creator marked a finished video as posted (Library "Posted?").
--
-- Nullable, no default: adding it is a metadata-only change (no table rewrite,
-- no long lock). Null = not posted. Written only by the server
-- (POST /api/jobs/:id/posted, owner-checked, service role), so the existing
-- "own jobs" RLS policy is unchanged. No index: it is only read with the
-- creator's own jobs, which are already fetched by user_id.
--
-- Re-runnable.
alter table public.render_jobs add column if not exists posted_at timestamptz;

comment on column public.render_jobs.posted_at is
  'When the creator marked this finished video as posted (null = not posted).';
