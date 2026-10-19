/**
 * Finance metrics for the Finance CFO routine (FinancePlan.md): MRR, trailing
 * revenue, metered API cost and gross margin, from data we already store.
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`, so every number is reproducible.
 *
 * Definitions:
 * - **MRR (gross, EUR):** sum of list prices of live subscriptions on a plan we sell.
 * - **MRR (net, USD):** the same after VAT, Stripe fees and FX (`netRevenueUsd`).
 * - **Top-up revenue:** `topup` ledger grants in the window, priced by the pack
 *   with the same credit amount (grants that match no pack are ignored).
 * - **Revenue (window):** net MRR scaled to the window + net top-ups. Subscription
 *   history isn't stored, so this assumes today's subscribers paid all window.
 * - **API cost:** `render_jobs.api_cost_usd` of jobs created in the window,
 *   counting every status: failed jobs still burned provider money.
 * - **Free cost:** the part of that cost spent by users who never paid.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { netRevenueUsd } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  actualCredits: number;
}

export interface FinanceTopUp {
  userId: string;
  credits: number;
  createdAt: Date;
}

export interface FinanceInput {
  now: Date;
  windowDays: number;
  subscriptions: readonly (SubscriptionSnapshot & { userId: string })[];
  jobs: readonly FinanceJob[];
  topUps: readonly FinanceTopUp[];
  /** Users who have ever paid (subscription grant or top-up). */
  paidUserIds: ReadonlySet<string>;
}

export interface TierCost {
  tier: string;
  jobs: number;
  done: number;
  apiCostUsd: number;
  credits: number;
  avgCostPerDoneUsd: number | null;
  /** Provider dollars per 1,000 credits charged; the live markup check. */
  costPer1kCreditsUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  subscribersByPlan: Record<string, number>;
  mrrGrossEur: number;
  mrrNetUsd: number;
  topUpNetUsd: number;
  revenueNetUsd: number;
  apiCostUsd: number;
  freeApiCostUsd: number;
  failedApiCostUsd: number;
  grossProfitUsd: number;
  /** revenue / API cost; null with no cost yet. The margin gate wants >= 3. */
  marginMultiple: number | null;
  tiers: TierCost[];
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now, windowDays } = input;
  const since = now.getTime() - windowDays * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= since && d.getTime() < now.getTime();

  const subscribersByPlan: Record<string, number> = {};
  let mrrGrossEur = 0;
  let mrrNetUsd = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    const plan = PLANS[sub.planId];
    subscribersByPlan[plan.id] = (subscribersByPlan[plan.id] ?? 0) + 1;
    mrrGrossEur += plan.priceCents / 100;
    mrrNetUsd += netRevenueUsd(plan.priceCents);
  }

  let topUpNetUsd = 0;
  for (const t of input.topUps) {
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (pack && inWindow(t.createdAt)) topUpNetUsd += netRevenueUsd(pack.priceCents);
  }

  const byTier = new Map<string, TierCost>();
  let apiCostUsd = 0;
  let freeApiCostUsd = 0;
  let failedApiCostUsd = 0;
  for (const j of input.jobs) {
    if (!inWindow(j.createdAt)) continue;
    apiCostUsd += j.apiCostUsd;
    if (!input.paidUserIds.has(j.userId)) freeApiCostUsd += j.apiCostUsd;
    if (j.status === 'failed') failedApiCostUsd += j.apiCostUsd;
    const t = byTier.get(j.modelTier) ?? {
      tier: j.modelTier,
      jobs: 0,
      done: 0,
      apiCostUsd: 0,
      credits: 0,
      avgCostPerDoneUsd: null,
      costPer1kCreditsUsd: null,
    };
    t.jobs += 1;
    if (j.status === 'done') t.done += 1;
    t.apiCostUsd += j.apiCostUsd;
    t.credits += j.actualCredits;
    byTier.set(j.modelTier, t);
  }
  const tiers = [...byTier.values()]
    .map((t) => ({
      ...t,
      apiCostUsd: round(t.apiCostUsd, 4),
      avgCostPerDoneUsd: t.done ? round(t.apiCostUsd / t.done, 4) : null,
      costPer1kCreditsUsd: t.credits ? round((t.apiCostUsd / t.credits) * 1000, 4) : null,
    }))
    .sort((a, b) => b.apiCostUsd - a.apiCostUsd);

  const revenueNetUsd = mrrNetUsd * (windowDays / 30) + topUpNetUsd;
  return {
    asOf: now.toISOString(),
    windowDays,
    subscribersByPlan,
    mrrGrossEur: round(mrrGrossEur),
    mrrNetUsd: round(mrrNetUsd),
    topUpNetUsd: round(topUpNetUsd),
    revenueNetUsd: round(revenueNetUsd),
    apiCostUsd: round(apiCostUsd, 4),
    freeApiCostUsd: round(freeApiCostUsd, 4),
    failedApiCostUsd: round(failedApiCostUsd, 4),
    grossProfitUsd: round(revenueNetUsd - apiCostUsd),
    marginMultiple: apiCostUsd > 0 ? round(revenueNetUsd / apiCostUsd) : null,
    tiers,
  };
}
