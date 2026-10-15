/**
 * Unit economics for the Finance routine: MRR, what we pay to serve it, and
 * the cash left over. Pure: the caller loads rows (Supabase in
 * `scripts/finance-report.mts`, fixtures in tests) and passes `now`.
 *
 * Definitions:
 * - **MRR:** sum of list prices (EUR, VAT included) of live subscriptions on
 *   plans we sell, as of `now`. Annual plans would count at price / 12.
 * - **Net MRR:** MRR after VAT and Stripe fees (`REVENUE_ASSUMPTIONS`), in USD.
 * - **Variable cost:** `render_jobs.api_cost_usd` (script, images, clips,
 *   voice, render) for jobs created in the window. Failed jobs count: we paid
 *   the provider even though the user was refunded.
 * - **Fixed cost:** monthly vendor bills passed in by the owner (hosting, DB,
 *   email, voice plan). Unknown = null, and the cash number is withheld.
 */
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { PLANS } from '@/config/plans';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;

export interface FinanceSubscription extends SubscriptionSnapshot {
  userId: string;
}

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  apiCostUsd: number;
  createdAt: Date;
}

export interface FinanceInput {
  now: Date;
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  /** Users who have ever paid (subscription grant or top-up). */
  payerIds: ReadonlySet<string>;
  /** Top-up revenue in the window, EUR cents (VAT inclusive). */
  topUpCents: number;
  /** Fixed monthly vendor bills in USD; null = not provided yet. */
  fixedMonthlyUsd: number | null;
  windowDays?: number;
}

export interface TierCost {
  videos: number;
  costUsd: number;
  avgCostUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  mrrEur: number;
  netMrrUsd: number;
  arpuEur: number | null;
  payingSubscribers: number;
  subscribersByPlan: Record<string, number>;
  /** Net top-up revenue scaled to 30 days, USD. */
  netTopUpMonthlyUsd: number;
  variableCostUsd: number;
  /** Variable cost scaled to 30 days, to compare with monthly revenue. */
  variableCostMonthlyUsd: number;
  failedJobCostUsd: number;
  byTier: Record<string, TierCost>;
  /** Share of variable cost spent on users who never paid (trial burn). */
  freeUserCostShare: number | null;
  /** (net revenue - variable cost) / net revenue, monthly. */
  grossMargin: number | null;
  /** Net revenue - variable - fixed, USD per 30 days; null without fixed costs. */
  monthlyCashUsd: number | null;
  /** Net revenue / (variable + fixed): the "MRR ratio". Above 1 = profitable. */
  mrrCostRatio: number | null;
}

/** EUR cents (VAT inclusive) -> net USD after VAT and Stripe fees. */
export function netUsdFromGrossCents(cents: number, charges = 1): number {
  const a = REVENUE_ASSUMPTIONS;
  const eur = cents / 100 / (1 + a.vatRate);
  return (eur - eur * a.stripePercentFee - a.stripeFixedFeeEur * charges) * a.usdPerEur;
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * DAY_MS;
  const scale = 30 / windowDays;

  const subscribersByPlan: Record<string, number> = {};
  let mrrCents = 0;
  let netMrrUsd = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const cents = PLANS[s.planId].priceCents;
    mrrCents += cents;
    netMrrUsd += netUsdFromGrossCents(cents);
    subscribersByPlan[s.planId] = (subscribersByPlan[s.planId] ?? 0) + 1;
  }
  const payingSubscribers = Object.values(subscribersByPlan).reduce((a, b) => a + b, 0);

  const byTier: Record<string, TierCost> = {};
  let variableCostUsd = 0;
  let failedJobCostUsd = 0;
  let freeCostUsd = 0;
  for (const j of input.jobs) {
    if (j.createdAt.getTime() < since) continue;
    variableCostUsd += j.apiCostUsd;
    if (j.status === 'failed') failedJobCostUsd += j.apiCostUsd;
    if (!input.payerIds.has(j.userId)) freeCostUsd += j.apiCostUsd;
    const t = (byTier[j.modelTier] ??= { videos: 0, costUsd: 0, avgCostUsd: null });
    if (j.status === 'done') t.videos += 1;
    t.costUsd += j.apiCostUsd;
  }
  for (const t of Object.values(byTier)) {
    t.avgCostUsd = t.videos > 0 ? t.costUsd / t.videos : null;
  }

  const netTopUpMonthlyUsd =
    input.topUpCents > 0 ? netUsdFromGrossCents(input.topUpCents) * scale : 0;
  const netRevenueUsd = netMrrUsd + netTopUpMonthlyUsd;
  const variableCostMonthlyUsd = variableCostUsd * scale;
  const totalCost =
    input.fixedMonthlyUsd === null ? null : variableCostMonthlyUsd + input.fixedMonthlyUsd;

  return {
    asOf: input.now.toISOString(),
    windowDays,
    mrrEur: mrrCents / 100,
    netMrrUsd,
    arpuEur: payingSubscribers > 0 ? mrrCents / 100 / payingSubscribers : null,
    payingSubscribers,
    subscribersByPlan,
    netTopUpMonthlyUsd,
    variableCostUsd,
    variableCostMonthlyUsd,
    failedJobCostUsd,
    byTier,
    freeUserCostShare: variableCostUsd > 0 ? freeCostUsd / variableCostUsd : null,
    grossMargin:
      netRevenueUsd > 0 ? (netRevenueUsd - variableCostMonthlyUsd) / netRevenueUsd : null,
    monthlyCashUsd: totalCost === null ? null : netRevenueUsd - totalCost,
    mrrCostRatio: totalCost !== null && totalCost > 0 ? netRevenueUsd / totalCost : null,
  };
}
