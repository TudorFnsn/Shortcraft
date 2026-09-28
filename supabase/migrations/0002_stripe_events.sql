-- Idempotency ledger for Stripe webhooks. The webhook records each event id once
-- before processing; a duplicate insert (retry) is detected and skipped, so
-- credits are never granted twice. Only the service role (the webhook) touches
-- this table, so RLS is on with no policies.
create table if not exists public.stripe_events (
  id text primary key,
  type text,
  created_at timestamptz not null default now()
);

alter table public.stripe_events enable row level security;
