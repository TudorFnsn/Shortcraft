/**
 * Finance metrics: MRR, realized API spend vs the revenue it should earn, and
 * where cash leaks (failed jobs, free-tier burn). Built from data we already
 * store (`subscriptions`, `render_jobs.api_cost_usd`); no new tables.
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`, so every number is reproducible.
 *
 * Definitions:
 * - **MRR:** sum of the net monthly revenue (after VAT + Stripe fees, USD, see
 *   `netRevenueUsd`) of live subscriptions. Gross MRR (EUR list price) is
 *   reported next to it. Top-ups are one-off and reported separately.
 * - **API spend (30d):** `api_cost_usd` of jobs created in the last 30 days,
 *   split by model tier. Failed jobs count: the provider charged us either way.
 * - **Cost-to-MRR:** 30-day API spend / MRR. The lower, the better.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';

export const FINANCE_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export interface FinanceSubscription extends SubscriptionSnapshot {
  userId: string;
}

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface FinanceInput {
  now: Date;
  subscriptions: FinanceSubscription[];
  jobs: FinanceJob[];
}

export interface TierSpend {
  tier: string;
  jobs: number;
  doneJobs: number;
  spendUsd: number;
  /** Spend / finished videos; null when none finished. */
  costPerDoneVideoUsd: number | null;
  creditsCharged: number;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  subscribersByPlan: Record<string, number>;
  mrrGrossEur: number;
  mrrNetUsd: number;
  arrNetUsd: number;
  apiSpendUsd: number;
  byTier: TierSpend[];
  /** Spend on jobs that never produced a video. */
  failedSpendUsd: number;
  /** Spend by users without a live subscription (trial / free burn). */
  nonPayingSpendUsd: number;
  /** apiSpend / mrrNet; null when there is no MRR. */
  costToMrr: number | null;
  /** (mrrNet - apiSpend) / mrrNet; null when there is no MRR. */
  grossMarginRate: number | null;
}

const round = (n: number, dp = 4) => Number(n.toFixed(dp));

export function computeFinance(input: FinanceInput): FinanceReport {
  const since = input.now.getTime() - FINANCE_WINDOW_DAYS * DAY_MS;
  const live = input.subscriptions.filter((s) => isLiveSubscription(s) && s.planId in PLANS);
  const payingIds = new Set(live.map((s) => s.userId));

  const subscribersByPlan: Record<string, number> = {};
  let mrrGrossEur = 0;
  let mrrNetUsd = 0;
  for (const s of live) {
    const plan = PLANS[s.planId as PlanId];
    subscribersByPlan[s.planId] = (subscribersByPlan[s.planId] ?? 0) + 1;
    mrrGrossEur += plan.priceCents / 100;
    mrrNetUsd += netRevenueUsd(plan.priceCents);
  }

  const tiers = new Map<string, TierSpend>();
  let apiSpendUsd = 0;
  let failedSpendUsd = 0;
  let nonPayingSpendUsd = 0;
  for (const j of input.jobs) {
    if (j.createdAt.getTime() < since || j.createdAt > input.now) continue;
    const t = tiers.get(j.modelTier) ?? {
      tier: j.modelTier,
      jobs: 0,
      doneJobs: 0,
      spendUsd: 0,
      costPerDoneVideoUsd: null,
      creditsCharged: 0,
    };
    t.jobs += 1;
    t.spendUsd += j.apiCostUsd;
    t.creditsCharged += j.actualCredits;
    if (j.status === 'done') t.doneJobs += 1;
    tiers.set(j.modelTier, t);

    apiSpendUsd += j.apiCostUsd;
    if (j.status === 'failed') failedSpendUsd += j.apiCostUsd;
    if (!payingIds.has(j.userId)) nonPayingSpendUsd += j.apiCostUsd;
  }

  const byTier = [...tiers.values()]
    .map((t) => ({
      ...t,
      spendUsd: round(t.spendUsd),
      costPerDoneVideoUsd: t.doneJobs > 0 ? round(t.spendUsd / t.doneJobs) : null,
    }))
    .sort((a, b) => b.spendUsd - a.spendUsd);

  return {
    asOf: input.now.toISOString(),
    windowDays: FINANCE_WINDOW_DAYS,
    payingSubscribers: live.length,
    subscribersByPlan,
    mrrGrossEur: round(mrrGrossEur, 2),
    mrrNetUsd: round(mrrNetUsd, 2),
    arrNetUsd: round(mrrNetUsd * 12, 2),
    apiSpendUsd: round(apiSpendUsd),
    byTier,
    failedSpendUsd: round(failedSpendUsd),
    nonPayingSpendUsd: round(nonPayingSpendUsd),
    costToMrr: mrrNetUsd > 0 ? round(apiSpendUsd / mrrNetUsd) : null,
    grossMarginRate: mrrNetUsd > 0 ? round((mrrNetUsd - apiSpendUsd) / mrrNetUsd) : null,
  };
}
