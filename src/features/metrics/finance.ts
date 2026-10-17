/**
 * Finance report math: MRR, 30-day net revenue, API spend per tier, cost per
 * video and contribution margin. Pure; `scripts/finance-report.mts` feeds it
 * rows read from Supabase. Revenue uses the same VAT/fee assumptions as the
 * margin gate, so the two never disagree.
 */
import { PLANS, TOPUP_PACKS, type PlanId } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { netRevenueUsd, REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

export interface FinanceInput {
  now: Date;
  subscriptions: ReadonlyArray<{ planId: string; status: string }>;
  jobs: ReadonlyArray<{
    status: string;
    modelTier: string;
    apiCostUsd: number;
    createdAt: Date;
  }>;
  /** Ledger rows with reason `topup`, one per purchase (delta = credits granted). */
  topups: ReadonlyArray<{ credits: number; createdAt: Date }>;
  /** Fixed monthly costs in USD (hosting, DB, ElevenLabs plan, domains…), supplied by the owner. */
  fixedMonthlyUsd: number;
}

export interface TierCost {
  jobs: number;
  finished: number;
  apiCostUsd: number;
  /** Mean API cost of a finished video; null when none finished. */
  costPerFinished: number | null;
}

export interface FinanceReport {
  asOf: string;
  payingSubscribers: number;
  subscribersByPlan: Record<PlanId, number>;
  /** Monthly recurring revenue: gross list price (EUR) and net of VAT + Stripe fees (USD). */
  mrrGrossEur: number;
  mrrNetUsd: number;
  topupNetUsd30d: number;
  revenueNetUsd30d: number;
  apiCostUsd30d: number;
  /** API spend that produced no video (failed jobs): pure leakage. */
  failedCostUsd30d: number;
  fixedMonthlyUsd: number;
  /** Net revenue − API spend, before fixed costs. */
  contributionUsd30d: number;
  /** Net revenue − API spend − fixed costs: the cash number. */
  profitUsd30d: number;
  /** Net revenue ÷ API spend; null when nothing was spent. */
  apiMultiple: number | null;
  byTier: Record<string, TierCost>;
  /** Net revenue each paying subscriber must generate to cover fixed costs alone. */
  breakEvenSubscribers: number | null;
}

const DAY_MS = 86_400_000;

export function computeFinance(input: FinanceInput): FinanceReport {
  const since = input.now.getTime() - 30 * DAY_MS;
  const subscribersByPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  let mrrGrossEur = 0;
  let mrrNetUsd = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    const plan = PLANS[sub.planId];
    subscribersByPlan[plan.id] += 1;
    mrrGrossEur += plan.priceCents / 100;
    mrrNetUsd += netRevenueUsd(plan.priceCents, REVENUE_ASSUMPTIONS);
  }
  const payingSubscribers = Object.values(subscribersByPlan).reduce((a, b) => a + b, 0);

  let topupNetUsd30d = 0;
  for (const t of input.topups) {
    if (t.createdAt.getTime() < since) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (pack) topupNetUsd30d += netRevenueUsd(pack.priceCents, REVENUE_ASSUMPTIONS);
  }

  const byTier: Record<string, TierCost> = {};
  let apiCostUsd30d = 0;
  let failedCostUsd30d = 0;
  for (const j of input.jobs) {
    if (j.createdAt.getTime() < since) continue;
    const tier = (byTier[j.modelTier] ??= {
      jobs: 0,
      finished: 0,
      apiCostUsd: 0,
      costPerFinished: null,
    });
    tier.jobs += 1;
    tier.apiCostUsd += j.apiCostUsd;
    apiCostUsd30d += j.apiCostUsd;
    if (j.status === 'done') tier.finished += 1;
    if (j.status === 'failed') failedCostUsd30d += j.apiCostUsd;
  }
  for (const tier of Object.values(byTier)) {
    tier.costPerFinished = tier.finished > 0 ? tier.apiCostUsd / tier.finished : null;
  }

  const revenueNetUsd30d = mrrNetUsd + topupNetUsd30d;
  const contributionUsd30d = revenueNetUsd30d - apiCostUsd30d;
  const netPerSub = payingSubscribers > 0 ? mrrNetUsd / payingSubscribers : null;
  return {
    asOf: input.now.toISOString(),
    payingSubscribers,
    subscribersByPlan,
    mrrGrossEur,
    mrrNetUsd,
    topupNetUsd30d,
    revenueNetUsd30d,
    apiCostUsd30d,
    failedCostUsd30d,
    fixedMonthlyUsd: input.fixedMonthlyUsd,
    contributionUsd30d,
    profitUsd30d: contributionUsd30d - input.fixedMonthlyUsd,
    apiMultiple: apiCostUsd30d > 0 ? revenueNetUsd30d / apiCostUsd30d : null,
    byTier,
    breakEvenSubscribers:
      netPerSub !== null && netPerSub > 0 ? Math.ceil(input.fixedMonthlyUsd / netPerSub) : null,
  };
}
