/**
 * Finance report math: MRR, collected revenue, API spend and margins. Pure — the
 * script (`scripts/finance-report.mts`) feeds it rows. All money is USD unless a
 * name says Eur/Cents. Revenue is NET of VAT and Stripe fees (same assumptions as
 * the margin gate), because that's the cash we keep.
 */
import { PLANS, TOPUP_PACKS, type PlanId } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import type { FixedCost } from '@/config/fixed-costs';

export const DAY_MS = 86_400_000;
const LIVE = new Set(['active', 'trialing', 'past_due']);

export interface FinanceInput {
  now: Date;
  subscriptions: { planId: string; status: string }[];
  /** `topup` credit grants (delta = credits in the pack). */
  topUps: { credits: number; createdAt: Date }[];
  /** Subscription renewal grants (`monthly_grant`) — one row per charged cycle. */
  renewals: { createdAt: Date; planId?: string }[];
  jobs: {
    status: string;
    createdAt: Date;
    apiCostUsd: number;
    actualCredits: number;
    modelTier?: string;
  }[];
  fixedCosts: readonly FixedCost[];
}

export interface FinanceReport {
  asOf: string;
  /** Net-of-VAT-and-fees MRR from live subscriptions. */
  mrrNetUsd: number;
  /** Gross sticker MRR in EUR (what Stripe shows). */
  mrrGrossEur: number;
  arrNetUsd: number;
  payingSubscribers: number;
  byPlan: { planId: string; subscribers: number; mrrNetUsd: number }[];
  last30d: {
    topUpNetUsd: number;
    apiCostUsd: number;
    finishedVideos: number;
    failedJobs: number;
    creditsBilled: number;
    apiCostPerVideoUsd: number | null;
    /** USD of API cost per 1,000 billed credits (the price we pay vs. the credit we sell). */
    apiCostPer1kCreditsUsd: number | null;
  };
  fixedMonthlyUsd: number;
  fixedCostGaps: string[];
  /** Monthly run-rate: subscriptions + last-30d top-ups. */
  monthlyRevenueUsd: number;
  monthlyOutflowUsd: number;
  /** Revenue ÷ outflow. > 1 = profitable; the number to watch. */
  mrrCostRatio: number | null;
  /** Revenue minus outflow, per month. */
  monthlyNetCashUsd: number;
  grossMarginPct: number | null;
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now } = input;
  const since = now.getTime() - 30 * DAY_MS;

  const live = input.subscriptions.filter((s) => LIVE.has(s.status) && s.planId in PLANS);
  const byPlan = (Object.keys(PLANS) as PlanId[]).map((planId) => {
    const subscribers = live.filter((s) => s.planId === planId).length;
    return {
      planId,
      subscribers,
      mrrNetUsd: round(subscribers * netRevenueUsd(PLANS[planId].priceCents)),
    };
  });
  const mrrNetUsd = round(byPlan.reduce((a, p) => a + p.mrrNetUsd, 0));
  const mrrGrossEur = round(
    live.reduce((a, s) => a + PLANS[s.planId as PlanId].priceCents / 100, 0),
  );

  const recentTopUps = input.topUps.filter((t) => t.createdAt.getTime() >= since);
  const topUpNetUsd = round(
    recentTopUps.reduce((a, t) => {
      const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
      return a + (pack ? netRevenueUsd(pack.priceCents) : 0);
    }, 0),
  );

  const recentJobs = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const finished = recentJobs.filter((j) => j.status === 'done');
  const apiCostUsd = round(
    recentJobs.reduce((a, j) => a + j.apiCostUsd, 0),
    4,
  );
  const creditsBilled = finished.reduce((a, j) => a + j.actualCredits, 0);

  const gaps = input.fixedCosts.filter((c) => c.monthlyUsd === null).map((c) => c.name);
  const fixedMonthlyUsd = round(input.fixedCosts.reduce((a, c) => a + (c.monthlyUsd ?? 0), 0));

  const monthlyRevenueUsd = round(mrrNetUsd + topUpNetUsd);
  const monthlyOutflowUsd = round(apiCostUsd + fixedMonthlyUsd);

  return {
    asOf: now.toISOString(),
    mrrNetUsd,
    mrrGrossEur,
    arrNetUsd: round(mrrNetUsd * 12),
    payingSubscribers: live.length,
    byPlan,
    last30d: {
      topUpNetUsd,
      apiCostUsd,
      finishedVideos: finished.length,
      failedJobs: recentJobs.filter((j) => j.status === 'failed').length,
      creditsBilled,
      apiCostPerVideoUsd: finished.length ? round(apiCostUsd / finished.length, 4) : null,
      apiCostPer1kCreditsUsd: creditsBilled ? round((apiCostUsd / creditsBilled) * 1000, 4) : null,
    },
    fixedMonthlyUsd,
    fixedCostGaps: gaps,
    monthlyRevenueUsd,
    monthlyOutflowUsd,
    mrrCostRatio: monthlyOutflowUsd > 0 ? round(monthlyRevenueUsd / monthlyOutflowUsd) : null,
    monthlyNetCashUsd: round(monthlyRevenueUsd - monthlyOutflowUsd),
    grossMarginPct:
      monthlyRevenueUsd > 0
        ? round(((monthlyRevenueUsd - apiCostUsd) / monthlyRevenueUsd) * 100, 1)
        : null,
  };
}
