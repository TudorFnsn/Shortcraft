/**
 * Unit economics from data we already store: MRR, API cost per finished video,
 * and contribution after fixed costs. Pure: the caller loads rows (Supabase in
 * `scripts/finance-report.mts`, fixtures in tests) and passes `now`.
 *
 * - **MRR:** sum of monthly list prices (EUR) of live subscriptions, converted
 *   to USD at the margin gate's FX rate. Gross: before VAT and Stripe fees.
 *   Yearly plans are not stored separately, so they count at the monthly price.
 * - **Net MRR:** MRR after the margin gate's VAT and Stripe fee assumptions.
 * - **API cost:** `render_jobs.api_cost_usd` (metered per job), by tier, for
 *   jobs created in the last 30 days. Failed jobs count: we paid for the work.
 * - **Contribution:** net MRR minus 30-day API cost minus monthly fixed costs.
 */
import { PLANS } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

const DAY_MS = 86_400_000;

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

export interface FixedCosts {
  /** Monthly fixed costs in USD, by line item (hosting, database, email, …). */
  monthlyUsd: Record<string, number>;
}

export interface TierCost {
  tier: string;
  jobs: number;
  doneJobs: number;
  costUsd: number;
  costPerDoneVideoUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  payingSubscribers: number;
  mrrEur: number;
  mrrUsd: number;
  netMrrUsd: number;
  apiCost30dUsd: number;
  wastedOnFailedUsd: number;
  fixedCostsUsd: number;
  contributionUsd: number;
  /** Net MRR ÷ (API cost + fixed costs); null when there are no costs. */
  coverage: number | null;
  tiers: TierCost[];
}

export function computeFinance(input: {
  now: Date;
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  fixed?: FixedCosts;
}): FinanceReport {
  const { vatRate, stripePercentFee, stripeFixedFeeEur, usdPerEur } = REVENUE_ASSUMPTIONS;

  let mrrCents = 0;
  let payingSubscribers = 0;
  let netEur = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    const cents = PLANS[sub.planId].priceCents;
    payingSubscribers += 1;
    mrrCents += cents;
    const gross = cents / 100;
    netEur += gross / (1 + vatRate) - (gross * stripePercentFee + stripeFixedFeeEur);
  }

  const since = input.now.getTime() - 30 * DAY_MS;
  const byTier = new Map<string, TierCost>();
  let apiCost = 0;
  let wasted = 0;
  for (const job of input.jobs) {
    if (job.createdAt.getTime() < since) continue;
    const row = byTier.get(job.modelTier) ?? {
      tier: job.modelTier,
      jobs: 0,
      doneJobs: 0,
      costUsd: 0,
      costPerDoneVideoUsd: null,
    };
    row.jobs += 1;
    row.costUsd += job.apiCostUsd;
    if (job.status === 'done') row.doneJobs += 1;
    else if (job.status === 'failed') wasted += job.apiCostUsd;
    apiCost += job.apiCostUsd;
    byTier.set(job.modelTier, row);
  }
  const tiers = [...byTier.values()]
    .map((t) => ({ ...t, costPerDoneVideoUsd: t.doneJobs ? t.costUsd / t.doneJobs : null }))
    .sort((a, b) => a.tier.localeCompare(b.tier));

  const fixedCosts = Object.values(input.fixed?.monthlyUsd ?? {}).reduce((a, b) => a + b, 0);
  const netMrrUsd = netEur * usdPerEur;
  const totalCost = apiCost + fixedCosts;
  return {
    asOf: input.now.toISOString(),
    payingSubscribers,
    mrrEur: mrrCents / 100,
    mrrUsd: (mrrCents / 100) * usdPerEur,
    netMrrUsd,
    apiCost30dUsd: apiCost,
    wastedOnFailedUsd: wasted,
    fixedCostsUsd: fixedCosts,
    contributionUsd: netMrrUsd - totalCost,
    coverage: totalCost > 0 ? netMrrUsd / totalCost : null,
    tiers,
  };
}
