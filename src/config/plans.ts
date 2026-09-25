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

export interface Plan {
  id: PlanId;
  name: string;
  /** Monthly price in EUR cents. */
  priceCents: number;
  /** Credits granted each billing cycle. */
  monthlyCredits: number;
  limits: {
    maxVideoDurationSec: number;
    maxCharacters: number;
    /** Model tiers unlocked (see models.ts `tier`). */
    modelTiers: ReadonlyArray<'standard' | 'premium'>;
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
    monthlyCredits: 30_000,
    limits: {
      maxVideoDurationSec: 30,
      maxCharacters: 10,
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
    monthlyCredits: 100_000,
    limits: {
      maxVideoDurationSec: 90,
      maxCharacters: 50,
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
    monthlyCredits: 250_000,
    limits: {
      maxVideoDurationSec: 120,
      maxCharacters: Number.POSITIVE_INFINITY,
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

export const isTierAllowed = (plan: Plan, tier: 'standard' | 'premium'): boolean =>
  plan.limits.modelTiers.includes(tier);
