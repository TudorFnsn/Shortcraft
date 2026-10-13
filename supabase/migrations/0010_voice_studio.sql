-- 0010: Voice Studio (TheMasterPlan §5).
--
-- render_jobs.voice_id        the narrator the creator picked (catalog slug from
--                             src/config/voices.ts; null = the look's default).
-- render_jobs.voice_settings  their speed/delivery choice, in plain words
--                             ({"speed":"slower","delivery":"calm"}); null = defaults.
-- render_jobs.parent_job_id   for a re-voiced copy (V3), the video it came from.
--
-- All nullable with no default: metadata-only, no table rewrite, no long lock.
-- Written only by the server (service role); the existing "own jobs" select
-- policy already covers the new columns, so RLS is unchanged. The foreign key
-- gets its own index (the advisors flag unindexed FKs).
--
-- Apply BEFORE shipping the Create voice pill (V2): the app only writes these
-- columns when a voice is chosen.
--
-- Re-runnable.
alter table public.render_jobs add column if not exists voice_id text;
alter table public.render_jobs add column if not exists voice_settings jsonb;
alter table public.render_jobs
  add column if not exists parent_job_id uuid references public.render_jobs (id) on delete set null;

create index if not exists render_jobs_parent_job_idx on public.render_jobs (parent_job_id);

comment on column public.render_jobs.voice_id is
  'Narrator voice (catalog slug); null = the theme default.';
comment on column public.render_jobs.voice_settings is
  'Voice speed/delivery choice, e.g. {"speed":"normal","delivery":"natural"}; null = defaults.';
comment on column public.render_jobs.parent_job_id is
  'For a re-voiced copy, the job it was made from.';
