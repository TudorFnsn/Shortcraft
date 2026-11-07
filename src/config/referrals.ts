/**
 * Referral program ("invite a friend"): the first, credit-only slice of the
 * affiliate idea in TheMasterPlan §5 Phase 4. Client-safe constants.
 *
 * Rewards are paid only when the invited friend starts a paid plan, so free
 * sign-ups can't be farmed for credits. Amounts are an owner decision (§11).
 */
export const REFERRAL = {
  /** Credits for the creator who shared the link, per friend who subscribes. */
  referrerCredits: 10_000,
  /** Credits for the friend, on top of their plan's credits, at their first subscription. */
  refereeCredits: 5_000,
  /** Most friends one creator is rewarded for (soft cap against self-referral rings). */
  maxRewardedPerReferrer: 20,
} as const;
