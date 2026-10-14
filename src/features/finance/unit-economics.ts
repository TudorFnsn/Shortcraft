/**
 * Unit economics from data we already store: MRR, realized API cost per video
 * and the realized gross margin. Feeds the Finance CEO routine (FinancePlan.md).
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests). Revenue is *modelled* from plan prices (net of VAT and
 * Stripe fees, via the margin gate's `netRevenueUsd`); the Stripe connector is
 * the source of truth for what was actually collected.
 *
 * Definitions:
 * - **MRR:** sum of monthly list prices (gross, EUR) of live subscriptions.
 *   Net MRR applies the margin gate's VAT + Stripe-fee assumptions.
 * - **Realized cost / video:** `render_jobs.api_cost_usd` over jobs that
 *   reached `done`. Failed jobs' spend is reported separately as waste.
 * - **Gross margin (month to date):** net MRR minus all API spend on jobs
 *   created this month, over net MRR. Top-up revenue is excluded (it is not
 *   recurring), so the figure is conservative when top-ups exist.
 */
import { PLANS } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { netRevenueUsd } from '@/features/billing/margin';

export interface FinanceSubscription {
  userId: string;
  planId: string;
  status: string;
}

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface FinanceInput {
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  now: Date;
}

export interface TierCost {
  videos: number;
  avgCostUsd: number | null;
  avgCredits: number | null;
}

export interface FinanceReport {
  asOf: string;
  mrrEur: number;
  netMrrUsd: number;
  payingSubscribers: number;
  byPlan: Record<string, number>;
  arpuEur: number | null;
  monthToDate: {
    jobs: number;
    apiSpendUsd: number;
    /** Spend on jobs that failed or are still running: money not yet earning. */
    wastedSpendUsd: number;
    grossMargin: number | null;
  };
  costPerDoneVideo: Record<string, TierCost>;
  /** Realized USD of API cost per 1,000 credits charged, over done jobs. */
  costUsdPer1kCredits: number | null;
}

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeFinance(input: FinanceInput): FinanceReport {
  const byPlan: Record<string, number> = {};
  let mrrCents = 0;
  let netMrrUsd = 0;
  let payingSubscribers = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    const plan = PLANS[sub.planId];
    payingSubscribers += 1;
    byPlan[plan.id] = (byPlan[plan.id] ?? 0) + 1;
    mrrCents += plan.priceCents;
    netMrrUsd += netRevenueUsd(plan.priceCents);
  }

  const monthStart = Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), 1);
  let jobs = 0;
  let apiSpendUsd = 0;
  let wastedSpendUsd = 0;
  const tiers = new Map<string, { n: number; cost: number; credits: number }>();
  let doneCost = 0;
  let doneCredits = 0;

  for (const j of input.jobs) {
    if (j.createdAt.getTime() >= monthStart) {
      jobs += 1;
      apiSpendUsd += j.apiCostUsd;
      if (j.status !== 'done') wastedSpendUsd += j.apiCostUsd;
    }
    if (j.status === 'done') {
      const t = tiers.get(j.modelTier) ?? { n: 0, cost: 0, credits: 0 };
      t.n += 1;
      t.cost += j.apiCostUsd;
      t.credits += j.actualCredits;
      tiers.set(j.modelTier, t);
      doneCost += j.apiCostUsd;
      doneCredits += j.actualCredits;
    }
  }

  const costPerDoneVideo: Record<string, TierCost> = {};
  for (const [tier, t] of tiers) {
    costPerDoneVideo[tier] = {
      videos: t.n,
      avgCostUsd: round4(t.cost / t.n),
      avgCredits: Math.round(t.credits / t.n),
    };
  }

  return {
    asOf: input.now.toISOString(),
    mrrEur: round2(mrrCents / 100),
    netMrrUsd: round2(netMrrUsd),
    payingSubscribers,
    byPlan,
    arpuEur: payingSubscribers > 0 ? round2(mrrCents / 100 / payingSubscribers) : null,
    monthToDate: {
      jobs,
      apiSpendUsd: round4(apiSpendUsd),
      wastedSpendUsd: round4(wastedSpendUsd),
      grossMargin: netMrrUsd > 0 ? round4((netMrrUsd - apiSpendUsd) / netMrrUsd) : null,
    },
    costPerDoneVideo,
    costUsdPer1kCredits: doneCredits > 0 ? round4((doneCost / doneCredits) * 1000) : null,
  };
}
