/**
 * Finance metrics: MRR and what the videos cost us, from data we already
 * store (`subscriptions`, `render_jobs.api_cost_usd`). Pure: the caller loads
 * rows and passes `now`, so every number is reproducible.
 *
 * Definitions:
 * - **MRR (EUR):** sum of list `priceCents` of live subscriptions (same
 *   `isLiveSubscription` as plan gating). Monthly billing only: yearly plans
 *   don't exist yet. Gross of VAT, like the price on the pricing page.
 * - **Net MRR (USD):** each plan's `netRevenueUsd` (after VAT, Stripe fees, FX)
 *   times its subscriber count. Same assumptions as the margin gate.
 * - **Cost window:** jobs created in the last 30 days. `api_cost_usd` is what
 *   the orchestrator metered, so jobs that failed after spending still count
 *   (`wastedCostUsd`): that money is gone and nobody paid for a video.
 * - **Cost coverage:** the share of finished jobs with a metered cost > 0. A
 *   low value means costs aren't metered yet (mock mode, or a provider that
 *   doesn't report), and every margin figure here is a floor, not a fact.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { netRevenueUsd, REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

const DAY_MS = 86_400_000;
export const COST_WINDOW_DAYS = 30;

export interface FinanceJob {
  status: string;
  modelTier: string;
  targetDurationSec: number;
  apiCostUsd: number;
  createdAt: Date;
}

export interface FinanceInput {
  now: Date;
  subscriptions: SubscriptionSnapshot[];
  jobs: FinanceJob[];
}

export interface TierCost {
  tier: string;
  videos: number;
  totalCostUsd: number;
  avgCostUsd: number | null;
  /** Average metered cost per second of finished video. */
  costPerVideoSecUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  mrrEur: number;
  arrEur: number;
  netMrrUsd: number;
  payingSubscribers: number;
  subscribersByPlan: Record<PlanId, number>;
  window: {
    days: number;
    videosDone: number;
    jobsFailed: number;
    totalCostUsd: number;
    wastedCostUsd: number;
    costPerPayingSubscriberUsd: number | null;
    byTier: TierCost[];
    costCoverage: number | null;
  };
  /** (net MRR − 30-day API cost) ÷ net MRR; null with no subscribers. */
  grossMargin: number | null;
  /** Net MRR ÷ 30-day API cost; the margin gate's 3x target, but measured. */
  coverageMultiple: number | null;
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now, subscriptions, jobs } = input;
  const subscribersByPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  let mrrCents = 0;
  let netMrrUsd = 0;
  let payingSubscribers = 0;
  for (const sub of subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    const plan = PLANS[sub.planId];
    // The free plan has no price; it isn't revenue.
    if (plan.priceCents <= 0) continue;
    subscribersByPlan[sub.planId] += 1;
    payingSubscribers += 1;
    mrrCents += plan.priceCents;
    netMrrUsd += netRevenueUsd(plan.priceCents, REVENUE_ASSUMPTIONS);
  }

  const since = now.getTime() - COST_WINDOW_DAYS * DAY_MS;
  const recent = jobs.filter((j) => j.createdAt.getTime() >= since && j.createdAt <= now);
  const done = recent.filter((j) => j.status === 'done');
  const failed = recent.filter((j) => j.status === 'failed');
  const totalCostUsd = recent.reduce((s, j) => s + j.apiCostUsd, 0);
  const wastedCostUsd = failed.reduce((s, j) => s + j.apiCostUsd, 0);

  const tiers = [...new Set(done.map((j) => j.modelTier))].sort();
  const byTier: TierCost[] = tiers.map((tier) => {
    const rows = done.filter((j) => j.modelTier === tier);
    const cost = rows.reduce((s, j) => s + j.apiCostUsd, 0);
    const secs = rows.reduce((s, j) => s + j.targetDurationSec, 0);
    return {
      tier,
      videos: rows.length,
      totalCostUsd: round(cost),
      avgCostUsd: rows.length ? round(cost / rows.length) : null,
      costPerVideoSecUsd: secs ? round(cost / secs) : null,
    };
  });

  const metered = done.filter((j) => j.apiCostUsd > 0).length;
  return {
    asOf: now.toISOString(),
    mrrEur: mrrCents / 100,
    arrEur: (mrrCents * 12) / 100,
    netMrrUsd: round(netMrrUsd, 2),
    payingSubscribers,
    subscribersByPlan,
    window: {
      days: COST_WINDOW_DAYS,
      videosDone: done.length,
      jobsFailed: failed.length,
      totalCostUsd: round(totalCostUsd, 2),
      wastedCostUsd: round(wastedCostUsd, 2),
      costPerPayingSubscriberUsd: payingSubscribers
        ? round(totalCostUsd / payingSubscribers, 2)
        : null,
      byTier,
      costCoverage: done.length ? round(metered / done.length, 3) : null,
    },
    grossMargin: netMrrUsd > 0 ? round((netMrrUsd - totalCostUsd) / netMrrUsd, 3) : null,
    coverageMultiple: totalCostUsd > 0 && netMrrUsd > 0 ? round(netMrrUsd / totalCostUsd, 2) : null,
  };
}
