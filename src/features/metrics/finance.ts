/**
 * Finance metrics: MRR and realized unit economics, from data we already
 * store (subscriptions, render_jobs, credit ledger). Same shape as
 * `north-star.ts`: pure, the caller loads rows and passes `now`.
 *
 * Definitions:
 * - **MRR:** sum of the monthly list price of every live subscription on a
 *   plan we sell (gross, VAT inclusive, EUR). `netMrrUsd` removes VAT and
 *   Stripe's percentage fee using the margin gate's `REVENUE_ASSUMPTIONS`,
 *   so the two files can never disagree about what a euro is worth.
 * - **Realized API cost:** `render_jobs.api_cost_usd`, which the orchestrator
 *   meters as each step runs. Failed jobs count: the provider bills them too.
 * - **Realized multiple (jobs):** credits charged on finished videos priced at
 *   the cheapest plan's USD value per credit, divided by their API cost.
 * - **Burn:** API cost over the window ÷ net MRR. Above 1 means the cost of
 *   serving customers exceeds what they pay each month.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';

export const DAY_MS = 86_400_000;

export interface FinanceJob {
  status: string;
  createdAt: Date;
  actualCredits: number;
  apiCostUsd: number;
  modelTier: string;
}

export interface FinanceInput {
  subscriptions: readonly SubscriptionSnapshot[];
  jobs: readonly FinanceJob[];
  now: Date;
  /** Fixed monthly spend we pay regardless of usage (hosting, ElevenLabs plan, ...), USD. */
  fixedMonthlyCostUsd?: number;
  windowDays?: number;
}

export interface TierEconomics {
  videos: number;
  apiCostUsd: number;
  avgCostPerVideoUsd: number | null;
  creditsCharged: number;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  mrrEur: number;
  netMrrUsd: number;
  subscribersByPlan: Record<PlanId, number>;
  arpuEur: number | null;
  jobsInWindow: number;
  apiCostUsd: number;
  /** Cost of jobs that ended `failed` (money spent, nothing delivered). */
  failedCostUsd: number;
  byTier: Record<'standard' | 'premium', TierEconomics>;
  fixedMonthlyCostUsd: number;
  /** (API cost scaled to 30 days + fixed costs) ÷ net MRR; null when MRR is 0. */
  burnRatio: number | null;
  /** Net MRR minus scaled API cost minus fixed costs, USD per 30 days. */
  monthlyContributionUsd: number;
}

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Net USD from one EUR of VAT-inclusive consumer price, after VAT and Stripe's % fee. */
export function netUsdPerGrossEur(a = REVENUE_ASSUMPTIONS): number {
  return (1 / (1 + a.vatRate)) * (1 - a.stripePercentFee) * a.usdPerEur;
}

const emptyTier = (): TierEconomics => ({
  videos: 0,
  apiCostUsd: 0,
  avgCostPerVideoUsd: null,
  creditsCharged: 0,
});

export function computeFinance(input: FinanceInput): FinanceReport {
  const windowDays = input.windowDays ?? 30;
  const fixed = input.fixedMonthlyCostUsd ?? 0;
  const since = input.now.getTime() - windowDays * DAY_MS;

  const subscribersByPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  let mrrCents = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    subscribersByPlan[sub.planId] += 1;
    mrrCents += PLANS[sub.planId].priceCents;
  }
  const subscribers = Object.values(subscribersByPlan).reduce((a, b) => a + b, 0);
  const mrrEur = mrrCents / 100;
  const netMrrUsd = mrrEur * netUsdPerGrossEur();

  const byTier = { standard: emptyTier(), premium: emptyTier() };
  let apiCostUsd = 0;
  let failedCostUsd = 0;
  let jobsInWindow = 0;
  for (const job of input.jobs) {
    const t = job.createdAt.getTime();
    if (t < since || t >= input.now.getTime()) continue;
    jobsInWindow += 1;
    apiCostUsd += job.apiCostUsd;
    if (job.status === 'failed') failedCostUsd += job.apiCostUsd;
    if (job.status !== 'done') continue;
    const tier = job.modelTier === 'premium' ? byTier.premium : byTier.standard;
    tier.videos += 1;
    tier.apiCostUsd += job.apiCostUsd;
    tier.creditsCharged += job.actualCredits;
  }
  for (const tier of Object.values(byTier)) {
    tier.avgCostPerVideoUsd = tier.videos ? round(tier.apiCostUsd / tier.videos) : null;
    tier.apiCostUsd = round(tier.apiCostUsd);
  }

  const scaledCost = (apiCostUsd / windowDays) * 30;
  const totalCost = scaledCost + fixed;
  return {
    asOf: input.now.toISOString(),
    windowDays,
    mrrEur: round(mrrEur, 2),
    netMrrUsd: round(netMrrUsd, 2),
    subscribersByPlan,
    arpuEur: subscribers ? round(mrrEur / subscribers, 2) : null,
    jobsInWindow,
    apiCostUsd: round(apiCostUsd),
    failedCostUsd: round(failedCostUsd),
    byTier,
    fixedMonthlyCostUsd: fixed,
    burnRatio: netMrrUsd > 0 ? round(totalCost / netMrrUsd, 3) : null,
    monthlyContributionUsd: round(netMrrUsd - totalCost, 2),
  };
}
