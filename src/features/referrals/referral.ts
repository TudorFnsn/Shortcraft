/**
 * Referral program: attribution ("this account was invited by X") and the
 * one-time rewards when the invited friend subscribes.
 *
 * Attribution never uses a tracking cookie: the code rides in the URL from
 * `/r/<code>` through sign-up (features/auth/carry.ts) and is claimed by the
 * server once the friend is signed in (Google: `/auth/callback`; email: the
 * sign-up metadata, claimed at checkout). Claims are best-effort and never
 * block sign-in or checkout.
 *
 * Rewards: when an attributed friend's first subscription checkout completes,
 * the Stripe webhook grants both sides through the idempotent credit ledger,
 * keyed per friend, so a retried or replayed event can never pay twice and a
 * friend can only ever earn their inviter one reward. Accounts that already
 * paid can't be attributed, so existing customers can't be "referred".
 */
import { REFERRAL } from '@/config/referrals';
import type { CreditGrantLedger, InMemoryCreditGrantLedger } from '@/features/billing/credit-grant';
import { normalizeReferralCode } from './code';

/** Port: Supabase in prod (migration 0013), in-memory in tests and mock mode. */
export interface ReferralRepository {
  /** The user who owns `code`, or null. */
  userIdForCode(code: string): Promise<string | null>;
  /** The user's own shareable code (null before migration 0013). */
  codeOf(userId: string): Promise<string | null>;
  /** Who invited this user, or null. */
  referredBy(userId: string): Promise<string | null>;
  /** Sets the inviter only if none is set yet; false when one already was. */
  attach(refereeId: string, referrerId: string): Promise<boolean>;
  /** Accounts this user invited. */
  invitedCount(referrerId: string): Promise<number>;
  /** Friends this user has already been rewarded for. */
  rewardedCount(referrerId: string): Promise<number>;
}

export interface PaidLookup {
  hasPaid(userId: string): Promise<boolean>;
}

export type ClaimOutcome =
  'attached' | 'invalid_code' | 'unknown_code' | 'self' | 'already_referred' | 'already_paid';

/** Pure attribution rule. `referrerId` is the owner of the code (null = no such code). */
export function decideClaim(input: {
  refereeId: string;
  referrerId: string | null;
  alreadyReferredBy: string | null;
  refereeHasPaid: boolean;
}): Exclude<ClaimOutcome, 'invalid_code'> | 'attach' {
  if (input.alreadyReferredBy) return 'already_referred';
  if (!input.referrerId) return 'unknown_code';
  if (input.referrerId === input.refereeId) return 'self';
  if (input.refereeHasPaid) return 'already_paid';
  return 'attach';
}

export async function claimReferral(
  deps: { referrals: ReferralRepository; plans: PaidLookup },
  refereeId: string,
  rawCode: string | null | undefined,
): Promise<ClaimOutcome> {
  const code = normalizeReferralCode(rawCode);
  if (!code) return 'invalid_code';
  const [referrerId, alreadyReferredBy] = await Promise.all([
    deps.referrals.userIdForCode(code),
    deps.referrals.referredBy(refereeId),
  ]);
  const refereeHasPaid = await deps.plans.hasPaid(refereeId);
  const decision = decideClaim({ refereeId, referrerId, alreadyReferredBy, refereeHasPaid });
  if (decision !== 'attach') return decision;
  return (await deps.referrals.attach(refereeId, referrerId!)) ? 'attached' : 'already_referred';
}

export const refereeRewardKey = (refereeId: string): string => `referral:${refereeId}:referee`;
export const referrerRewardKey = (refereeId: string): string => `referral:${refereeId}:referrer`;

export interface RewardGrant {
  userId: string;
  credits: number;
  key: string;
}

/** Pure: the grants owed when `refereeId` (invited by `referrerId`) subscribes. */
export function referralRewards(input: {
  refereeId: string;
  referrerId: string;
  referrerRewardedCount: number;
}): RewardGrant[] {
  const grants: RewardGrant[] = [
    {
      userId: input.refereeId,
      credits: REFERRAL.refereeCredits,
      key: refereeRewardKey(input.refereeId),
    },
  ];
  if (input.referrerRewardedCount < REFERRAL.maxRewardedPerReferrer) {
    grants.push({
      userId: input.referrerId,
      credits: REFERRAL.referrerCredits,
      key: referrerRewardKey(input.refereeId),
    });
  }
  return grants;
}

/**
 * Pays the referral rewards for a friend's first subscription. Idempotent: the
 * ledger keys make retries no-ops. Returns the grants that were new.
 * Throws on ledger errors so the Stripe event is released and retried.
 */
export async function rewardReferral(
  deps: { referrals: ReferralRepository; grants: CreditGrantLedger },
  refereeId: string,
): Promise<RewardGrant[]> {
  const referrerId = await deps.referrals.referredBy(refereeId);
  if (!referrerId) return [];
  const referrerRewardedCount = await deps.referrals.rewardedCount(referrerId);
  const paid: RewardGrant[] = [];
  for (const g of referralRewards({ refereeId, referrerId, referrerRewardedCount })) {
    const outcome = await deps.grants.grantOnce(g.userId, g.credits, 'referral_bonus', g.key);
    if (outcome === 'granted') paid.push(g);
  }
  return paid;
}

/** What `GET /api/referrals` shows a creator about their own invites. */
export interface ReferralSummary {
  code: string | null;
  invited: number;
  rewarded: number;
}

export async function referralSummary(
  referrals: ReferralRepository,
  userId: string,
): Promise<ReferralSummary> {
  const [code, invited, rewarded] = await Promise.all([
    referrals.codeOf(userId),
    referrals.invitedCount(userId),
    referrals.rewardedCount(userId),
  ]);
  return { code, invited, rewarded };
}

/** True for the ledger key of a reward paid to an inviter. */
export const isReferrerRewardKey = (key: string): boolean =>
  key.startsWith('referral:') && key.endsWith(':referrer');

/**
 * In-memory repository (tests + mock mode). `rewardedCount` reads the grant
 * ledger it is given, like the Supabase one reads `credit_transactions`.
 */
export class InMemoryReferralRepository implements ReferralRepository {
  private readonly codes = new Map<string, string>();
  private readonly inviter = new Map<string, string>();

  constructor(private readonly ledger?: InMemoryCreditGrantLedger) {}

  /** Gives `userId` a code (the database assigns one at sign-up). */
  setCode(userId: string, code: string): void {
    this.codes.set(userId, code);
  }

  async userIdForCode(code: string): Promise<string | null> {
    for (const [userId, c] of this.codes) if (c === code) return userId;
    return null;
  }

  async codeOf(userId: string): Promise<string | null> {
    return this.codes.get(userId) ?? null;
  }

  async referredBy(userId: string): Promise<string | null> {
    return this.inviter.get(userId) ?? null;
  }

  async attach(refereeId: string, referrerId: string): Promise<boolean> {
    if (this.inviter.has(refereeId)) return false;
    this.inviter.set(refereeId, referrerId);
    return true;
  }

  async invitedCount(referrerId: string): Promise<number> {
    return [...this.inviter.values()].filter((r) => r === referrerId).length;
  }

  async rewardedCount(referrerId: string): Promise<number> {
    if (!this.ledger) return 0;
    return [...this.ledger.grants].filter(
      ([key, g]) => g.userId === referrerId && isReferrerRewardKey(key),
    ).length;
  }
}
