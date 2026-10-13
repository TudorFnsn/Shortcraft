-- 0012: Voice Studio V4, "Create your own voice".
--
-- user_voices          a creator's saved designed voices. The app's public id
--                      is 'u_' || id; provider_voice_id is the ElevenLabs voice
--                      in our account and never leaves the server. How many a
--                      creator keeps is a plan limit (config/plans.ts).
-- voice_design_rounds  each paid design round (3 samples): which generated
--                      sample ids it offered, so a save can only keep a sample
--                      the caller paid for, and only once.
--
-- The app reads both with the service role (the API returns names and ids
-- only), so RLS is on with no policies: a user's anon client sees nothing,
-- in particular not the provider ids.
--
-- Deleting an account removes its rows (cascade); the ElevenLabs voices are
-- removed by the app on delete. Re-runnable.
create table if not exists public.user_voices (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  provider_voice_id text not null,
  name text not null check (char_length(name) between 1 and 40),
  description text not null,
  created_at timestamptz not null default now()
);

alter table public.user_voices enable row level security;

create index if not exists user_voices_user_idx on public.user_voices (user_id, created_at);

comment on table public.user_voices is
  'Voice Studio V4: creators'' saved designed voices. Service role only.';

create table if not exists public.voice_design_rounds (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  description text not null,
  generated_voice_ids text[] not null,
  saved_voice_id uuid references public.user_voices (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.voice_design_rounds enable row level security;

create index if not exists voice_design_rounds_user_idx
  on public.voice_design_rounds (user_id, created_at desc);

comment on table public.voice_design_rounds is
  'Voice Studio V4: paid design rounds and the samples they offered. Service role only.';
