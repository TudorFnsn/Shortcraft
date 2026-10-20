/**
 * Finance metrics: MRR, what the videos cost us, and the ratio between them.
 * The read-only companion to the north star (`north-star.ts`) for the Finance
 * CEO routine (FinancePlan.md). Pure: the caller loads rows and passes `now`.
 *
 * Definitions:
 * - **MRR:** the monthly list price of every live subscription (same
 *   `isLiveSubscription` as plan gating). `netMrrUsd` is what is left after VAT
 *   and Stripe fees, using the margin gate's assumptions. Top-ups are not MRR;
 *   they are reported separately as one-off revenue.
 * - **API cost:** `render_jobs.api_cost_usd` of jobs created in the window, for
 *   every status: a failed render still burned provider spend.
 * - **Fixed cost:** hosting and SaaS bills we can't read from the DB; the
 *   caller passes the monthly total (see FinancePlan.md §4).
 * - **Cost-to-MRR:** (API cost + fixed cost) ÷ net MRR. Under 1 = profitable.
 */
import { REVENUE_ASSUMPTIONS, netRevenueUsd } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { PLANS, type PlanId } from '@/config/plans';

const DAY_MS = 86_400_000;
export const FINANCE_WINDOW_DAYS = 30;

export interface FinanceSubscription extends SubscriptionSnapshot {
  userId: string;
}

export interface FinanceJob {
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  actualCredits: number;
}

export interface FinanceInput {
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  /** Top-up purchases in the window, gross EUR cents each. */
  topUpsCents: readonly number[];
  /** Hosting + SaaS + tools per month in USD; null = not provided. */
  fixedCostUsdMonthly: number | null;
  now: Date;
}

export interface TierCost {
  tier: string;
  videos: number;
  failed: number;
  costUsd: number;
  /** API cost of an average finished video; null with no finished videos. */
  costPerVideoUsd: number | null;
  /** API USD per 1,000 credits burned; null when no credits were spent. */
  costPer1kCreditsUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  subscribersByPlan: Record<string, number>;
  mrrEur: number;
  netMrrUsd: number;
  arrEur: number;
  topUpRevenueEur: number;
  apiCostUsd: number;
  /** API cost burned by failed jobs: pure waste. */
  failedCostUsd: number;
  fixedCostUsd: number | null;
  totalCostUsd: number | null;
  /** apiCost ÷ netMrr; null without MRR. */
  apiCostToMrr: number | null;
  /** totalCost ÷ netMrr; null without MRR or fixed costs. */
  costToMrr: number | null;
  /** (netMrr − totalCost) ÷ netMrr, as a fraction; null like `costToMrr`. */
  marginPct: number | null;
  /** Net MRR − total cost per month; null without fixed costs. */
  monthlyProfitUsd: number | null;
  byTier: TierCost[];
}

const round = (n: number, dp = 4) => Number(n.toFixed(dp));

export function computeFinance(input: FinanceInput): FinanceReport {
  const since = input.now.getTime() - FINANCE_WINDOW_DAYS * DAY_MS;

  const subscribersByPlan: Record<string, number> = {};
  let mrrCents = 0;
  let netMrrUsd = 0;
  let payingSubscribers = 0;
  for (const s of input.subscriptions) {
    const plan = PLANS[s.planId as PlanId];
    if (!plan || !isLiveSubscription(s)) continue;
    payingSubscribers += 1;
    subscribersByPlan[plan.id] = (subscribersByPlan[plan.id] ?? 0) + 1;
    mrrCents += plan.priceCents;
    netMrrUsd += netRevenueUsd(plan.priceCents, REVENUE_ASSUMPTIONS);
  }

  const tiers = new Map<
    string,
    { videos: number; failed: number; cost: number; credits: number; doneCost: number }
  >();
  let apiCostUsd = 0;
  let failedCostUsd = 0;
  for (const j of input.jobs) {
    if (j.createdAt.getTime() < since || j.createdAt.getTime() >= input.now.getTime()) continue;
    const t = tiers.get(j.modelTier) ?? { videos: 0, failed: 0, cost: 0, credits: 0, doneCost: 0 };
    t.cost += j.apiCostUsd;
    t.credits += j.actualCredits;
    if (j.status === 'done') {
      t.videos += 1;
      t.doneCost += j.apiCostUsd;
    }
    if (j.status === 'failed') {
      t.failed += 1;
      failedCostUsd += j.apiCostUsd;
    }
    apiCostUsd += j.apiCostUsd;
    tiers.set(j.modelTier, t);
  }

  const fixed = input.fixedCostUsdMonthly;
  const total = fixed === null ? null : apiCostUsd + fixed;
  return {
    asOf: input.now.toISOString(),
    windowDays: FINANCE_WINDOW_DAYS,
    payingSubscribers,
    subscribersByPlan,
    mrrEur: round(mrrCents / 100, 2),
    netMrrUsd: round(netMrrUsd, 2),
    arrEur: round((mrrCents / 100) * 12, 2),
    topUpRevenueEur: round(input.topUpsCents.reduce((a, c) => a + c, 0) / 100, 2),
    apiCostUsd: round(apiCostUsd),
    failedCostUsd: round(failedCostUsd),
    fixedCostUsd: fixed,
    totalCostUsd: total === null ? null : round(total),
    apiCostToMrr: netMrrUsd > 0 ? round(apiCostUsd / netMrrUsd) : null,
    costToMrr: total !== null && netMrrUsd > 0 ? round(total / netMrrUsd) : null,
    marginPct: total !== null && netMrrUsd > 0 ? round((netMrrUsd - total) / netMrrUsd) : null,
    monthlyProfitUsd: total === null ? null : round(netMrrUsd - total, 2),
    byTier: [...tiers.entries()]
      .map(([tier, t]) => ({
        tier,
        videos: t.videos,
        failed: t.failed,
        costUsd: round(t.cost),
        costPerVideoUsd: t.videos > 0 ? round(t.doneCost / t.videos) : null,
        costPer1kCreditsUsd: t.credits > 0 ? round((t.cost / t.credits) * 1000) : null,
      }))
      .sort((a, b) => a.tier.localeCompare(b.tier)),
  };
}
