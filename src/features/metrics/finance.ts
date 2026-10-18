/**
 * Finance metrics: MRR, API cost ratio and contribution, computed from rows we
 * already store (subscriptions + render_jobs). No payment vendor, no new tables.
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`, so every number is reproducible.
 *
 * Definitions:
 * - **MRR (EUR):** sum of list prices of live subscriptions as of `now`
 *   (`isLiveSubscription`), gross of VAT and fees. Top-ups are not recurring.
 * - **Net MRR (USD):** each subscription's price after VAT, Stripe fees and FX
 *   (the margin gate's `REVENUE_ASSUMPTIONS`), so it compares to cost like for like.
 * - **API cost (30d):** `render_jobs.api_cost_usd` of jobs created in the last
 *   30 days. Failed jobs count: the provider bills us even when the creator is
 *   refunded, so that spend is waste to hunt down.
 * - **Cost ratio:** API cost (30d) / net MRR. The margin gate's 3x floor means
 *   a ratio at or under 1/3 is healthy; above 1 the app loses money on usage.
 * - **Contribution:** net MRR - API cost (30d) - fixed costs the caller passes.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';
import { DAY_MS } from './north-star';

export interface FinanceJob {
  status: string;
  modelTier: string;
  apiCostUsd: number;
  chargedCredits: number;
  createdAt: Date;
}

export interface FinanceInput {
  subscriptions: readonly SubscriptionSnapshot[];
  jobs: readonly FinanceJob[];
  /** Fixed monthly costs in USD (hosting, database, email, seats). */
  fixedCostsUsd: number;
  now: Date;
  assumptions?: RevenueAssumptions;
}

export interface TierCost {
  tier: string;
  jobs: number;
  done: number;
  failed: number;
  apiCostUsd: number;
  /** API cost per finished video, null when none finished. */
  costPerDoneUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  subscribersByPlan: Record<PlanId, number>;
  mrrEur: number;
  netMrrUsd: number;
  arpuEur: number | null;
  apiCostUsd30d: number;
  /** Provider spend on jobs that did not finish. */
  wastedCostUsd30d: number;
  fixedCostsUsd: number;
  /** API cost / net MRR, null with no recurring revenue. */
  costRatio: number | null;
  contributionUsd: number;
  /** Billed credits per API dollar over finished jobs, null with no cost. */
  creditsPerApiUsd: number | null;
  tiers: TierCost[];
}

const round = (n: number, places = 2): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

/** Net USD of one EUR price (VAT-inclusive) after Stripe's percent + fixed fee. */
export function netUsdOfEur(priceEur: number, a: RevenueAssumptions = REVENUE_ASSUMPTIONS): number {
  const exVat = priceEur / (1 + a.vatRate);
  const afterFees = exVat - priceEur * a.stripePercentFee - a.stripeFixedFeeEur;
  return Math.max(0, afterFees) * a.usdPerEur;
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now } = input;
  const assumptions = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const subscribersByPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  let mrrEur = 0;
  let netMrrUsd = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const plan = PLANS[s.planId as PlanId];
    if (!plan) continue;
    subscribersByPlan[plan.id] += 1;
    mrrEur += plan.priceCents / 100;
    netMrrUsd += netUsdOfEur(plan.priceCents / 100, assumptions);
  }
  const subscribers = Object.values(subscribersByPlan).reduce((a, b) => a + b, 0);

  const since = now.getTime() - 30 * DAY_MS;
  const recent = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const byTier = new Map<string, TierCost>();
  let apiCostUsd30d = 0;
  let wastedCostUsd30d = 0;
  let doneCost = 0;
  let doneCredits = 0;
  for (const j of recent) {
    const t = byTier.get(j.modelTier) ?? {
      tier: j.modelTier,
      jobs: 0,
      done: 0,
      failed: 0,
      apiCostUsd: 0,
      costPerDoneUsd: null,
    };
    t.jobs += 1;
    t.apiCostUsd += j.apiCostUsd;
    apiCostUsd30d += j.apiCostUsd;
    if (j.status === 'done') {
      t.done += 1;
      doneCost += j.apiCostUsd;
      doneCredits += j.chargedCredits;
    } else if (j.status === 'failed') {
      t.failed += 1;
      wastedCostUsd30d += j.apiCostUsd;
    }
    byTier.set(j.modelTier, t);
  }
  const tiers = [...byTier.values()]
    .map((t) => ({
      ...t,
      apiCostUsd: round(t.apiCostUsd, 4),
      costPerDoneUsd: t.done ? round(t.apiCostUsd / t.done, 4) : null,
    }))
    .sort((a, b) => a.tier.localeCompare(b.tier));

  return {
    asOf: now.toISOString(),
    subscribersByPlan,
    mrrEur: round(mrrEur),
    netMrrUsd: round(netMrrUsd),
    arpuEur: subscribers ? round(mrrEur / subscribers) : null,
    apiCostUsd30d: round(apiCostUsd30d, 4),
    wastedCostUsd30d: round(wastedCostUsd30d, 4),
    fixedCostsUsd: input.fixedCostsUsd,
    costRatio: netMrrUsd > 0 ? round(apiCostUsd30d / netMrrUsd, 3) : null,
    contributionUsd: round(netMrrUsd - apiCostUsd30d - input.fixedCostsUsd),
    creditsPerApiUsd: doneCost > 0 ? Math.round(doneCredits / doneCost) : null,
    tiers,
  };
}
