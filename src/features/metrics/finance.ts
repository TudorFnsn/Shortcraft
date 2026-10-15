/**
 * Finance metrics: MRR, cost per video and gross margin, from data we already
 * store (`subscriptions`, `render_jobs.api_cost_usd`, paid ledger grants) plus
 * the plan catalog and `config/fixed-costs.ts`. Read by the Finance CFO routine
 * through `scripts/finance-report.mts`.
 *
 * Pure: the caller loads rows and passes `now`.
 *
 * Definitions:
 * - **MRR (net):** sum over live subscriptions of the plan's monthly price after
 *   VAT and Stripe fees, in USD (same assumptions as the margin gate).
 *   `mrrGrossEur` is the consumer price total, VAT included, for comparing with
 *   Stripe's own dashboard.
 * - **API cost (30d):** `api_cost_usd` summed over jobs created in the last 30
 *   days that reached `done`; failed jobs are reported separately as wasted
 *   spend (money spent, refunded to the user).
 * - **Contribution margin:** MRR net minus the API cost of the last 30 days,
 *   a proxy for the month, since subscription history isn't stored.
 */
import { PLANS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import type { FixedCost } from '@/config/fixed-costs';

export const DAY_MS = 86_400_000;

export interface FinanceJob {
  status: string;
  modelTier: string;
  targetDurationSec: number;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface FinanceInput {
  jobs: readonly FinanceJob[];
  subscriptions: readonly (SubscriptionSnapshot & { userId: string })[];
  /** Paid top-up purchases in the window, EUR cents (price of the pack). */
  topUpRevenueCents30d: number;
  fixedCosts: readonly FixedCost[];
  now: Date;
}

export interface TierCost {
  tier: string;
  videos: number;
  apiCostUsd: number;
  avgCostPerVideoUsd: number | null;
  avgCreditsPerVideo: number | null;
  /** Credits charged per API dollar spent; higher is better (gate wants ≥ 36,000/3). */
  creditsPerApiUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  payingSubscribers: number;
  byPlan: Record<string, number>;
  mrrGrossEur: number;
  mrrNetUsd: number;
  arrNetUsd: number;
  topUpNetUsd30d: number;
  apiCostDoneUsd30d: number;
  apiCostFailedUsd30d: number;
  byTier: TierCost[];
  fixedCostsUsd: number;
  fixedCostsUnconfirmed: string[];
  contributionMarginUsd: number;
  /** (MRR net + top-ups - API cost) / (MRR net + top-ups); null with no revenue. */
  grossMargin: number | null;
  /** Profit after fixed costs; only meaningful once fixed costs are confirmed. */
  monthlyProfitUsd: number;
  /** Subscribers needed at the blended ARPU to cover fixed costs + API cost. */
  breakEvenSubscribers: number | null;
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeFinance(input: FinanceInput): FinanceReport {
  const since = input.now.getTime() - 30 * DAY_MS;
  const byPlan: Record<string, number> = {};
  let mrrGrossCents = 0;
  let mrrNetUsd = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const plan = PLANS[s.planId];
    byPlan[plan.id] = (byPlan[plan.id] ?? 0) + 1;
    mrrGrossCents += plan.priceCents;
    mrrNetUsd += netRevenueUsd(plan.priceCents);
  }
  const payingSubscribers = Object.values(byPlan).reduce((a, b) => a + b, 0);

  const recent = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const done = recent.filter((j) => j.status === 'done');
  const failed = recent.filter((j) => j.status === 'failed');
  const sum = (js: readonly FinanceJob[], f: (j: FinanceJob) => number) =>
    js.reduce((a, j) => a + f(j), 0);

  const tiers = [...new Set(done.map((j) => j.modelTier))].sort();
  const byTier: TierCost[] = tiers.map((tier) => {
    const js = done.filter((j) => j.modelTier === tier);
    const cost = sum(js, (j) => j.apiCostUsd);
    const credits = sum(js, (j) => j.actualCredits);
    return {
      tier,
      videos: js.length,
      apiCostUsd: round(cost, 4),
      avgCostPerVideoUsd: js.length ? round(cost / js.length, 4) : null,
      avgCreditsPerVideo: js.length ? Math.round(credits / js.length) : null,
      creditsPerApiUsd: cost > 0 ? Math.round(credits / cost) : null,
    };
  });

  const topUpNetUsd30d = netRevenueUsd(input.topUpRevenueCents30d);
  const apiCostDoneUsd30d = sum(done, (j) => j.apiCostUsd);
  const apiCostFailedUsd30d = sum(failed, (j) => j.apiCostUsd);
  const revenue = mrrNetUsd + (input.topUpRevenueCents30d > 0 ? topUpNetUsd30d : 0);
  const apiCost = apiCostDoneUsd30d + apiCostFailedUsd30d;
  const fixed = input.fixedCosts.reduce((a, c) => a + c.usdPerMonth, 0);
  const arpu = payingSubscribers ? mrrNetUsd / payingSubscribers : 0;
  const apiPerSub = payingSubscribers ? apiCost / payingSubscribers : 0;
  const margin = arpu - apiPerSub;

  return {
    asOf: input.now.toISOString(),
    payingSubscribers,
    byPlan,
    mrrGrossEur: round(mrrGrossCents / 100),
    mrrNetUsd: round(mrrNetUsd),
    arrNetUsd: round(mrrNetUsd * 12),
    topUpNetUsd30d: round(topUpNetUsd30d),
    apiCostDoneUsd30d: round(apiCostDoneUsd30d, 4),
    apiCostFailedUsd30d: round(apiCostFailedUsd30d, 4),
    byTier,
    fixedCostsUsd: round(fixed),
    fixedCostsUnconfirmed: input.fixedCosts.filter((c) => !c.confirmed).map((c) => c.id),
    contributionMarginUsd: round(revenue - apiCost),
    grossMargin: revenue > 0 ? round((revenue - apiCost) / revenue, 3) : null,
    monthlyProfitUsd: round(revenue - apiCost - fixed),
    breakEvenSubscribers: margin > 0 ? Math.ceil(fixed / margin) : null,
  };
}
