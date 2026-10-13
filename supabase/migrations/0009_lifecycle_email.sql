-- 0009: lifecycle email (activation + unused-credits reminders).
--
-- email_log: one row per email we decided to send. The unique key is the
-- idempotency claim: the daily cron inserts the row BEFORE calling the email
-- provider, so a retried or overlapping run can never send the same email
-- twice (a failed send deletes its claim so the next run retries). Only the
-- service role touches it, so RLS is on with no policies (like stripe_events).
--
-- profiles.email_opt_out: set by the one-click unsubscribe link in every
-- lifecycle email. A constant default is metadata-only (no table rewrite).
-- Account emails from Supabase Auth (confirm, reset) ignore it.
--
-- Re-runnable.
create table if not exists public.email_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  period_key text not null,
  created_at timestamptz not null default now(),
  unique (user_id, kind, period_key)
);

alter table public.email_log enable row level security;

alter table public.profiles add column if not exists email_opt_out boolean not null default false;

comment on table public.email_log is
  'Lifecycle emails sent (idempotency claims). Service role only.';
comment on column public.profiles.email_opt_out is
  'True after the user unsubscribed from lifecycle emails.';
