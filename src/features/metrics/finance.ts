/**
 * Finance metrics: MRR and the measured unit economics behind the margin gate
 * (TheMasterPlan §7), computed from rows we already store. No new tables.
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) so every number is reproducible.
 *
 * Definitions:
 * - **MRR:** sum of the list price of every live subscription (net of VAT and
 *   Stripe fees via `netRevenueUsd` for `netMrrUsd`). Yearly plans don't exist yet.
 * - **Measured cost:** `render_jobs.api_cost_usd` of jobs that reached `done`.
 *   Failed jobs are reported separately as burned cost: money spent, no video.
 * - **Cost per credit:** measured USD per credit actually charged on done jobs.
 *   The gate assumes `1 / 12,000` or better for Standard; compare.
 * - **Gross margin (month to date proxy):** net MRR minus API cost of the last
 *   30 days of jobs. A proxy: it ignores top-ups and non-API costs (hosting,
 *   ElevenLabs/Supabase plans), which the Finance CEO adds from the connectors.
 */
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { netRevenueUsd } from '@/features/billing/margin';
import { PLANS } from '@/config/plans';

export const DAY_MS = 86_400_000;

export interface FinanceJob {
  status: string;
  modelTier: string;
  createdAt: Date;
  actualCredits: number;
  apiCostUsd: number;
}

export interface FinanceInput {
  now: Date;
  jobs: readonly FinanceJob[];
  subscriptions: readonly SubscriptionSnapshot[];
  /** Days of jobs the cost figures cover. Default 30. */
  windowDays?: number;
}

export interface TierEconomics {
  tier: string;
  doneJobs: number;
  creditsCharged: number;
  apiCostUsd: number;
  avgCostPerVideoUsd: number | null;
  costPerCreditUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  mrrEur: number;
  netMrrUsd: number;
  payingByPlan: Record<string, number>;
  arpuEur: number | null;
  doneJobs: number;
  apiCostUsd: number;
  burnedFailedCostUsd: number;
  avgCostPerVideoUsd: number | null;
  /** Cost of this window's jobs as a share of net MRR; null without MRR. */
  apiCostShareOfNetMrr: number | null;
  grossMarginProxyUsd: number;
  tiers: TierEconomics[];
}

const ratio = (n: number, d: number) => (d > 0 ? n / d : null);

export function computeFinance(input: FinanceInput): FinanceReport {
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * DAY_MS;
  const jobs = input.jobs.filter((j) => j.createdAt.getTime() >= since);

  const payingByPlan: Record<string, number> = {};
  let mrrCents = 0;
  let netMrrUsd = 0;
  let paying = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    const plan = PLANS[sub.planId];
    payingByPlan[plan.id] = (payingByPlan[plan.id] ?? 0) + 1;
    mrrCents += plan.priceCents;
    netMrrUsd += netRevenueUsd(plan.priceCents);
    paying += 1;
  }

  const done = jobs.filter((j) => j.status === 'done');
  const failed = jobs.filter((j) => j.status === 'failed');
  const sum = (xs: readonly FinanceJob[], f: (j: FinanceJob) => number) =>
    xs.reduce((a, j) => a + f(j), 0);
  const apiCostUsd = sum(done, (j) => j.apiCostUsd);

  const tiers = [...new Set(done.map((j) => j.modelTier))].sort().map((tier): TierEconomics => {
    const t = done.filter((j) => j.modelTier === tier);
    const cost = sum(t, (j) => j.apiCostUsd);
    const credits = sum(t, (j) => j.actualCredits);
    return {
      tier,
      doneJobs: t.length,
      creditsCharged: credits,
      apiCostUsd: cost,
      avgCostPerVideoUsd: ratio(cost, t.length),
      costPerCreditUsd: ratio(cost, credits),
    };
  });

  const burned = sum(failed, (j) => j.apiCostUsd);
  return {
    asOf: input.now.toISOString(),
    windowDays,
    mrrEur: mrrCents / 100,
    netMrrUsd,
    payingByPlan,
    arpuEur: ratio(mrrCents / 100, paying),
    doneJobs: done.length,
    apiCostUsd,
    burnedFailedCostUsd: burned,
    avgCostPerVideoUsd: ratio(apiCostUsd, done.length),
    apiCostShareOfNetMrr: ratio(apiCostUsd + burned, netMrrUsd),
    grossMarginProxyUsd: netMrrUsd - apiCostUsd - burned,
    tiers,
  };
}
