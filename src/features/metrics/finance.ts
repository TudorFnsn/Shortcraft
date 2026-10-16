/**
 * Finance metrics: MRR, realized gross margin and what a video really costs us,
 * from data we already store (`subscriptions`, `render_jobs.api_cost_usd`,
 * `actual_credits`). Owned by the Finance CFO routine (FinancePlan.md).
 *
 * Pure: the caller loads rows and passes `now`. Money in USD unless a name says
 * otherwise; plan prices are EUR and converted with the margin gate's own
 * assumptions so the two reports agree.
 *
 * - **MRR:** live subscriptions (`isLiveSubscription`) at list price, net of VAT
 *   (what we keep before Stripe's fee). Top-ups are one-off, so they are reported
 *   separately and never counted as recurring.
 * - **Per-video cost:** over `done` jobs only; failed jobs are reported as waste.
 * - **Realized markup:** credits charged ÷ (API cost × 12,000 credits/$). The
 *   margin gate's worst-case ratio is a floor; this is what actually happened.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';

export interface FinanceJob {
  status: string;
  modelTier: string;
  targetDurationSec: number;
  actualCredits: number;
  apiCostUsd: number;
  createdAt: Date;
}

export interface FinanceInput {
  subscriptions: readonly SubscriptionSnapshot[];
  jobs: readonly FinanceJob[];
  /** Gross EUR cents of top-up purchases in the window (from Stripe, optional). */
  topUpGrossCents?: number;
  now: Date;
  /** Job window in days (default 30). */
  windowDays?: number;
  assumptions?: RevenueAssumptions;
}

export interface TierCost {
  tier: string;
  videos: number;
  avgCostUsd: number;
  avgCredits: number;
  totalCostUsd: number;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  subscribersByPlan: Record<PlanId, number>;
  /** Recurring revenue, EUR/month, VAT-inclusive list price. */
  mrrGrossEur: number;
  /** Recurring revenue net of VAT, USD/month. */
  mrrNetUsd: number;
  arrNetUsd: number;
  videosDone: number;
  videosFailed: number;
  /** API spend on failed jobs, USD (pure waste). */
  failedCostUsd: number;
  totalApiCostUsd: number;
  byTier: TierCost[];
  /** MRR minus the window's API spend scaled to a month; null with no subscribers. */
  grossMarginMonthly: { revenueUsd: number; apiCostUsd: number; marginPct: number | null };
  /** Share of MRR that metered API cost eats (lower is better). */
  apiCostShareOfMrr: number | null;
  /** Credits charged ÷ (cost × 12,000); null with no cost data. */
  realizedMarkup: number | null;
}

const CREDITS_PER_USD_FLOOR = 12_000;
const DAY_MS = 86_400_000;
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Net-of-VAT USD for a EUR cent amount (no processor fee: that is per charge). */
function netUsd(cents: number, a: RevenueAssumptions): number {
  return (cents / 100 / (1 + a.vatRate)) * a.usdPerEur;
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * DAY_MS;

  const subscribersByPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  let mrrCents = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    subscribersByPlan[s.planId] += 1;
    mrrCents += PLANS[s.planId].priceCents;
  }
  const payingSubscribers = Object.values(subscribersByPlan).reduce((x, y) => x + y, 0);
  const mrrNetUsd = netUsd(mrrCents, a);

  const jobs = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const done = jobs.filter((j) => j.status === 'done');
  const failed = jobs.filter((j) => j.status === 'failed');
  const sum = (xs: readonly FinanceJob[], f: (j: FinanceJob) => number) =>
    xs.reduce((t, j) => t + f(j), 0);

  const tiers = [...new Set(done.map((j) => j.modelTier))].sort();
  const byTier = tiers.map((tier): TierCost => {
    const t = done.filter((j) => j.modelTier === tier);
    const cost = sum(t, (j) => j.apiCostUsd);
    return {
      tier,
      videos: t.length,
      avgCostUsd: round(cost / t.length, 4),
      avgCredits: Math.round(sum(t, (j) => j.actualCredits) / t.length),
      totalCostUsd: round(cost, 4),
    };
  });

  const totalApiCostUsd = sum(jobs, (j) => j.apiCostUsd);
  const monthlyApiCost = totalApiCostUsd * (30 / windowDays);
  const doneCost = sum(done, (j) => j.apiCostUsd);
  const doneCredits = sum(done, (j) => j.actualCredits);

  return {
    asOf: input.now.toISOString(),
    windowDays,
    payingSubscribers,
    subscribersByPlan,
    mrrGrossEur: round(mrrCents / 100),
    mrrNetUsd: round(mrrNetUsd),
    arrNetUsd: round(mrrNetUsd * 12),
    videosDone: done.length,
    videosFailed: failed.length,
    failedCostUsd: round(
      sum(failed, (j) => j.apiCostUsd),
      4,
    ),
    totalApiCostUsd: round(totalApiCostUsd, 4),
    byTier,
    grossMarginMonthly: {
      revenueUsd: round(mrrNetUsd),
      apiCostUsd: round(monthlyApiCost),
      marginPct: mrrNetUsd > 0 ? round(((mrrNetUsd - monthlyApiCost) / mrrNetUsd) * 100, 1) : null,
    },
    apiCostShareOfMrr: mrrNetUsd > 0 ? round(monthlyApiCost / mrrNetUsd, 3) : null,
    realizedMarkup:
      doneCost > 0 ? round(doneCredits / (doneCost * CREDITS_PER_USD_FLOOR), 2) : null,
  };
}
