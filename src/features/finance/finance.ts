/**
 * Finance report: MRR, 30-day cash in vs API cash out, and unit costs, from
 * data we already store (subscriptions, paid credit grants, render jobs).
 * Feeds the Finance CEO routine (`FinancePlan.md`).
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`.
 *
 * Definitions:
 * - **MRR:** sum of the list price (EUR, VAT inclusive) of every live
 *   subscription on a plan we sell, converted to net USD with the same
 *   assumptions as the margin gate (VAT, Stripe fees, FX).
 * - **Top-up revenue (30d):** paid `topup` grants in the window, priced by the
 *   pack whose credit amount matches the grant. Unknown amounts are counted
 *   separately, never guessed.
 * - **API cost (30d):** `api_cost_usd` of jobs created in the window. Failed
 *   jobs count: their spend is real even though the credits were refunded.
 * - **Gross margin:** (MRR + top-up revenue − API cost) / (MRR + top-up revenue),
 *   an approximation because subscription renewals are not in the window math.
 */
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { PLANS, TOPUP_PACKS } from '@/config/plans';

export const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;

export interface FinanceSub {
  planId: string;
  status: string;
}
export interface FinanceGrant {
  reason: string;
  delta: number;
  createdAt: Date;
}
export interface FinanceJob {
  status: string;
  modelTier: string;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface TierCost {
  jobs: number;
  costUsd: number;
  avgCostUsd: number;
  credits: number;
  usdPer1kCredits: number;
}

export interface FinanceReport {
  asOf: string;
  payingSubscribers: number;
  subscribersByPlan: Record<string, number>;
  mrrNetUsd: number;
  topUpRevenueNetUsd30d: number;
  topUpGrantsUnpriced30d: number;
  apiCostUsd30d: number;
  failedJobCostUsd30d: number;
  grossMargin30d: number | null;
  /** API cost as a share of revenue (lower is better). */
  costToRevenue30d: number | null;
  doneVideos30d: number;
  costPerDoneVideoUsd: number | null;
  byTier: Record<string, TierCost>;
}

/** Net USD of a gross EUR price: strip VAT, then Stripe's fee, then convert. */
export function netUsd(grossEur: number, a: RevenueAssumptions = REVENUE_ASSUMPTIONS): number {
  const ex = grossEur / (1 + a.vatRate);
  const fee = ex * a.stripePercentFee + a.stripeFixedFeeEur;
  return Math.max(0, (ex - fee) * a.usdPerEur);
}

export function computeFinance(input: {
  now: Date;
  subscriptions: readonly FinanceSub[];
  grants: readonly FinanceGrant[];
  jobs: readonly FinanceJob[];
}): FinanceReport {
  const since = input.now.getTime() - WINDOW_DAYS * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= since && d.getTime() < input.now.getTime();

  const subscribersByPlan: Record<string, number> = {};
  let mrr = 0;
  for (const s of input.subscriptions) {
    const plan = (PLANS as Record<string, (typeof PLANS)[keyof typeof PLANS] | undefined>)[
      s.planId
    ];
    if (!plan || !isLiveSubscription(s)) continue;
    subscribersByPlan[plan.id] = (subscribersByPlan[plan.id] ?? 0) + 1;
    mrr += netUsd(plan.priceCents / 100);
  }

  let topUp = 0;
  let unpriced = 0;
  for (const g of input.grants) {
    if (g.reason !== 'topup' || !inWindow(g.createdAt)) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === g.delta);
    if (pack) topUp += netUsd(pack.priceCents / 100);
    else unpriced += 1;
  }

  let cost = 0;
  let failedCost = 0;
  let done = 0;
  const tiers: Record<string, { jobs: number; cost: number; credits: number }> = {};
  for (const j of input.jobs) {
    if (!inWindow(j.createdAt)) continue;
    cost += j.apiCostUsd;
    if (j.status === 'failed') failedCost += j.apiCostUsd;
    if (j.status !== 'done') continue;
    done += 1;
    const t = (tiers[j.modelTier] ??= { jobs: 0, cost: 0, credits: 0 });
    t.jobs += 1;
    t.cost += j.apiCostUsd;
    t.credits += j.actualCredits;
  }

  const revenue = mrr + topUp;
  const byTier: Record<string, TierCost> = {};
  for (const [tier, t] of Object.entries(tiers)) {
    byTier[tier] = {
      jobs: t.jobs,
      costUsd: t.cost,
      avgCostUsd: t.cost / t.jobs,
      credits: t.credits,
      usdPer1kCredits: t.credits > 0 ? (t.cost / t.credits) * 1000 : 0,
    };
  }
  return {
    asOf: input.now.toISOString(),
    payingSubscribers: Object.values(subscribersByPlan).reduce((a, b) => a + b, 0),
    subscribersByPlan,
    mrrNetUsd: mrr,
    topUpRevenueNetUsd30d: topUp,
    topUpGrantsUnpriced30d: unpriced,
    apiCostUsd30d: cost,
    failedJobCostUsd30d: failedCost,
    grossMargin30d: revenue > 0 ? (revenue - cost) / revenue : null,
    costToRevenue30d: revenue > 0 ? cost / revenue : null,
    doneVideos30d: done,
    costPerDoneVideoUsd: done > 0 ? cost / done : null,
    byTier,
  };
}
