-- Shortcraft initial schema.
-- Source of truth for the DB. Applied via `supabase db push` (local Docker) or
-- against a hosted project. The app's logic is tested against an in-memory repo,
-- so this runs only when you wire a real Supabase instance.

-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per auth user. Credit balance is DERIVED (sum of credit_transactions),
-- never stored here, so it can't drift.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  plan_id text not null default 'starter',
  stripe_customer_id text,
  created_at timestamptz not null default now()
);

-- ── credit_transactions ─────────────────────────────────────────────────────
-- Append-only ledger. Balance = SUM(delta). Never updated or deleted.
create table if not exists public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  delta bigint not null, -- grants/refunds positive, reserves negative
  reason text not null check (
    reason in ('trial_grant', 'monthly_grant', 'topup', 'reserve', 'settle_adjust', 'refund')
  ),
  ref_job_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists credit_tx_user_idx on public.credit_transactions (user_id);
create index if not exists credit_tx_job_idx on public.credit_transactions (ref_job_id);

-- ── render_jobs ─────────────────────────────────────────────────────────────
create table if not exists public.render_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'draft',
  topic text not null,
  theme_id text not null,
  target_duration_sec int not null,
  language text not null default 'en',
  model_tier text not null default 'standard',
  title text,
  voiceover_url text,
  words jsonb, -- word timings for subtitles
  output_asset_url text,
  estimated_credits bigint not null default 0,
  actual_credits bigint not null default 0,
  api_cost_usd numeric(10, 4) not null default 0, -- our cost, for the margin gate
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists render_jobs_user_idx on public.render_jobs (user_id, created_at desc);

-- ── scenes ──────────────────────────────────────────────────────────────────
create table if not exists public.scenes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.render_jobs (id) on delete cascade,
  idx int not null,
  narration text not null,
  image_prompt text not null,
  motion_prompt text not null,
  duration_sec int not null,
  image_url text,
  video_url text,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  unique (job_id, idx)
);
create index if not exists scenes_job_idx on public.scenes (job_id, idx);

-- ── assets ──────────────────────────────────────────────────────────────────
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid references public.render_jobs (id) on delete set null,
  kind text not null check (kind in ('image', 'video', 'audio', 'final')),
  url text not null,
  created_at timestamptz not null default now()
);
create index if not exists assets_user_idx on public.assets (user_id, created_at desc);

-- ── subscriptions ───────────────────────────────────────────────────────────
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  plan_id text not null,
  status text not null,
  stripe_subscription_id text,
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── credit functions (the only way credits move) ────────────────────────────
-- Per-user advisory lock serializes a user's spends so concurrent jobs can never
-- overspend. reserve_credits enforces the balance check atomically.
create or replace function public.reserve_credits(p_user uuid, p_amount bigint, p_job uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
begin
  if p_amount < 0 then
    raise exception 'amount must be >= 0';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  select coalesce(sum(delta), 0) into v_balance
  from public.credit_transactions
  where user_id = p_user;
  if v_balance < p_amount then
    raise exception 'insufficient_credits' using errcode = 'P0001';
  end if;
  insert into public.credit_transactions (user_id, delta, reason, ref_job_id)
  values (p_user, -p_amount, 'reserve', p_job);
  return v_balance - p_amount;
end;
$$;

-- Grants / settle adjustments / refunds / top-ups: signed delta, no balance gate.
create or replace function public.add_credits(
  p_user uuid, p_delta bigint, p_reason text, p_job uuid
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_balance bigint;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  insert into public.credit_transactions (user_id, delta, reason, ref_job_id)
  values (p_user, p_delta, p_reason, p_job);
  select coalesce(sum(delta), 0) into v_balance
  from public.credit_transactions
  where user_id = p_user;
  return v_balance;
end;
$$;

-- ── new-user bootstrap: profile + trial credits ─────────────────────────────
-- Keep the 3000 in sync with siteConfig.trialCredits.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.credit_transactions (user_id, delta, reason)
  values (new.id, 3000, 'trial_grant');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ── RLS: clients may READ their own rows; all writes go through the server ───
-- (service role bypasses RLS; credit rows are written only by the functions above).
alter table public.profiles enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.render_jobs enable row level security;
alter table public.scenes enable row level security;
alter table public.assets enable row level security;
alter table public.subscriptions enable row level security;

create policy "own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "own credits" on public.credit_transactions
  for select using (auth.uid() = user_id);
create policy "own jobs" on public.render_jobs
  for select using (auth.uid() = user_id);
create policy "own scenes" on public.scenes
  for select using (
    auth.uid() = (select user_id from public.render_jobs j where j.id = job_id)
  );
create policy "own assets" on public.assets
  for select using (auth.uid() = user_id);
create policy "own subscription" on public.subscriptions
  for select using (auth.uid() = user_id);
