/**
 * Finance report math: MRR vs what the videos actually cost us. Pure — the
 * script (`scripts/finance-report.mts`) does the reads; tests feed fixtures.
 *
 * MRR is gross list price of live subscriptions (EUR). "Net" applies the same
 * VAT + Stripe assumptions as the margin gate, so the two reports agree.
 * Costs come from `render_jobs.api_cost_usd` (metered per job by the
 * orchestrator), so they are the measured cost, not the catalog's estimate.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';
import { isLiveSubscription } from '@/features/billing/entitlements';

export const DAY_MS = 86_400_000;

export interface FinanceInput {
  now: Date;
  subscriptions: { userId: string; planId: string; status: string }[];
  jobs: {
    userId: string;
    status: string;
    modelTier: string;
    apiCostUsd: number;
    actualCredits: number;
    createdAt: Date;
  }[];
  /** Fixed monthly costs in USD the owner pays regardless of use (hosting, DB, seats). */
  fixedMonthlyUsd?: number;
}

export interface TierCost {
  tier: string;
  jobs: number;
  finished: number;
  costUsd: number;
  /** Cost of every job (failures included) ÷ finished videos. */
  costPerFinishedUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  payingSubscribers: number;
  mrrEur: number;
  mrrNetUsd: number;
  windowDays: number;
  apiCostUsd: number;
  failedCostUsd: number;
  /** API cost of jobs run by people with no live subscription (trial burn). */
  freeUserCostUsd: number;
  fixedMonthlyUsd: number;
  /** (net MRR − API cost − fixed) for the window, scaled to a month. */
  monthlyProfitUsd: number;
  /** net MRR ÷ API cost; null when nothing was spent. */
  revenueToApiCost: number | null;
  tiers: TierCost[];
  avgCreditsPerFinished: number | null;
}

/** Net USD from one gross EUR price: strip VAT, Stripe %, Stripe fixed, convert. */
export function netUsdFromGrossEur(grossEur: number): number {
  const a = REVENUE_ASSUMPTIONS;
  const net = grossEur / (1 + a.vatRate) - (grossEur * a.stripePercentFee + a.stripeFixedFeeEur);
  return Math.max(0, net) * a.usdPerEur;
}

export function computeFinance(input: FinanceInput, windowDays = 30): FinanceReport {
  const since = input.now.getTime() - windowDays * DAY_MS;
  const live = input.subscriptions.filter(isLiveSubscription);
  const payingIds = new Set(live.map((s) => s.userId));

  let mrrEur = 0;
  let mrrNetUsd = 0;
  for (const s of live) {
    const gross = PLANS[s.planId as PlanId].priceCents / 100;
    mrrEur += gross;
    mrrNetUsd += netUsdFromGrossEur(gross);
  }

  const jobs = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const byTier = new Map<string, TierCost>();
  let apiCostUsd = 0;
  let failedCostUsd = 0;
  let freeUserCostUsd = 0;
  let finishedCredits = 0;
  let finishedCount = 0;
  for (const j of jobs) {
    const t = byTier.get(j.modelTier) ?? {
      tier: j.modelTier,
      jobs: 0,
      finished: 0,
      costUsd: 0,
      costPerFinishedUsd: null,
    };
    t.jobs += 1;
    t.costUsd += j.apiCostUsd;
    apiCostUsd += j.apiCostUsd;
    if (j.status === 'done') {
      t.finished += 1;
      finishedCount += 1;
      finishedCredits += j.actualCredits;
    }
    if (j.status === 'failed') failedCostUsd += j.apiCostUsd;
    if (!payingIds.has(j.userId)) freeUserCostUsd += j.apiCostUsd;
    byTier.set(j.modelTier, t);
  }
  const tiers = [...byTier.values()].map((t) => ({
    ...t,
    costPerFinishedUsd: t.finished > 0 ? t.costUsd / t.finished : null,
  }));

  const scale = 30 / windowDays;
  const fixedMonthlyUsd = input.fixedMonthlyUsd ?? 0;
  return {
    asOf: input.now.toISOString(),
    payingSubscribers: live.length,
    mrrEur,
    mrrNetUsd,
    windowDays,
    apiCostUsd,
    failedCostUsd,
    freeUserCostUsd,
    fixedMonthlyUsd,
    monthlyProfitUsd: mrrNetUsd - apiCostUsd * scale - fixedMonthlyUsd,
    revenueToApiCost: apiCostUsd > 0 ? mrrNetUsd / (apiCostUsd * scale) : null,
    tiers,
    avgCreditsPerFinished: finishedCount > 0 ? finishedCredits / finishedCount : null,
  };
}
