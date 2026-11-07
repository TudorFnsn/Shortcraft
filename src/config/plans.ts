/**
 * Subscription plans + one-time credit top-up packs.
 *
 * Credits are the universal spend unit; per-model prices live in `models.ts`.
 * Rule of thumb baked into these numbers: retail credit value is set so a fully
 * burned plan stays >= 3x our API cost (validated by the margin gate before
 * Phase 1 ships). Prices in EUR cents to avoid float drift.
 *
 * `stripePriceId` is filled from env/dashboard at wire-up time; kept null here so
 * the catalog is committed without secrets.
 */

export type PlanId = 'starter' | 'pro' | 'ultra';

export type BillingInterval = 'month' | 'year';

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in EUR cents. */
  priceCents: number;
  /**
   * Yearly price in EUR cents, or null while the plan isn't sold yearly. A yearly
   * subscriber still receives `monthlyCredits` once a month (never 12 months up
   * front), so a refund or chargeback can never cost more than one month of API
   * spend. Every yearly price must pass the margin gate on its own.
   */
  yearlyPriceCents: number | null;
  /** Credits granted each month (each billing cycle on monthly plans). */
  monthlyCredits: number;
  limits: {
    maxVideoDurationSec: number;
    maxCharacters: number;
    /** Model tiers unlocked (see models.ts `tier`). */
    modelTiers: ReadonlyArray<'standard' | 'premium'>;
    /** Designed voices a creator can keep at once (Voice Studio V4). */
    savedVoices: number;
    studio: boolean;
    series: boolean;
    agent: boolean;
  };
  stripePriceIdMonthly: string | null;
  stripePriceIdYearly: string | null;
}

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: 'starter',
    name: 'Starter',
    priceCents: 1499,
    // Two months free. Pro and Ultra can't offer that yet: at the catalog's
    // premium-video cost they sit at 3.0x / 3.2x, so any real discount fails the
    // margin gate (see TheMasterPlan §11, 2026-10-20).
    yearlyPriceCents: 14_990,
    monthlyCredits: 30_000,
    limits: {
      maxVideoDurationSec: 30,
      maxCharacters: 10,
      savedVoices: 1,
      modelTiers: ['standard'],
      studio: false,
      series: false,
      agent: false,
    },
    stripePriceIdMonthly: null,
    stripePriceIdYearly: null,
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    priceCents: 2999,
    yearlyPriceCents: null,
    monthlyCredits: 100_000,
    limits: {
      maxVideoDurationSec: 90,
      maxCharacters: 50,
      savedVoices: 3,
      modelTiers: ['standard', 'premium'],
      studio: true,
      series: true,
      agent: true,
    },
    stripePriceIdMonthly: null,
    stripePriceIdYearly: null,
  },
  ultra: {
    id: 'ultra',
    name: 'Ultra',
    priceCents: 7999,
    yearlyPriceCents: null,
    monthlyCredits: 250_000,
    limits: {
      maxVideoDurationSec: 120,
      maxCharacters: Number.POSITIVE_INFINITY,
      savedVoices: 10,
      modelTiers: ['standard', 'premium'],
      studio: true,
      series: true,
      agent: true,
    },
    stripePriceIdMonthly: null,
    stripePriceIdYearly: null,
  },
};

export interface TopUpPack {
  id: string;
  name: string;
  credits: number;
  priceCents: number;
  stripePriceId: string | null;
}

export const TOPUP_PACKS: readonly TopUpPack[] = [
  { id: 'topup_20k', name: '20K credits', credits: 20_000, priceCents: 1200, stripePriceId: null },
  { id: 'topup_60k', name: '60K credits', credits: 60_000, priceCents: 2900, stripePriceId: null },
  {
    id: 'topup_150k',
    name: '150K credits',
    credits: 150_000,
    priceCents: 5900,
    stripePriceId: null,
  },
];

/** Stripe price lookup_key for a plan and billing interval (`pro_monthly`, `starter_yearly`). */
export const planLookupKey = (planId: PlanId, interval: BillingInterval): string =>
  `${planId}_${interval === 'month' ? 'monthly' : 'yearly'}`;

/** Billing intervals a plan is sold on. */
export const planIntervals = (plan: Plan): BillingInterval[] =>
  plan.yearlyPriceCents === null ? ['month'] : ['month', 'year'];

/** Yearly saving vs twelve monthly payments, in EUR cents (0 when not sold yearly). */
export const yearlySavingCents = (plan: Plan): number =>
  plan.yearlyPriceCents === null ? 0 : 12 * plan.priceCents - plan.yearlyPriceCents;

export const isTierAllowed = (plan: Plan, tier: 'standard' | 'premium'): boolean =>
  plan.limits.modelTiers.includes(tier);
