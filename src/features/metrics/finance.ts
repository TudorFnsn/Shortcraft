/**
 * Finance metrics: MRR, gross margin and cost per video, from data we already
 * store (`subscriptions`, `render_jobs.api_cost_usd`). Pure: the caller loads
 * rows (Supabase in `scripts/finance-report.mts`, fixtures in tests).
 *
 * Definitions:
 * - **MRR:** sum of list prices (EUR, VAT inclusive) of live subscriptions on
 *   plans we sell. Top-ups are not recurring and are reported separately.
 * - **Net MRR:** MRR after VAT and Stripe fees, in USD, with the same
 *   assumptions as the margin gate (`REVENUE_ASSUMPTIONS`).
 * - **COGS (variable):** `api_cost_usd` of jobs created in the window, finished
 *   or not: a failed job still burned provider money.
 * - **Wasted spend:** the part of COGS that sits on `failed` jobs.
 * - **Gross margin:** (net MRR - 30-day COGS) / net MRR. Fixed costs (hosting,
 *   ElevenLabs/Supabase plans) are passed in by the caller, never guessed.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';

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
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  now: Date;
  /** Monthly fixed costs in USD (hosting, DB, voice plan...). Unknown => 0 and flagged. */
  fixedCostsUsdPerMonth?: number;
  assumptions?: RevenueAssumptions;
}

export interface PlanRevenue {
  planId: PlanId;
  subscribers: number;
  mrrEur: number;
}

export interface TierCost {
  tier: string;
  jobs: number;
  doneJobs: number;
  costUsd: number;
  /** COGS per finished video (all spend, including failed jobs, divided by done). */
  costPerDoneVideoUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  payingSubscribers: number;
  mrrEur: number;
  netMrrUsd: number;
  arrEur: number;
  byPlan: PlanRevenue[];
  cogs30dUsd: number;
  wastedSpend30dUsd: number;
  byTier: TierCost[];
  /** null when there is no revenue to measure against. */
  grossMargin: number | null;
  /** Profit after fixed costs; null when fixed costs weren't supplied. */
  netProfitUsdPerMonth: number | null;
  /** Subscribers' API cost per paying user per month (all subscribers' jobs, 30d). */
  cogsPerPayingUserUsd: number | null;
  /** Share of 30d COGS caused by users with no live subscription (trial/free burn). */
  nonPayingCogsShare: number | null;
  notes: string[];
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Net USD of one EUR charge: VAT out, Stripe percent + fixed fee out, EUR to USD. */
export function netUsdOfEur(eur: number, a: RevenueAssumptions): number {
  const exVat = eur / (1 + a.vatRate);
  return (exVat - eur * a.stripePercentFee - a.stripeFixedFeeEur) * a.usdPerEur;
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const since = input.now.getTime() - 30 * DAY_MS;
  const notes: string[] = [];

  const live = input.subscriptions.filter((s) => isLiveSubscription(s));
  const byPlan = (Object.keys(PLANS) as PlanId[]).map((planId) => {
    const subscribers = live.filter((s) => s.planId === planId).length;
    return { planId, subscribers, mrrEur: round((subscribers * PLANS[planId].priceCents) / 100) };
  });
  const mrrEur = round(byPlan.reduce((n, p) => n + p.mrrEur, 0));
  const netMrrUsd = round(
    byPlan.reduce(
      (n, p) => n + p.subscribers * netUsdOfEur(PLANS[p.planId].priceCents / 100, a),
      0,
    ),
  );

  const payingIds = new Set(live.map((s) => s.userId));
  const recent = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const cogs = recent.reduce((n, j) => n + j.apiCostUsd, 0);
  const wasted = recent.filter((j) => j.status === 'failed').reduce((n, j) => n + j.apiCostUsd, 0);
  const nonPaying = recent
    .filter((j) => !payingIds.has(j.userId))
    .reduce((n, j) => n + j.apiCostUsd, 0);

  const tiers = [...new Set(recent.map((j) => j.modelTier))].sort();
  const byTier = tiers.map((tier) => {
    const js = recent.filter((j) => j.modelTier === tier);
    const done = js.filter((j) => j.status === 'done').length;
    const costUsd = js.reduce((n, j) => n + j.apiCostUsd, 0);
    return {
      tier,
      jobs: js.length,
      doneJobs: done,
      costUsd: round(costUsd, 4),
      costPerDoneVideoUsd: done > 0 ? round(costUsd / done, 4) : null,
    };
  });

  if (input.fixedCostsUsdPerMonth === undefined) {
    notes.push(
      'Fixed costs not supplied: net profit omitted. Pass --fixed-usd=<n> or set them in FinancePlan §6.',
    );
  }
  if (live.length === 0) notes.push('No paying subscribers: MRR is 0 and margin is undefined.');
  if (recent.some((j) => j.apiCostUsd === 0 && j.status === 'done')) {
    notes.push(
      'Some finished jobs have api_cost_usd = 0 (animated-stills tier is ~free by design; check others).',
    );
  }

  return {
    asOf: input.now.toISOString(),
    payingSubscribers: live.length,
    mrrEur,
    netMrrUsd,
    arrEur: round(mrrEur * 12),
    byPlan,
    cogs30dUsd: round(cogs, 4),
    wastedSpend30dUsd: round(wasted, 4),
    byTier,
    grossMargin: netMrrUsd > 0 ? round((netMrrUsd - cogs) / netMrrUsd, 4) : null,
    netProfitUsdPerMonth:
      input.fixedCostsUsdPerMonth === undefined
        ? null
        : round(netMrrUsd - cogs - input.fixedCostsUsdPerMonth),
    cogsPerPayingUserUsd: live.length > 0 ? round(cogs / live.length, 4) : null,
    nonPayingCogsShare: cogs > 0 ? round(nonPaying / cogs, 4) : null,
    notes,
  };
}
