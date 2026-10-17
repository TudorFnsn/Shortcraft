/**
 * Finance metrics: MRR, cost per finished video and gross margin, from data we
 * already store (`subscriptions`, `render_jobs.api_cost_usd`). Pure: the caller
 * loads rows and passes `now`, so every number is reproducible.
 *
 * Limits, stated so nobody over-reads the output:
 * - MRR is list price of live subscriptions (no coupons, no yearly proration,
 *   no FX); Stripe is the source of truth for cash. Top-ups are reported
 *   separately and never counted as recurring.
 * - Cost is only what `api_cost_usd` records per job. Fixed costs (hosting,
 *   Supabase, ElevenLabs plan fee, Sentry, domain) are passed in by the caller.
 * - Net revenue uses the same VAT + Stripe-fee assumptions as the margin gate.
 */
import { PLANS } from '@/config/plans';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';
import { isLiveSubscription } from '@/features/billing/entitlements';

export interface FinanceSubscription {
  planId: string;
  status: string;
}

export interface FinanceJob {
  status: string;
  modelTier: string;
  apiCostUsd: number;
  createdAt: Date;
}

export interface FinanceInput {
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  /** Fixed monthly costs in USD (hosting, database, vendor plans, tools). */
  fixedMonthlyCostUsd: number;
  now: Date;
}

export interface TierCost {
  tier: string;
  /** Finished videos in the window. */
  videos: number;
  /** Spend on those videos. */
  costUsd: number;
  avgCostUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  mrrEur: number;
  mrrByPlan: Record<string, { subscribers: number; mrrEur: number }>;
  /** Monthly net revenue in USD (after VAT + Stripe fees) from live subscribers. */
  netMrrUsd: number;
  /** 30-day API spend, including failed jobs (money spent, nothing delivered). */
  apiCostUsd30d: number;
  failedCostUsd30d: number;
  perTier: TierCost[];
  fixedMonthlyCostUsd: number;
  /** netMrr − 30-day API spend − fixed costs. */
  monthlyProfitUsd: number;
  /** (netMrr − api spend) / netMrr; null with no revenue. */
  grossMargin: number | null;
}

const DAY_MS = 86_400_000;

/** Net USD for one subscription payment after VAT and Stripe's fee. */
export function netUsdPerPayment(priceCents: number): number {
  const a = REVENUE_ASSUMPTIONS;
  const gross = priceCents / 100;
  const exVat = gross / (1 + a.vatRate);
  const fee = gross * a.stripePercentFee + a.stripeFixedFeeEur;
  return (exVat - fee) * a.usdPerEur;
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const mrrByPlan: FinanceReport['mrrByPlan'] = {};
  let mrrEur = 0;
  let netMrrUsd = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    const plan = PLANS[sub.planId];
    const row = (mrrByPlan[plan.id] ??= { subscribers: 0, mrrEur: 0 });
    row.subscribers += 1;
    row.mrrEur += plan.priceCents / 100;
    mrrEur += plan.priceCents / 100;
    netMrrUsd += netUsdPerPayment(plan.priceCents);
  }

  const since = input.now.getTime() - 30 * DAY_MS;
  const tiers = new Map<string, { videos: number; costUsd: number }>();
  let apiCostUsd30d = 0;
  let failedCostUsd30d = 0;
  for (const job of input.jobs) {
    if (job.createdAt.getTime() < since) continue;
    apiCostUsd30d += job.apiCostUsd;
    if (job.status === 'failed') failedCostUsd30d += job.apiCostUsd;
    if (job.status !== 'done') continue;
    const t = tiers.get(job.modelTier) ?? { videos: 0, costUsd: 0 };
    t.videos += 1;
    t.costUsd += job.apiCostUsd;
    tiers.set(job.modelTier, t);
  }

  const perTier = [...tiers.entries()]
    .map(([tier, t]) => ({
      tier,
      videos: t.videos,
      costUsd: t.costUsd,
      avgCostUsd: t.videos > 0 ? t.costUsd / t.videos : null,
    }))
    .sort((a, b) => a.tier.localeCompare(b.tier));

  return {
    asOf: input.now.toISOString(),
    mrrEur,
    mrrByPlan,
    netMrrUsd,
    apiCostUsd30d,
    failedCostUsd30d,
    perTier,
    fixedMonthlyCostUsd: input.fixedMonthlyCostUsd,
    monthlyProfitUsd: netMrrUsd - apiCostUsd30d - input.fixedMonthlyCostUsd,
    grossMargin: netMrrUsd > 0 ? (netMrrUsd - apiCostUsd30d) / netMrrUsd : null,
  };
}
