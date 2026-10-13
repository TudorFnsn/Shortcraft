-- 0011: Voice Studio line previews (POST /api/voice/preview, "Hear this line").
--
-- One row per generated preview: who asked (for the per-user daily cap), the
-- cache key (hash of text + voice + settings, so the same line in the same
-- voice is generated once and shared), and the signed URL of the audio (valid
-- 24h; the app reuses a cached row for 20h). A preview is free for the user,
-- so the cap is what protects our ElevenLabs spend.
--
-- Only the service role touches it, so RLS is on with no policies (like
-- stripe_events and email_log). Rows are tiny; prune anything older than a
-- week if it ever matters.
--
-- Re-runnable.
create table if not exists public.voice_previews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  cache_key text not null,
  audio_url text not null,
  created_at timestamptz not null default now()
);

alter table public.voice_previews enable row level security;

create index if not exists voice_previews_cache_idx on public.voice_previews (cache_key, created_at desc);
create index if not exists voice_previews_user_idx on public.voice_previews (user_id, created_at desc);

comment on table public.voice_previews is
  'Voice line previews: cache + per-user daily cap. Service role only.';
