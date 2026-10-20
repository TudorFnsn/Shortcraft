/**
 * Finance snapshot: MRR, net revenue vs the API cost we actually metered, and
 * cash-return ratios, from data we already store (`subscriptions`,
 * `render_jobs.api_cost_usd` / `charged_credits`). No analytics vendor, no new
 * tables. Feeds the Finance CEO routine (`FinancePlan.md`).
 *
 * Pure: the caller loads rows and passes `now`, so every number is reproducible.
 *
 * Definitions:
 * - **MRR:** sum of the list price of every live subscription on a plan we sell
 *   (monthly-equivalent; yearly prices are not sold yet), in EUR cents. Net MRR
 *   removes VAT and Stripe fees with the margin gate's own assumptions, in USD.
 * - **Metered cost:** `render_jobs.api_cost_usd` of jobs created in the window,
 *   whatever their final status: a failed job still spent provider money.
 * - **Cost per finished video:** metered cost of ALL jobs ÷ jobs that reached
 *   `done`, so failures are charged to the videos that did ship.
 * - **Gross margin (window):** (net MRR − metered cost) ÷ net MRR. Net MRR is a
 *   monthly figure, so the window is the last 30 days; top-up income is not in
 *   it (no per-sale record), which understates margin, never overstates it.
 * - **Burn per credit:** metered cost ÷ credits charged. Compare with
 *   `1 / REVOICE_CREDITS_PER_USD`-style scales in `config/models.ts`.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { netRevenueUsd, TARGET_MARGIN_MULTIPLE } from '@/features/billing/margin';

export const FINANCE_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export interface FinanceSubscription {
  planId: string;
  status: string;
}

export interface FinanceJob {
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  chargedCredits: number;
}

export interface FinanceInput {
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  now: Date;
}

export interface TierCost {
  jobs: number;
  done: number;
  costUsd: number;
  credits: number;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  subscribersByPlan: Record<PlanId, number>;
  /** Monthly recurring revenue, gross EUR cents (VAT included). */
  mrrEurCents: number;
  /** MRR after VAT and Stripe fees, USD. */
  netMrrUsd: number;
  /** Average net revenue per paying subscriber, USD per month. */
  arpuUsd: number | null;
  jobs: number;
  jobsDone: number;
  meteredCostUsd: number;
  chargedCredits: number;
  costPerFinishedVideoUsd: number | null;
  /** Metered cost per credit charged, USD. */
  burnUsdPerCredit: number | null;
  /** (net MRR − metered cost) ÷ net MRR, or null with no MRR. */
  grossMargin: number | null;
  /** net MRR ÷ metered cost, or null with no cost. Gate target: TARGET_MARGIN_MULTIPLE. */
  revenueToCost: number | null;
  belowTarget: boolean;
  byTier: Record<string, TierCost>;
}

const round = (n: number, dp: number) => Number(n.toFixed(dp));

export function computeFinance(input: FinanceInput): FinanceReport {
  const since = input.now.getTime() - FINANCE_WINDOW_DAYS * DAY_MS;

  const subscribersByPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  let mrrEurCents = 0;
  let netMrrUsd = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    subscribersByPlan[sub.planId] += 1;
    mrrEurCents += PLANS[sub.planId].priceCents;
    netMrrUsd += netRevenueUsd(PLANS[sub.planId].priceCents);
  }
  const payingSubscribers = Object.values(subscribersByPlan).reduce((a, b) => a + b, 0);

  const byTier: Record<string, TierCost> = {};
  let jobs = 0;
  let jobsDone = 0;
  let meteredCostUsd = 0;
  let chargedCredits = 0;
  for (const job of input.jobs) {
    const t = job.createdAt.getTime();
    if (t < since || t >= input.now.getTime()) continue;
    const tier = (byTier[job.modelTier] ??= { jobs: 0, done: 0, costUsd: 0, credits: 0 });
    jobs += 1;
    tier.jobs += 1;
    meteredCostUsd += job.apiCostUsd;
    tier.costUsd += job.apiCostUsd;
    chargedCredits += job.chargedCredits;
    tier.credits += job.chargedCredits;
    if (job.status === 'done') {
      jobsDone += 1;
      tier.done += 1;
    }
  }
  for (const tier of Object.values(byTier)) tier.costUsd = round(tier.costUsd, 4);

  const revenueToCost = meteredCostUsd > 0 ? netMrrUsd / meteredCostUsd : null;
  return {
    asOf: input.now.toISOString(),
    windowDays: FINANCE_WINDOW_DAYS,
    payingSubscribers,
    subscribersByPlan,
    mrrEurCents,
    netMrrUsd: round(netMrrUsd, 2),
    arpuUsd: payingSubscribers > 0 ? round(netMrrUsd / payingSubscribers, 2) : null,
    jobs,
    jobsDone,
    meteredCostUsd: round(meteredCostUsd, 4),
    chargedCredits,
    costPerFinishedVideoUsd: jobsDone > 0 ? round(meteredCostUsd / jobsDone, 4) : null,
    burnUsdPerCredit: chargedCredits > 0 ? round(meteredCostUsd / chargedCredits, 6) : null,
    grossMargin: netMrrUsd > 0 ? round((netMrrUsd - meteredCostUsd) / netMrrUsd, 4) : null,
    revenueToCost: revenueToCost === null ? null : round(revenueToCost, 2),
    belowTarget: revenueToCost !== null && revenueToCost < TARGET_MARGIN_MULTIPLE,
    byTier,
  };
}
