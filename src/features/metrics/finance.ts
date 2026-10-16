/**
 * Finance metrics: MRR, net revenue, measured API spend, gross margin and
 * burn, from data we already store. Pure, like `north-star.ts`: the caller
 * loads rows (Supabase in `scripts/finance-report.mts`, fixtures in tests).
 *
 * Definitions:
 * - **MRR:** sum of list prices (EUR, VAT inclusive) of live subscriptions on
 *   plans we sell, as of `now`. **Net MRR** is what we keep (see `netRevenueUsd`).
 * - **Window:** the last 30 days, half-open `[now - 30d, now)`.
 * - **Variable cost:** `api_cost_usd` of every job created in the window,
 *   including failed ones (money spent on a refunded job is pure waste).
 * - **Gross margin:** (net MRR + net top-ups - variable cost) / (net MRR + net top-ups).
 *   Net MRR is a run-rate and the cost is a trailing window, so treat early
 *   numbers as indicative.
 * - Top-up revenue is recovered by matching granted credits to a pack.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';

const DAY_MS = 86_400_000;

export interface FinanceJob {
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  chargedCredits: number;
}

export interface FinanceTopUp {
  credits: number;
  createdAt: Date;
}

export interface FinanceInput {
  now: Date;
  subscriptions: SubscriptionSnapshot[];
  jobs: FinanceJob[];
  topUps: FinanceTopUp[];
  fixedMonthlyUsd: number;
}

export interface TierCost {
  tier: string;
  doneVideos: number;
  costUsd: number;
  avgCostPerVideoUsd: number | null;
  /** Credits users were charged per USD of API spend (higher = more margin). */
  creditsPerUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  payingSubscribers: number;
  mrrEur: number;
  netMrrUsd: number;
  topUpNetUsd30d: number;
  variableCostUsd30d: number;
  failedJobCostUsd30d: number;
  fixedCostUsd: number;
  grossMargin: number | null;
  /** (net MRR + net top-ups) / (variable + fixed cost); null with no cost. */
  revenueToCostRatio: number | null;
  /** Net profit run-rate for the window, USD. */
  netProfitUsd30d: number;
  /** Paying subscribers needed to cover fixed costs at the current average net MRR. */
  breakEvenSubscribers: number | null;
  byTier: TierCost[];
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now } = input;
  const start = now.getTime() - 30 * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= start && d.getTime() < now.getTime();

  let payingSubscribers = 0;
  let mrrEur = 0;
  let netMrrUsd = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    const plan = PLANS[sub.planId];
    payingSubscribers += 1;
    mrrEur += plan.priceCents / 100;
    netMrrUsd += netRevenueUsd(plan.priceCents);
  }

  let topUpNetUsd30d = 0;
  for (const t of input.topUps) {
    if (!inWindow(t.createdAt)) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (pack) topUpNetUsd30d += netRevenueUsd(pack.priceCents);
  }

  const tiers = new Map<string, { done: number; cost: number; credits: number }>();
  let variableCostUsd30d = 0;
  let failedJobCostUsd30d = 0;
  for (const job of input.jobs) {
    if (!inWindow(job.createdAt)) continue;
    variableCostUsd30d += job.apiCostUsd;
    if (job.status === 'failed') failedJobCostUsd30d += job.apiCostUsd;
    const t = tiers.get(job.modelTier) ?? { done: 0, cost: 0, credits: 0 };
    t.cost += job.apiCostUsd;
    if (job.status === 'done') {
      t.done += 1;
      t.credits += job.chargedCredits;
    }
    tiers.set(job.modelTier, t);
  }

  const revenue = netMrrUsd + topUpNetUsd30d;
  const totalCost = variableCostUsd30d + input.fixedMonthlyUsd;
  const avgNetPerSub = payingSubscribers > 0 ? netMrrUsd / payingSubscribers : null;
  const variablePerSub = payingSubscribers > 0 ? variableCostUsd30d / payingSubscribers : 0;

  return {
    asOf: now.toISOString(),
    payingSubscribers,
    mrrEur: round2(mrrEur),
    netMrrUsd: round2(netMrrUsd),
    topUpNetUsd30d: round2(topUpNetUsd30d),
    variableCostUsd30d: round2(variableCostUsd30d),
    failedJobCostUsd30d: round2(failedJobCostUsd30d),
    fixedCostUsd: round2(input.fixedMonthlyUsd),
    grossMargin: revenue > 0 ? (revenue - variableCostUsd30d) / revenue : null,
    revenueToCostRatio: totalCost > 0 ? revenue / totalCost : null,
    netProfitUsd30d: round2(revenue - totalCost),
    breakEvenSubscribers:
      avgNetPerSub !== null && avgNetPerSub > variablePerSub
        ? Math.ceil(input.fixedMonthlyUsd / (avgNetPerSub - variablePerSub))
        : null,
    byTier: [...tiers.entries()].map(([tier, t]) => ({
      tier,
      doneVideos: t.done,
      costUsd: round2(t.cost),
      avgCostPerVideoUsd: t.done > 0 ? round2(t.cost / t.done) : null,
      creditsPerUsd: t.cost > 0 ? Math.round(t.credits / t.cost) : null,
    })),
  };
}
