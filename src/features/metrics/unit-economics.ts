/**
 * Unit economics: MRR, measured API cost per finished video, and gross margin.
 * Pure: the script (`scripts/finance-report.mts`) feeds it rows, tests feed it fixtures.
 * Revenue is net of VAT + Stripe fees using the same assumptions as the margin gate.
 */
import { PLANS } from '@/config/plans';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { netRevenueUsd, REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;

export interface FinanceJob {
  status: string;
  modelTier: string;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface FinanceInput {
  jobs: readonly FinanceJob[];
  subscriptions: readonly SubscriptionSnapshot[];
  /** Fixed monthly costs in USD (hosting, Supabase, Sentry, Resend...), owner-supplied. */
  fixedMonthlyUsd: number;
  now: Date;
  windowDays?: number;
}

export interface TierCost {
  tier: string;
  finished: number;
  costUsd: number;
  avgCostUsd: number | null;
  credits: number;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  /** Gross MRR in EUR (list price of every live subscription). */
  mrrGrossEur: number;
  /** Net MRR in USD after VAT + Stripe fees. */
  mrrNetUsd: number;
  variableCostUsd: number;
  failedCostUsd: number;
  fixedMonthlyUsd: number;
  /** (net MRR − variable − fixed) / net MRR, or null with no revenue. */
  grossMargin: number | null;
  /** Net MRR − all costs, USD per month. */
  monthlyProfitUsd: number;
  byTier: TierCost[];
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * DAY_MS;
  const recent = input.jobs.filter((j) => j.createdAt.getTime() >= since);

  let mrrGrossEur = 0;
  let mrrNetUsd = 0;
  let payingSubscribers = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    payingSubscribers++;
    const cents = PLANS[s.planId].priceCents;
    mrrGrossEur += cents / 100;
    mrrNetUsd += netRevenueUsd(cents, REVENUE_ASSUMPTIONS);
  }

  const tiers = new Map<string, TierCost>();
  let variableCostUsd = 0;
  let failedCostUsd = 0;
  for (const j of recent) {
    variableCostUsd += j.apiCostUsd;
    if (j.status === 'failed') failedCostUsd += j.apiCostUsd;
    if (j.status !== 'done') continue;
    const t = tiers.get(j.modelTier) ?? {
      tier: j.modelTier,
      finished: 0,
      costUsd: 0,
      avgCostUsd: null,
      credits: 0,
    };
    t.finished++;
    t.costUsd += j.apiCostUsd;
    t.credits += j.actualCredits;
    tiers.set(j.modelTier, t);
  }
  const byTier = [...tiers.values()].map((t) => ({
    ...t,
    avgCostUsd: t.finished ? t.costUsd / t.finished : null,
  }));

  const monthlyProfitUsd = mrrNetUsd - variableCostUsd * (30 / windowDays) - input.fixedMonthlyUsd;
  return {
    asOf: input.now.toISOString(),
    windowDays,
    payingSubscribers,
    mrrGrossEur,
    mrrNetUsd,
    variableCostUsd,
    failedCostUsd,
    fixedMonthlyUsd: input.fixedMonthlyUsd,
    grossMargin: mrrNetUsd > 0 ? monthlyProfitUsd / mrrNetUsd : null,
    monthlyProfitUsd,
    byTier,
  };
}
