/**
 * Unit economics from data we already store: MRR, API spend, cost per finished
 * video and realised gross margin. Pure: the caller loads rows (Supabase in
 * `scripts/finance-report.mts`, fixtures in tests) and passes `now`.
 *
 * Definitions:
 * - **MRR:** sum of list prices (EUR) of live subscriptions on a plan we sell,
 *   as of `now`. Gross of VAT and Stripe fees (that is what Stripe shows as
 *   MRR); `netMrrUsd` applies the margin gate's assumptions for a cash view.
 *   Annual or discounted subscriptions are not modelled; read Stripe for those.
 * - **API spend (30d):** `render_jobs.api_cost_usd` for jobs created in the
 *   last 30 days, any status, because failed jobs still burn provider money.
 * - **Cost per finished video:** that spend divided by jobs that reached `done`
 *   (so the cost of failures is carried by the successes, as it is in cash).
 * - **Realised gross margin:** (netMrrUsd - spend) / netMrrUsd, a rough monthly
 *   proxy: spend includes trial users' jobs, which is the point (acquisition).
 */
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { netRevenueUsd, REVENUE_ASSUMPTIONS } from '@/features/billing/margin';
import { PLANS, type PlanId } from '@/config/plans';

const DAY_MS = 86_400_000;
export const FINANCE_WINDOW_DAYS = 30;

export interface FinanceJob {
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  actualCredits: number;
}

export interface FinanceInput {
  now: Date;
  subscriptions: readonly SubscriptionSnapshot[];
  jobs: readonly FinanceJob[];
}

export interface TierEconomics {
  tier: string;
  jobs: number;
  finished: number;
  apiCostUsd: number;
  creditsBurned: number;
  /** Provider USD per 1,000 credits burned; compare with the catalog's implied cost. */
  costUsdPer1kCredits: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  mrrEur: number;
  netMrrUsd: number;
  payingSubscribers: number;
  arpuEur: number | null;
  byPlan: Array<{ planId: string; subscribers: number; mrrEur: number }>;
  apiSpendUsd: number;
  finishedVideos: number;
  costPerFinishedVideoUsd: number | null;
  failedSpendUsd: number;
  grossMargin: number | null;
  byTier: TierEconomics[];
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeFinance(input: FinanceInput): FinanceReport {
  const since = input.now.getTime() - FINANCE_WINDOW_DAYS * DAY_MS;

  const planCount = new Map<string, number>();
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s) || !(s.planId in PLANS)) continue;
    planCount.set(s.planId, (planCount.get(s.planId) ?? 0) + 1);
  }
  const byPlan = [...planCount].map(([planId, subscribers]) => ({
    planId,
    subscribers,
    mrrEur: round((subscribers * PLANS[planId as PlanId].priceCents) / 100),
  }));
  const payingSubscribers = byPlan.reduce((n, p) => n + p.subscribers, 0);
  const mrrEur = round(byPlan.reduce((n, p) => n + p.mrrEur, 0));
  const netMrrUsd = round(
    [...planCount].reduce(
      (n, [planId, c]) =>
        n + c * netRevenueUsd(PLANS[planId as PlanId].priceCents, REVENUE_ASSUMPTIONS),
      0,
    ),
  );

  const tiers = new Map<string, TierEconomics>();
  let apiSpendUsd = 0;
  let failedSpendUsd = 0;
  let finishedVideos = 0;
  for (const j of input.jobs) {
    if (j.createdAt.getTime() < since || j.createdAt.getTime() >= input.now.getTime()) continue;
    const t = tiers.get(j.modelTier) ?? {
      tier: j.modelTier,
      jobs: 0,
      finished: 0,
      apiCostUsd: 0,
      creditsBurned: 0,
      costUsdPer1kCredits: null,
    };
    t.jobs += 1;
    t.apiCostUsd += j.apiCostUsd;
    t.creditsBurned += j.actualCredits;
    apiSpendUsd += j.apiCostUsd;
    if (j.status === 'done') {
      t.finished += 1;
      finishedVideos += 1;
    } else if (j.status === 'failed') {
      failedSpendUsd += j.apiCostUsd;
    }
    tiers.set(j.modelTier, t);
  }

  const byTier = [...tiers.values()]
    .map((t) => ({
      ...t,
      apiCostUsd: round(t.apiCostUsd, 4),
      costUsdPer1kCredits:
        t.creditsBurned > 0 ? round((t.apiCostUsd / t.creditsBurned) * 1000, 4) : null,
    }))
    .sort((a, b) => a.tier.localeCompare(b.tier));

  return {
    asOf: input.now.toISOString(),
    windowDays: FINANCE_WINDOW_DAYS,
    mrrEur,
    netMrrUsd,
    payingSubscribers,
    arpuEur: payingSubscribers > 0 ? round(mrrEur / payingSubscribers) : null,
    byPlan,
    apiSpendUsd: round(apiSpendUsd, 4),
    finishedVideos,
    costPerFinishedVideoUsd: finishedVideos > 0 ? round(apiSpendUsd / finishedVideos, 4) : null,
    failedSpendUsd: round(failedSpendUsd, 4),
    grossMargin: netMrrUsd > 0 ? round((netMrrUsd - apiSpendUsd) / netMrrUsd, 3) : null,
    byTier,
  };
}
