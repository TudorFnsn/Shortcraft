/**
 * Unit economics for the Finance routine: MRR, what a finished video really
 * costs us, spend wasted on failed jobs, and cash left after fixed costs.
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`, so every number is reproducible.
 *
 * Definitions:
 * - **MRR:** sum of list prices of live subscriptions (`isLiveSubscription`)
 *   as of `now`, in EUR; `mrrNetUsd` is the same after VAT + Stripe fees.
 * - **Top-up revenue:** paid `topup` ledger grants in the window, matched to a
 *   pack by credits (a grant that matches no pack is counted in `unmatched`).
 * - **Variable cost:** `render_jobs.api_cost_usd` of jobs created in the
 *   window. This is usage × catalog list price, NOT a provider invoice; the
 *   report says so and `invoiceGapUsd` shows the difference once invoices are
 *   supplied.
 * - **Wasted cost:** `api_cost_usd` of jobs that ended `failed` (refunded to
 *   the user, still paid to the provider).
 */
import { FIXED_COSTS, type FixedCost } from '@/config/fixed-costs';
import { PLANS, TOPUP_PACKS, type PlanId } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';

export const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export interface FinanceSubscription extends SubscriptionSnapshot {
  userId: string;
}

export interface FinanceJob {
  status: string;
  modelTier: string;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

/** A ledger row with reason `topup`. */
export interface FinanceTopUpGrant {
  credits: number;
  createdAt: Date;
}

export interface FinanceInput {
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  topUps: readonly FinanceTopUpGrant[];
  now: Date;
  fixedCosts?: readonly FixedCost[];
  /** Real provider invoices for the window, USD, when the owner supplies them. */
  invoicedUsd?: number | null;
}

export interface TierEconomics {
  videos: number;
  avgCostUsd: number | null;
  avgCredits: number | null;
  /** USD of API cost per 1,000 credits charged. */
  costPer1kCreditsUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  subscribersByPlan: Record<PlanId, number>;
  mrrEur: number;
  arrEur: number;
  mrrNetUsd: number;
  topUpNetUsd: number;
  topUpUnmatched: number;
  netRevenueUsd: number;
  variableCostUsd: number;
  wastedCostUsd: number;
  videosFinished: number;
  failedJobs: number;
  tiers: Record<'standard' | 'premium', TierEconomics>;
  fixedCostUsd: number;
  fixedCostGaps: string[];
  /** (net revenue − variable cost) / net revenue; null with no revenue. */
  grossMargin: number | null;
  /** Net revenue − variable − fixed cost. */
  cashAfterCostsUsd: number;
  /** Paying subscribers needed for MRR to cover fixed costs, at today's mix. */
  breakEvenSubscribers: number | null;
  invoiceGapUsd: number | null;
}

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;
const emptyTier = (): TierEconomics => ({
  videos: 0,
  avgCostUsd: null,
  avgCredits: null,
  costPer1kCreditsUsd: null,
});

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now } = input;
  const since = now.getTime() - WINDOW_DAYS * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= since && d.getTime() < now.getTime();

  const subscribersByPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  let mrrCents = 0;
  let mrrNetUsd = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const plan = PLANS[s.planId as PlanId];
    if (!plan) continue;
    subscribersByPlan[plan.id] += 1;
    mrrCents += plan.priceCents;
    mrrNetUsd += netRevenueUsd(plan.priceCents);
  }
  const payingSubscribers = Object.values(subscribersByPlan).reduce((a, b) => a + b, 0);

  let topUpNetUsd = 0;
  let topUpUnmatched = 0;
  for (const t of input.topUps) {
    if (!inWindow(t.createdAt)) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (pack) topUpNetUsd += netRevenueUsd(pack.priceCents);
    else topUpUnmatched += 1;
  }

  const tiers = { standard: emptyTier(), premium: emptyTier() };
  const sums = {
    standard: { cost: 0, credits: 0 },
    premium: { cost: 0, credits: 0 },
  };
  let variableCostUsd = 0;
  let wastedCostUsd = 0;
  let failedJobs = 0;
  let videosFinished = 0;
  for (const j of input.jobs) {
    if (!inWindow(j.createdAt)) continue;
    variableCostUsd += j.apiCostUsd;
    if (j.status === 'failed') {
      failedJobs += 1;
      wastedCostUsd += j.apiCostUsd;
    }
    if (j.status !== 'done') continue;
    videosFinished += 1;
    const key = j.modelTier === 'premium' ? 'premium' : 'standard';
    tiers[key].videos += 1;
    sums[key].cost += j.apiCostUsd;
    sums[key].credits += j.actualCredits;
  }
  for (const key of ['standard', 'premium'] as const) {
    const t = tiers[key];
    if (t.videos === 0) continue;
    t.avgCostUsd = round(sums[key].cost / t.videos);
    t.avgCredits = Math.round(sums[key].credits / t.videos);
    t.costPer1kCreditsUsd =
      sums[key].credits > 0 ? round((sums[key].cost / sums[key].credits) * 1000) : null;
  }

  const fixed = input.fixedCosts ?? FIXED_COSTS;
  const fixedCostUsd = fixed.reduce((a, c) => a + (c.monthlyUsd ?? 0), 0);
  const fixedCostGaps = fixed.filter((c) => c.monthlyUsd === null).map((c) => c.label);

  const netRevenue = mrrNetUsd + topUpNetUsd;
  const avgNetPerSub = payingSubscribers > 0 ? mrrNetUsd / payingSubscribers : null;
  return {
    asOf: now.toISOString(),
    windowDays: WINDOW_DAYS,
    payingSubscribers,
    subscribersByPlan,
    mrrEur: round(mrrCents / 100, 2),
    arrEur: round((mrrCents / 100) * 12, 2),
    mrrNetUsd: round(mrrNetUsd, 2),
    topUpNetUsd: round(topUpNetUsd, 2),
    topUpUnmatched,
    netRevenueUsd: round(netRevenue, 2),
    variableCostUsd: round(variableCostUsd, 2),
    wastedCostUsd: round(wastedCostUsd, 2),
    videosFinished,
    failedJobs,
    tiers,
    fixedCostUsd: round(fixedCostUsd, 2),
    fixedCostGaps,
    grossMargin: netRevenue > 0 ? round((netRevenue - variableCostUsd) / netRevenue, 3) : null,
    cashAfterCostsUsd: round(netRevenue - variableCostUsd - fixedCostUsd, 2),
    breakEvenSubscribers:
      avgNetPerSub && avgNetPerSub > 0 ? Math.ceil(fixedCostUsd / avgNetPerSub) : null,
    invoiceGapUsd: input.invoicedUsd == null ? null : round(input.invoicedUsd - variableCostUsd, 2),
  };
}

export const formatPct = (r: number | null) => (r === null ? 'n/a' : `${(r * 100).toFixed(1)}%`);
