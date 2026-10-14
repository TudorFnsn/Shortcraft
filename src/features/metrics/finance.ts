/**
 * Finance snapshot: MRR, API spend and gross margin from data we already store.
 * Pure — the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests).
 *
 * - **MRR:** sum of the monthly price of every live subscription on a plan we sell
 *   (gross, VAT inclusive, EUR). **Net MRR** removes VAT and Stripe's fee, in USD,
 *   using the same assumptions as the margin gate.
 * - **API spend:** `render_jobs.api_cost_usd` (metered per provider call) over the
 *   window, for finished jobs; failed jobs are refunded to the user, so their
 *   cost is shown separately as waste.
 * - **Gross margin (month to date):** net MRR − API spend of the last 30 days.
 *   A run-rate proxy, not accounting: it ignores fixed costs, which the caller
 *   adds from `FinancePlan.md` §3.
 */
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';
import { PLANS, type PlanId } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';

export const DAY_MS = 86_400_000;

export interface FinanceSub {
  planId: string;
  status: string;
}

export interface FinanceJob {
  status: string;
  apiCostUsd: number;
  createdAt: Date;
}

export interface FinanceReport {
  asOf: string;
  liveSubscribers: number;
  byPlan: Record<string, number>;
  mrrEur: number;
  netMrrUsd: number;
  apiSpend30dUsd: number;
  wastedOnFailed30dUsd: number;
  doneVideos30d: number;
  costPerDoneVideoUsd: number | null;
  /** (net MRR − API spend) / net MRR, or null when there is no revenue. */
  grossMargin: number | null;
}

const netUsd = (grossEur: number, payments: number) => {
  const a = REVENUE_ASSUMPTIONS;
  const afterVat = grossEur / (1 + a.vatRate);
  const afterFees = afterVat - grossEur * a.stripePercentFee - a.stripeFixedFeeEur * payments;
  return afterFees * a.usdPerEur;
};

export function computeFinance(input: {
  subs: readonly FinanceSub[];
  jobs: readonly FinanceJob[];
  now: Date;
}): FinanceReport {
  const live = input.subs.filter((s) => isLiveSubscription(s) && s.planId in PLANS);
  const byPlan: Record<string, number> = {};
  let grossCents = 0;
  for (const s of live) {
    byPlan[s.planId] = (byPlan[s.planId] ?? 0) + 1;
    grossCents += PLANS[s.planId as PlanId].priceCents;
  }
  const mrrEur = grossCents / 100;
  const netMrrUsd = netUsd(mrrEur, live.length);

  const since = input.now.getTime() - 30 * DAY_MS;
  const recent = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const done = recent.filter((j) => j.status === 'done');
  const doneCost = done.reduce((t, j) => t + j.apiCostUsd, 0);
  const failedCost = recent
    .filter((j) => j.status === 'failed')
    .reduce((t, j) => t + j.apiCostUsd, 0);
  const apiSpend = doneCost + failedCost;

  return {
    asOf: input.now.toISOString(),
    liveSubscribers: live.length,
    byPlan,
    mrrEur,
    netMrrUsd,
    apiSpend30dUsd: apiSpend,
    wastedOnFailed30dUsd: failedCost,
    doneVideos30d: done.length,
    costPerDoneVideoUsd: done.length ? doneCost / done.length : null,
    grossMargin: netMrrUsd > 0 ? (netMrrUsd - apiSpend) / netMrrUsd : null,
  };
}
