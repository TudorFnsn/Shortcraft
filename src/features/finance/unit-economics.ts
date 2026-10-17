/**
 * Unit economics from data we already store: MRR, API spend, gross margin and
 * cash collected. Pure: the caller loads rows (Supabase in
 * `scripts/finance-report.mts`, fixtures in tests) and passes the window.
 *
 * Definitions (money in USD unless a name says EUR):
 * - **MRR:** list price of every live subscription (`active`/`trialing`/
 *   `past_due`) on a plan we sell, converted at `usdPerEur`. A `trialing`
 *   subscription counts, as it does for `isLiveSubscription`.
 * - **Net MRR:** MRR after VAT and Stripe fees (same assumptions as the margin gate).
 * - **API spend:** `render_jobs.api_cost_usd` summed over jobs created in the window.
 * - **Cash in:** list price of paid credit grants (`monthly_grant` rows are
 *   subscription renewals; `topup` rows need the pack, so they are priced by
 *   credits granted, matched to a pack).
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';

/** A subscription row; `userId` lets spend be split paying vs. not. */
export interface FinanceSubscription extends SubscriptionSnapshot {
  userId?: string;
}

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  apiCostUsd: number;
  createdAt: Date;
}

export interface FinanceGrant {
  reason: string;
  delta: number;
  createdAt: Date;
}

export interface FinanceInput {
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  grants: readonly FinanceGrant[];
  /** Window start (inclusive) and end (exclusive), UTC. */
  from: Date;
  to: Date;
  assumptions?: RevenueAssumptions;
}

export interface FinanceReport {
  mrrEur: number;
  mrrUsd: number;
  netMrrUsd: number;
  subscribersByPlan: Record<string, number>;
  arpuEur: number | null;
  topUpCashEur: number;
  jobsInWindow: number;
  jobsDone: number;
  apiSpendUsd: number;
  spendByTierUsd: Record<string, number>;
  /** Spend on jobs that never finished (paid for, nothing delivered). */
  wastedSpendUsd: number;
  avgCostPerDoneVideoUsd: number | null;
  /** Net MRR ÷ projected monthly API spend; null when nothing was spent. */
  coverage: number | null;
  /** Share of window API spend caused by users with no live subscription. */
  freeUserSpendShare: number | null;
}

const netPerEur = (a: RevenueAssumptions, eur: number): number =>
  (eur / (1 + a.vatRate) - (eur * a.stripePercentFee + a.stripeFixedFeeEur)) * a.usdPerEur;

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const inWindow = (d: Date) => d >= input.from && d < input.to;

  const subscribersByPlan: Record<string, number> = {};
  let mrrCents = 0;
  let netMrrUsd = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const plan = PLANS[s.planId];
    subscribersByPlan[plan.id] = (subscribersByPlan[plan.id] ?? 0) + 1;
    mrrCents += plan.priceCents;
    netMrrUsd += netPerEur(a, plan.priceCents / 100);
  }
  const subscribers = sum(Object.values(subscribersByPlan));
  const mrrEur = mrrCents / 100;

  let topUpCashEur = 0;
  for (const g of input.grants) {
    if (g.reason !== 'topup' || !inWindow(g.createdAt)) continue;
    topUpCashEur += (TOPUP_PACKS.find((p) => p.credits === g.delta)?.priceCents ?? 0) / 100;
  }

  const jobs = input.jobs.filter((j) => inWindow(j.createdAt));
  const done = jobs.filter((j) => j.status === 'done');
  const apiSpendUsd = sum(jobs.map((j) => j.apiCostUsd));
  const spendByTierUsd: Record<string, number> = {};
  for (const j of jobs) {
    spendByTierUsd[j.modelTier] = (spendByTierUsd[j.modelTier] ?? 0) + j.apiCostUsd;
  }
  const wastedSpendUsd = sum(jobs.filter((j) => j.status === 'failed').map((j) => j.apiCostUsd));

  const windowDays = (input.to.getTime() - input.from.getTime()) / 86_400_000;
  const monthlySpend = windowDays > 0 ? (apiSpendUsd / windowDays) * 30 : 0;

  // The split needs every subscription to carry a user id; otherwise it is unknown.
  const idsKnown = input.subscriptions.length > 0 && input.subscriptions.every((s) => s.userId);
  const payingIds = new Set<string>();
  for (const s of input.subscriptions) {
    const id = s.userId;
    if (id && isLiveSubscription(s)) payingIds.add(id);
  }
  const freeSpend = sum(jobs.filter((j) => !payingIds.has(j.userId)).map((j) => j.apiCostUsd));

  return {
    mrrEur,
    mrrUsd: mrrEur * a.usdPerEur,
    netMrrUsd,
    subscribersByPlan,
    arpuEur: subscribers > 0 ? mrrEur / subscribers : null,
    topUpCashEur,
    jobsInWindow: jobs.length,
    jobsDone: done.length,
    apiSpendUsd,
    spendByTierUsd,
    wastedSpendUsd,
    avgCostPerDoneVideoUsd:
      done.length > 0 ? sum(done.map((j) => j.apiCostUsd)) / done.length : null,
    coverage: monthlySpend > 0 ? netMrrUsd / monthlySpend : null,
    freeUserSpendShare: idsKnown && apiSpendUsd > 0 ? freeSpend / apiSpendUsd : null,
  };
}
