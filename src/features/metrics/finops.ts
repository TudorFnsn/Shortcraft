/**
 * FinOps report math: MRR, realised API cost per job, and cash margin.
 * Pure (no I/O) so the Finance routine and `scripts/finops-report.mts` share
 * one definition. "Paying" means exactly what plan gating means
 * (`isLiveSubscription`). Subscriptions are priced at the plan's monthly list
 * price; yearly billing and coupons are not stored, so MRR is an upper bound.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { REVENUE_ASSUMPTIONS, netRevenueUsd } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;

export interface FinSubscription {
  planId: string;
  status: string;
}
export interface FinJob {
  status: string;
  modelTier: string;
  createdAt: Date;
  actualCredits: number;
  apiCostUsd: number;
}
export interface FinopsInput {
  now: Date;
  subscriptions: FinSubscription[];
  jobs: FinJob[];
  /** Paid one-off top-ups (EUR cents) in the window, if known. */
  topUpCentsLast30d?: number;
  /** Fixed monthly costs in USD (hosting, Supabase, ElevenLabs plan, ...). */
  fixedMonthlyCostsUsd?: number;
}

export interface TierCost {
  tier: string;
  jobs: number;
  credits: number;
  apiCostUsd: number;
  avgCostUsd: number | null;
  /** API cost per 1,000 credits charged. */
  costPer1kCredits: number | null;
}

export interface FinopsReport {
  asOf: string;
  mrrEur: number;
  netMrrUsd: number;
  payingSubscribers: number;
  byPlan: { plan: PlanId; subscribers: number; mrrEur: number }[];
  arpuEur: number | null;
  last30d: {
    doneJobs: number;
    failedJobs: number;
    apiCostUsd: number;
    byTier: TierCost[];
  };
  fixedMonthlyCostsUsd: number;
  /** netMrr + top-ups − API cost − fixed costs, USD, last-30-days basis. */
  monthlyCashUsd: number;
  /** (netMrr + top-ups) ÷ API cost; null when nothing was spent. */
  revenueToApiCost: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeFinops(input: FinopsInput): FinopsReport {
  const byPlan = (Object.keys(PLANS) as PlanId[]).map((plan) => {
    const subscribers = input.subscriptions.filter(
      (s) => isLiveSubscription(s) && s.planId === plan,
    ).length;
    return { plan, subscribers, mrrEur: (subscribers * PLANS[plan].priceCents) / 100 };
  });
  const payingSubscribers = byPlan.reduce((n, p) => n + p.subscribers, 0);
  const mrrEur = byPlan.reduce((n, p) => n + p.mrrEur, 0);
  const netMrrUsd = byPlan.reduce(
    (n, p) => n + p.subscribers * netRevenueUsd(PLANS[p.plan].priceCents),
    0,
  );

  const since = input.now.getTime() - 30 * DAY_MS;
  const recent = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const done = recent.filter((j) => j.status === 'done');
  const tiers = new Map<string, TierCost>();
  for (const j of done) {
    const t = tiers.get(j.modelTier) ?? {
      tier: j.modelTier,
      jobs: 0,
      credits: 0,
      apiCostUsd: 0,
      avgCostUsd: null,
      costPer1kCredits: null,
    };
    t.jobs += 1;
    t.credits += j.actualCredits;
    t.apiCostUsd += j.apiCostUsd;
    tiers.set(j.modelTier, t);
  }
  const byTier = [...tiers.values()].map((t) => ({
    ...t,
    apiCostUsd: round2(t.apiCostUsd),
    avgCostUsd: t.jobs ? round2(t.apiCostUsd / t.jobs) : null,
    costPer1kCredits: t.credits ? round2((t.apiCostUsd / t.credits) * 1000) : null,
  }));
  // Failed jobs still burn provider money before they refund the customer.
  const apiCostUsd = recent.reduce((n, j) => n + j.apiCostUsd, 0);

  const topUpUsd =
    ((input.topUpCentsLast30d ?? 0) / 100 / (1 + REVENUE_ASSUMPTIONS.vatRate)) *
    REVENUE_ASSUMPTIONS.usdPerEur;
  const fixed = input.fixedMonthlyCostsUsd ?? 0;
  const revenue = netMrrUsd + topUpUsd;

  return {
    asOf: input.now.toISOString(),
    mrrEur: round2(mrrEur),
    netMrrUsd: round2(netMrrUsd),
    payingSubscribers,
    byPlan,
    arpuEur: payingSubscribers ? round2(mrrEur / payingSubscribers) : null,
    last30d: {
      doneJobs: done.length,
      failedJobs: recent.filter((j) => j.status === 'failed').length,
      apiCostUsd: round2(apiCostUsd),
      byTier,
    },
    fixedMonthlyCostsUsd: fixed,
    monthlyCashUsd: round2(revenue - apiCostUsd - fixed),
    revenueToApiCost: apiCostUsd > 0 ? round2(revenue / apiCostUsd) : null,
  };
}
