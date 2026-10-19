/**
 * Finance snapshot: MRR, realised API cost per video and gross margin, from
 * rows the app already stores. Pure (rows in, numbers out); the read-only
 * script `scripts/finance-report.mts` feeds it from Supabase.
 *
 * Revenue is the plan's NET price (after VAT + Stripe fees, USD) from
 * `margin.ts`, the same assumptions the margin gate uses. It is an estimate
 * until Stripe's real balance transactions are read; the routine cross-checks
 * it against Stripe when that connector is authorised.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { netRevenueUsd, REVENUE_ASSUMPTIONS } from '@/features/billing/margin';
import { isLiveSubscription } from '@/features/billing/entitlements';

export const DAY_MS = 86_400_000;

export interface FinanceJob {
  status: string;
  modelTier: string;
  createdAt: Date;
  /** Our provider spend for the job, USD (`render_jobs.api_cost_usd`). */
  apiCostUsd: number;
  /** Credits the customer was finally charged. */
  chargedCredits: number;
}

export interface FinanceInput {
  now: Date;
  jobs: FinanceJob[];
  subscriptions: { planId: string; status: string }[];
  /** Paid ledger grants in the window: subscription cycles and top-ups. */
  grants: { reason: string; delta: number; createdAt: Date }[];
  /** Days of jobs/grants to measure (default 30). */
  windowDays?: number;
}

export interface TierCost {
  tier: string;
  videos: number;
  costUsd: number;
  avgCostUsd: number | null;
  chargedCredits: number;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  /** Net monthly recurring revenue of live subscriptions, USD. */
  mrrUsd: number;
  payingSubscribers: number;
  subscribersByPlan: Record<string, number>;
  /** Blended net revenue per credit sold in the window (null = nothing sold). */
  netRevenuePerCreditUsd: number | null;
  /** Spend on done jobs, failed jobs (money lost) and everything else. */
  apiCostDoneUsd: number;
  apiCostFailedUsd: number;
  apiCostOtherUsd: number;
  byTier: TierCost[];
  /** Estimated revenue earned by credits burned on done jobs, USD. */
  burnedRevenueUsd: number | null;
  /** burnedRevenue / API cost of done jobs (null when either is zero). */
  grossMarginMultiple: number | null;
  /** Share of total API spend that produced no video. */
  wastedSpendShare: number | null;
}

const round = (n: number, dp = 4) => Number(n.toFixed(dp));

export function computeFinance(input: FinanceInput): FinanceReport {
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * DAY_MS;
  const jobs = input.jobs.filter((j) => j.createdAt.getTime() >= since);

  const subscribersByPlan: Record<string, number> = {};
  let mrrUsd = 0;
  let payingSubscribers = 0;
  for (const s of input.subscriptions) {
    const sub = { planId: s.planId, status: s.status };
    if (!isLiveSubscription(sub)) continue;
    payingSubscribers++;
    subscribersByPlan[sub.planId] = (subscribersByPlan[sub.planId] ?? 0) + 1;
    mrrUsd += netRevenueUsd(PLANS[sub.planId as PlanId].priceCents, REVENUE_ASSUMPTIONS);
  }

  // Credits sold in the window. Revenue per credit comes from the plans/packs
  // price list rather than ledger amounts (which carry no money).
  const sold = input.grants.filter((g) => g.createdAt.getTime() >= since && g.delta > 0);
  const soldCredits = sold.reduce((a, g) => a + g.delta, 0);
  const perCredit = blendedNetPerCredit();
  const netRevenuePerCreditUsd = soldCredits > 0 ? perCredit : null;

  let apiCostDoneUsd = 0;
  let apiCostFailedUsd = 0;
  let apiCostOtherUsd = 0;
  let burnedCredits = 0;
  const tiers = new Map<string, TierCost>();
  for (const j of jobs) {
    if (j.status === 'done') {
      apiCostDoneUsd += j.apiCostUsd;
      burnedCredits += j.chargedCredits;
      const t = tiers.get(j.modelTier) ?? {
        tier: j.modelTier,
        videos: 0,
        costUsd: 0,
        avgCostUsd: null,
        chargedCredits: 0,
      };
      t.videos++;
      t.costUsd += j.apiCostUsd;
      t.chargedCredits += j.chargedCredits;
      tiers.set(j.modelTier, t);
    } else if (j.status === 'failed') apiCostFailedUsd += j.apiCostUsd;
    else apiCostOtherUsd += j.apiCostUsd;
  }

  const burnedRevenueUsd = burnedCredits > 0 ? burnedCredits * perCredit : null;
  const totalCost = apiCostDoneUsd + apiCostFailedUsd + apiCostOtherUsd;
  return {
    asOf: input.now.toISOString(),
    windowDays,
    mrrUsd: round(mrrUsd, 2),
    payingSubscribers,
    subscribersByPlan,
    netRevenuePerCreditUsd:
      netRevenuePerCreditUsd === null ? null : round(netRevenuePerCreditUsd, 8),
    apiCostDoneUsd: round(apiCostDoneUsd),
    apiCostFailedUsd: round(apiCostFailedUsd),
    apiCostOtherUsd: round(apiCostOtherUsd),
    byTier: [...tiers.values()]
      .map((t) => ({ ...t, costUsd: round(t.costUsd), avgCostUsd: round(t.costUsd / t.videos) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    burnedRevenueUsd: burnedRevenueUsd === null ? null : round(burnedRevenueUsd, 2),
    grossMarginMultiple:
      burnedRevenueUsd !== null && apiCostDoneUsd > 0
        ? round(burnedRevenueUsd / apiCostDoneUsd, 2)
        : null,
    wastedSpendShare: totalCost > 0 ? round(apiCostFailedUsd / totalCost, 3) : null,
  };
}

/** Plans' mean net USD per credit (what a subscriber's credit is worth to us). */
function blendedNetPerCredit(): number {
  const plans = Object.values(PLANS);
  const per = plans.map((p) => netRevenueUsd(p.priceCents, REVENUE_ASSUMPTIONS) / p.monthlyCredits);
  return per.reduce((a, b) => a + b, 0) / per.length;
}
