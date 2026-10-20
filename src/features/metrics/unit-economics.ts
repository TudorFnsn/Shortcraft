/**
 * Unit economics for the Finance routine: MRR, API cost per finished video,
 * realised margin and the monthly cash position, from data we already store.
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) so every number is reproducible.
 *
 * Definitions:
 * - **MRR:** the net monthly revenue (after VAT and Stripe fees, USD) of every
 *   live subscription, from the plan catalog. Top-ups are not recurring and are
 *   reported separately as `topUpNetUsd`.
 * - **Cost per video:** mean `api_cost_usd` of `done` jobs, per model tier.
 * - **Burn:** all API cost metered in the window, including failed jobs (their
 *   credits are refunded but the provider call was paid for).
 */
import { PLANS, type PlanId } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { isLiveSubscription } from '@/features/billing/entitlements';

export interface FinanceJob {
  status: string;
  modelTier: string;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface FinanceSubscription {
  planId: string;
  status: string;
}

/** A fixed monthly bill that is not metered per video (hosting, plans, domains). */
export interface FixedCost {
  name: string;
  usdPerMonth: number;
}

export interface TierCost {
  tier: string;
  videos: number;
  avgCostUsd: number;
  avgCredits: number;
  /** API dollars per 1,000 credits charged: lower is better. */
  usdPer1kCredits: number;
}

export interface FinanceReport {
  asOf: string;
  mrrNetUsd: number;
  subscribersByPlan: Record<string, number>;
  topUpNetUsd: number;
  apiCostUsd: number;
  failedApiCostUsd: number;
  fixedCostUsd: number;
  /** Net recurring revenue minus API cost in the window minus fixed costs. */
  cashMarginUsd: number;
  /** Net revenue / total cost, or null when nothing was spent. */
  revenueToCost: number | null;
  tiers: TierCost[];
  breakEvenSubscribers: number | null;
}

const round = (n: number, dp = 4): number => Number(n.toFixed(dp));

export function computeFinance(input: {
  now: Date;
  windowDays: number;
  jobs: readonly FinanceJob[];
  subscriptions: readonly FinanceSubscription[];
  /** Net USD of top-up purchases inside the window. */
  topUpNetUsd: number;
  fixedCosts: readonly FixedCost[];
}): FinanceReport {
  const since = input.now.getTime() - input.windowDays * 86_400_000;
  const jobs = input.jobs.filter((j) => j.createdAt.getTime() >= since);

  const subscribersByPlan: Record<string, number> = {};
  let mrr = 0;
  for (const s of input.subscriptions) {
    const plan = PLANS[s.planId as PlanId];
    if (!plan || !isLiveSubscription({ planId: s.planId, status: s.status })) continue;
    subscribersByPlan[plan.id] = (subscribersByPlan[plan.id] ?? 0) + 1;
    mrr += netRevenueUsd(plan.priceCents);
  }

  const tiers = new Map<string, { n: number; cost: number; credits: number }>();
  let apiCost = 0;
  let failedCost = 0;
  for (const j of jobs) {
    apiCost += j.apiCostUsd;
    if (j.status === 'failed') failedCost += j.apiCostUsd;
    if (j.status !== 'done') continue;
    const t = tiers.get(j.modelTier) ?? { n: 0, cost: 0, credits: 0 };
    t.n += 1;
    t.cost += j.apiCostUsd;
    t.credits += j.actualCredits;
    tiers.set(j.modelTier, t);
  }

  const fixed = input.fixedCosts.reduce((sum, c) => sum + c.usdPerMonth, 0);
  const fixedInWindow = (fixed * input.windowDays) / 30;
  const revenue = (mrr * input.windowDays) / 30 + input.topUpNetUsd;
  const totalCost = apiCost + fixedInWindow;

  // Contribution of one average subscriber after the variable API cost they burn.
  const subs = Object.values(subscribersByPlan).reduce((a, b) => a + b, 0);
  const contribution = subs > 0 ? (mrr - (apiCost * 30) / input.windowDays) / subs : 0;

  return {
    asOf: input.now.toISOString(),
    mrrNetUsd: round(mrr, 2),
    subscribersByPlan,
    topUpNetUsd: round(input.topUpNetUsd, 2),
    apiCostUsd: round(apiCost),
    failedApiCostUsd: round(failedCost),
    fixedCostUsd: round(fixedInWindow, 2),
    cashMarginUsd: round(revenue - totalCost, 2),
    revenueToCost: totalCost > 0 ? round(revenue / totalCost, 2) : null,
    tiers: [...tiers.entries()].map(([tier, t]) => ({
      tier,
      videos: t.n,
      avgCostUsd: round(t.cost / t.n),
      avgCredits: Math.round(t.credits / t.n),
      usdPer1kCredits: t.credits > 0 ? round((t.cost / t.credits) * 1000) : 0,
    })),
    breakEvenSubscribers: contribution > 0 ? Math.ceil(fixed / contribution) : null,
  };
}
