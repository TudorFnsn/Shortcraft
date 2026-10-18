/**
 * Finance report math: MRR, cost per finished video, credits burned vs API
 * dollars spent, and realized margin per tier, from rows we already store
 * (`subscriptions`, `render_jobs`). No vendor, no new tables.
 *
 * Pure: callers load rows (Supabase in `scripts/finance-report.mts`, fixtures
 * in tests) and pass `now`.
 *
 * Definitions:
 * - **MRR (internal):** live subscriptions (`isLiveSubscription`) × the plan's
 *   list price, in EUR. It ignores coupons, tax and FX, so the Stripe figure
 *   wins when the two disagree; a large gap means a plan/price drift.
 * - **API cost:** `render_jobs.api_cost_usd` (real usage × catalog list prices,
 *   NOT provider invoices; reconcile against the dashboards monthly).
 * - **Cost per video:** mean `api_cost_usd` of `done` jobs, by tier.
 * - **Waste:** `api_cost_usd` of `failed` jobs (money spent on refunded jobs).
 * - **Realized $/credit:** API dollars ÷ credits charged on done jobs. The
 *   margin gate assumes plans yield ≥ 3x; this shows what usage really costs.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';

export const DAY_MS = 86_400_000;

export interface FinanceJob {
  status: string;
  modelTier: string;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface FinanceInput {
  now: Date;
  subscriptions: SubscriptionSnapshot[];
  jobs: FinanceJob[];
  /** Monthly fixed costs in USD (hosting, Supabase, tools), supplied by the owner. */
  fixedMonthlyUsd: number;
  usdPerEur: number;
  windowDays: number;
}

export interface TierEconomics {
  tier: string;
  doneJobs: number;
  avgApiCostUsd: number;
  avgCredits: number;
  /** API dollars per 1,000 credits charged. */
  usdPer1kCredits: number;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  mrrEur: number;
  payingSubscribers: number;
  byPlan: Record<string, { subscribers: number; mrrEur: number }>;
  apiSpendUsd: number;
  wasteUsd: number;
  failedJobs: number;
  tiers: TierEconomics[];
  /** Window API spend scaled to 30 days. */
  apiSpendPer30dUsd: number;
  fixedMonthlyUsd: number;
  /** MRR (USD) − 30-day API spend − fixed costs. Negative = burning cash. */
  monthlyContributionUsd: number;
  /** MRR (USD) ÷ (API + fixed). Below 1 the app loses money. */
  coverage: number | null;
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now, windowDays } = input;
  const since = now.getTime() - windowDays * DAY_MS;

  const byPlan: FinanceReport['byPlan'] = {};
  let mrrEur = 0;
  let payingSubscribers = 0;
  for (const sub of input.subscriptions) {
    const plan = PLANS[sub.planId as PlanId];
    if (!plan || !isLiveSubscription(sub)) continue;
    const eur = plan.priceCents / 100;
    const row = (byPlan[plan.id] ??= { subscribers: 0, mrrEur: 0 });
    row.subscribers += 1;
    row.mrrEur = round(row.mrrEur + eur);
    mrrEur += eur;
    payingSubscribers += 1;
  }

  const inWindow = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const apiSpendUsd = inWindow.reduce((s, j) => s + j.apiCostUsd, 0);
  const failed = inWindow.filter((j) => j.status === 'failed');
  const wasteUsd = failed.reduce((s, j) => s + j.apiCostUsd, 0);

  const tierNames = [...new Set(inWindow.map((j) => j.modelTier))].sort();
  const tiers = tierNames.map((tier): TierEconomics => {
    const done = inWindow.filter((j) => j.modelTier === tier && j.status === 'done');
    const cost = done.reduce((s, j) => s + j.apiCostUsd, 0);
    const credits = done.reduce((s, j) => s + j.actualCredits, 0);
    return {
      tier,
      doneJobs: done.length,
      avgApiCostUsd: done.length ? round(cost / done.length, 4) : 0,
      avgCredits: done.length ? Math.round(credits / done.length) : 0,
      usdPer1kCredits: credits ? round((cost / credits) * 1000, 4) : 0,
    };
  });

  const apiSpendPer30dUsd = (apiSpendUsd / windowDays) * 30;
  const mrrUsd = mrrEur * input.usdPerEur;
  const costs = apiSpendPer30dUsd + input.fixedMonthlyUsd;
  return {
    asOf: now.toISOString(),
    windowDays,
    mrrEur: round(mrrEur),
    payingSubscribers,
    byPlan,
    apiSpendUsd: round(apiSpendUsd, 4),
    wasteUsd: round(wasteUsd, 4),
    failedJobs: failed.length,
    tiers,
    apiSpendPer30dUsd: round(apiSpendPer30dUsd),
    fixedMonthlyUsd: input.fixedMonthlyUsd,
    monthlyContributionUsd: round(mrrUsd - costs),
    coverage: costs > 0 ? round(mrrUsd / costs) : null,
  };
}
