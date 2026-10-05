-- Ledger-level idempotency for credit grants.
--
-- stripe_events (0002) dedupes whole webhook events, but it can't protect a grant
-- whose event is released and retried after a partial failure, or one processed
-- while that table is missing. Each paid grant now carries a unique key derived
-- from the Stripe event id, so the ledger itself refuses a second insert: a grant
-- applies exactly once no matter how many times the event is replayed.
--
-- Also locks the credit functions down to the service role. They are SECURITY
-- DEFINER and Postgres/Supabase grant EXECUTE to PUBLIC/anon/authenticated by
-- default, so before this migration any signed-in user (or anyone with the anon
-- key) could call rpc('add_credits') to mint credits, or reserve_credits to drain
-- someone else's balance. The app only ever calls them with the service role.
--
-- Additive and safe to run on a live database: existing rows keep a null key, and
-- add_credits (used by render settle/refund) keeps its behaviour.

alter table public.credit_transactions add column if not exists idempotency_key text;

create unique index if not exists credit_tx_idempotency_key_idx
  on public.credit_transactions (idempotency_key)
  where idempotency_key is not null;

-- Grants p_delta once per p_key. Returns true if this call applied the grant,
-- false if a transaction with that key already exists (a replay).
create or replace function public.grant_credits_once(
  p_user uuid, p_delta bigint, p_reason text, p_key text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  if p_key is null or length(p_key) = 0 then
    raise exception 'grant_credits_once requires an idempotency key';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  insert into public.credit_transactions (user_id, delta, reason, idempotency_key)
  values (p_user, p_delta, p_reason, p_key)
  on conflict (idempotency_key) where idempotency_key is not null do nothing;
  get diagnostics v_rows = row_count;
  return v_rows = 1;
end;
$$;

-- ── lock down: only the server (service role) moves credits ─────────────────
revoke execute on function public.grant_credits_once(uuid, bigint, text, text) from public, anon, authenticated;
revoke execute on function public.add_credits(uuid, bigint, text, uuid) from public, anon, authenticated;
revoke execute on function public.reserve_credits(uuid, bigint, uuid) from public, anon, authenticated;
grant execute on function public.grant_credits_once(uuid, bigint, text, text) to service_role;
grant execute on function public.add_credits(uuid, bigint, text, uuid) to service_role;
grant execute on function public.reserve_credits(uuid, bigint, uuid) to service_role;
