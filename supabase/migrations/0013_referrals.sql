-- 0013: referral program ("invite a friend", TheMasterPlan §5).
--
-- profiles.referral_code: each account's shareable code (8 lowercase hex
-- characters), used in links like /r/<code>. The volatile default fills every
-- existing row once (a one-off rewrite of a small table) and every new
-- profile created by handle_new_user. Unique, so a code names one account.
--
-- profiles.referred_by / referred_at: who invited this account. Written only
-- by the server (service role) when a signed-in, never-paid user arrives with
-- a valid code; the first claim wins (`where referred_by is null`).
--
-- credit_transactions.reason gains 'referral_bonus': the free credits both
-- sides get when the invited friend's first subscription is paid, granted
-- through grant_credits_once with keys `referral:<friend>:referee|referrer`,
-- so each friend pays out at most once. It is NOT a paid reason: it never
-- removes the trial watermark and never counts as a payment in the metrics.
--
-- RLS is unchanged: users read their own profile (and so their own code);
-- all writes go through the server. Re-runnable.
alter table public.profiles
  add column if not exists referral_code text
    default substr(replace(gen_random_uuid()::text, '-', ''), 1, 8);

create unique index if not exists profiles_referral_code_key
  on public.profiles (referral_code);

alter table public.profiles
  add column if not exists referred_by uuid references public.profiles (id) on delete set null,
  add column if not exists referred_at timestamptz;

create index if not exists profiles_referred_by_idx
  on public.profiles (referred_by) where referred_by is not null;

alter table public.credit_transactions
  drop constraint if exists credit_transactions_reason_check;
alter table public.credit_transactions
  add constraint credit_transactions_reason_check check (
    reason in (
      'trial_grant', 'monthly_grant', 'topup', 'referral_bonus',
      'reserve', 'settle_adjust', 'refund'
    )
  );

comment on column public.profiles.referral_code is
  'Shareable invite code (/r/<code>). Generated at sign-up.';
comment on column public.profiles.referred_by is
  'Account that invited this one. Set once by the server; never by the client.';
