-- Manual credit grants get their own ledger reason.
--
-- Until now the only "free credits" reason was `trial_grant`, so credits given
-- by hand (testers, support goodwill) were inserted as `topup`. That made them
-- look like paid top-ups: they inflated top-up revenue in the finance report,
-- counted as trial→paid conversions, and removed the watermark (hasPaid).
-- `admin_grant` is not in PAID_GRANT_REASONS, so it is none of those.
--
-- Additive and safe on a live database: existing rows are untouched (the ledger
-- is append-only; past manual `topup` rows are told apart by their missing
-- Stripe idempotency key instead). Grant with `scripts/grant-credits.mts`.

-- The reason list is the FULL set the app writes (CREDIT_REASONS in
-- src/features/credits/ledger.ts), shared by 0013 and 0015 so the two can run
-- in either order without one dropping the other's reason (fixed 2026-11-17:
-- 0015 used to omit 'referral_bonus', which made every referral payout fail).
alter table public.credit_transactions
  drop constraint if exists credit_transactions_reason_check;

alter table public.credit_transactions
  add constraint credit_transactions_reason_check check (
    reason in (
      'trial_grant', 'monthly_grant', 'topup', 'referral_bonus', 'admin_grant',
      'reserve', 'settle_adjust', 'refund'
    )
  );
