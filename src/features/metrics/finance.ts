/**
 * Finance metrics: MRR and what a video costs us against what it earns.
 * Pure functions; `scripts/finance-report.mts` feeds them rows from the DB.
 * Revenue math reuses the margin gate's assumptions (VAT, Stripe fees, FX).
 */
import { PLANS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { isLiveSubscription } from '@/features/billing/entitlements';

export interface SubRow {
  plan_id: string;
  status: string;
}
export interface JobRow {
  status: string;
  model_tier: string;
  target_duration_sec: number;
  actual_credits: number;
  api_cost_usd: number;
}

export interface FinanceReport {
  payingSubscribers: number;
  /** Gross monthly recurring revenue in EUR (plan list prices of live subscriptions). */
  mrrEur: number;
  /** Same, after VAT and Stripe fees, in USD. */
  netMrrUsd: number;
  doneJobs: number;
  failedJobs: number;
  apiCostUsd: number;
  avgCostPerDoneVideoUsd: number;
  byTier: Record<string, { jobs: number; apiCostUsd: number; credits: number }>;
  /** USD of API cost per 1,000 credits spent (the cost side of the credit scale). */
  costPer1kCreditsUsd: number;
  /** Net MRR ÷ API cost scaled to a month; null until jobs exist. */
  apiCostShareOfNetMrr: number | null;
}

export function computeFinance(subs: SubRow[], jobs: JobRow[]): FinanceReport {
  const live = subs.filter((s) => isLiveSubscription({ planId: s.plan_id, status: s.status }));
  let mrrEur = 0;
  let netMrrUsd = 0;
  for (const s of live) {
    const plan = PLANS[s.plan_id as keyof typeof PLANS];
    if (!plan) continue;
    mrrEur += plan.priceCents / 100;
    netMrrUsd += netRevenueUsd(plan.priceCents);
  }
  const done = jobs.filter((j) => j.status === 'done');
  const byTier: FinanceReport['byTier'] = {};
  let apiCostUsd = 0;
  let credits = 0;
  for (const j of jobs) {
    apiCostUsd += Number(j.api_cost_usd);
    credits += Number(j.actual_credits);
    const t = (byTier[j.model_tier] ??= { jobs: 0, apiCostUsd: 0, credits: 0 });
    t.jobs += 1;
    t.apiCostUsd += Number(j.api_cost_usd);
    t.credits += Number(j.actual_credits);
  }
  return {
    payingSubscribers: live.length,
    mrrEur,
    netMrrUsd,
    doneJobs: done.length,
    failedJobs: jobs.filter((j) => j.status === 'failed').length,
    apiCostUsd,
    avgCostPerDoneVideoUsd: done.length
      ? done.reduce((n, j) => n + Number(j.api_cost_usd), 0) / done.length
      : 0,
    byTier,
    costPer1kCreditsUsd: credits ? (apiCostUsd / credits) * 1000 : 0,
    apiCostShareOfNetMrr: netMrrUsd > 0 ? apiCostUsd / netMrrUsd : null,
  };
}
