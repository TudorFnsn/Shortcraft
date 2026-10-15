/**
 * Unit economics for the finance routine: MRR, realised API cost vs credits
 * burned, and gross margin, computed from rows we already store. No new tables.
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests).
 *
 * - **MRR:** sum of monthly list price (EUR cents, VAT-inclusive) of live
 *   subscriptions on plans we sell. Net MRR strips VAT using the margin gate's
 *   assumptions. Yearly billing is not sold yet, so every plan counts monthly.
 * - **Realised cost:** `render_jobs.api_cost_usd` of jobs that reached `done`
 *   (failed jobs are reported separately: they burn provider money for no
 *   video).
 * - **Cost per credit:** realised cost / credits actually settled
 *   (`actual_credits`). Compare it with the 3x gate in `billing/margin.ts`.
 */
import { PLANS } from '@/config/plans';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

export interface CostJob {
  status: string;
  modelTier: string;
  actualCredits: number;
  apiCostUsd: number;
}

export interface TierEconomics {
  jobs: number;
  credits: number;
  costUsd: number;
  costPerCreditUsd: number | null;
}

export interface UnitEconomics {
  mrrEur: number;
  netMrrUsd: number;
  payingSubscribers: number;
  byPlan: Record<string, { subscribers: number; mrrEur: number }>;
  doneJobs: number;
  failedJobs: number;
  /** Provider money spent on jobs that failed (no video delivered). */
  failedCostUsd: number;
  byTier: Record<string, TierEconomics>;
  totalCostUsd: number;
  /** netMrrUsd - totalCostUsd is only meaningful when both cover the same period. */
  costToNetMrr: number | null;
}

export function computeUnitEconomics(input: {
  subscriptions: readonly SubscriptionSnapshot[];
  jobs: readonly CostJob[];
}): UnitEconomics {
  const byPlan: UnitEconomics['byPlan'] = {};
  let mrrCents = 0;
  let payingSubscribers = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    const plan = PLANS[sub.planId];
    payingSubscribers += 1;
    mrrCents += plan.priceCents;
    const row = (byPlan[plan.id] ??= { subscribers: 0, mrrEur: 0 });
    row.subscribers += 1;
    row.mrrEur += plan.priceCents / 100;
  }

  const { vatRate, stripePercentFee, usdPerEur } = REVENUE_ASSUMPTIONS;
  const mrrEur = mrrCents / 100;
  // Percent fee only; the fixed fee depends on charge count, which MRR can't see
  // exactly, so it is charged once per subscriber.
  const netMrrUsd =
    (mrrEur / (1 + vatRate)) * (1 - stripePercentFee) * usdPerEur -
    payingSubscribers * REVENUE_ASSUMPTIONS.stripeFixedFeeEur * usdPerEur;

  const byTier: Record<string, TierEconomics> = {};
  let doneJobs = 0;
  let failedJobs = 0;
  let failedCostUsd = 0;
  let totalCostUsd = 0;
  for (const job of input.jobs) {
    totalCostUsd += job.apiCostUsd;
    if (job.status === 'failed') {
      failedJobs += 1;
      failedCostUsd += job.apiCostUsd;
      continue;
    }
    if (job.status !== 'done') continue;
    doneJobs += 1;
    const t = (byTier[job.modelTier] ??= {
      jobs: 0,
      credits: 0,
      costUsd: 0,
      costPerCreditUsd: null,
    });
    t.jobs += 1;
    t.credits += job.actualCredits;
    t.costUsd += job.apiCostUsd;
  }
  for (const t of Object.values(byTier)) {
    t.costPerCreditUsd = t.credits > 0 ? t.costUsd / t.credits : null;
  }

  return {
    mrrEur,
    netMrrUsd: Math.max(netMrrUsd, 0),
    payingSubscribers,
    byPlan,
    doneJobs,
    failedJobs,
    failedCostUsd,
    byTier,
    totalCostUsd,
    costToNetMrr: netMrrUsd > 0 ? totalCostUsd / netMrrUsd : null,
  };
}
