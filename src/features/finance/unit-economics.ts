/**
 * Unit economics for the Finance CEO routine: MRR, what a finished video costs
 * us, what it earned, and what failures and fixed costs eat.
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`.
 *
 * Definitions:
 * - **MRR:** the sum of list prices (EUR, converted at `eurUsd`) of live
 *   subscriptions (`isLiveSubscription`). Top-ups are one-off, so they are
 *   reported separately as `topUpRevenueUsd` and never counted in MRR.
 * - **Credit value:** net revenue per credit = plan price after VAT and Stripe
 *   fees ÷ monthly credits (`REVENUE_ASSUMPTIONS` from the margin gate). A
 *   job's revenue is the credits it settled (`charged_credits`) × that value
 *   at the cheapest plan's rate, so it is a conservative figure.
 * - **Variable cost:** `api_cost_usd` summed over all jobs, failed ones too:
 *   a failed render still spent money on the steps that ran.
 * - **Gross margin:** (earned revenue − variable cost) ÷ earned revenue.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { OPS_COSTS } from '@/config/ops-costs';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { netRevenueUsd, REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

export interface FinanceJob {
  status: string;
  modelTier: string;
  targetDurationSec: number;
  chargedCredits: number;
  apiCostUsd: number;
  createdAt: Date;
}

export interface FinanceSubscription {
  planId: string;
  status: string;
}

export interface FinanceInput {
  jobs: readonly FinanceJob[];
  subscriptions: readonly FinanceSubscription[];
  /** Gross top-up revenue in EUR cents over the window (from Stripe or the ledger). */
  topUpRevenueCents: number;
  /** Jobs created at or after this instant are in the window. */
  since: Date;
  /** EUR → USD. Pass a real rate; the report script defaults to a stated assumption. */
  eurUsd: number;
}

export interface TierEconomics {
  tier: string;
  doneVideos: number;
  /** Average API cost of a finished video, USD. null when there are none. */
  avgCostUsd: number | null;
  /** Average credits charged for a finished video. */
  avgCredits: number | null;
  /** Average finished-video length in seconds. */
  avgDurationSec: number | null;
  /** Cost per finished second of video. */
  costPerSecondUsd: number | null;
}

export interface FinanceReport {
  mrrEur: number;
  mrrUsd: number;
  liveSubscribers: number;
  topUpRevenueUsd: number;
  jobsInWindow: number;
  failedJobs: number;
  /** API spend on jobs that never produced a video. */
  failedCostUsd: number;
  variableCostUsd: number;
  earnedRevenueUsd: number;
  grossMargin: number | null;
  fixedCostUsdPerMonth: number;
  /** Fixed-cost lines still `null` (the fixed total is a lower bound while any are). */
  unknownFixedCosts: string[];
  tiers: TierEconomics[];
}

const ratio = (n: number, d: number): number | null => (d > 0 ? n / d : null);

/** Net USD revenue per credit at a plan's rate (after VAT and Stripe fees). */
export function netUsdPerCredit(planId: PlanId, eurUsd: number): number {
  const plan = PLANS[planId];
  return (
    netRevenueUsd(plan.priceCents, { ...REVENUE_ASSUMPTIONS, usdPerEur: eurUsd }) /
    plan.monthlyCredits
  );
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const live = input.subscriptions.filter(isLiveSubscription);
  const mrrEur = live.reduce((sum, s) => sum + PLANS[s.planId].priceCents / 100, 0);

  const jobs = input.jobs.filter((j) => j.createdAt >= input.since);
  const done = jobs.filter((j) => j.status === 'done');
  const failed = jobs.filter((j) => j.status === 'failed');

  // Cheapest plan rate = lowest revenue per credit = conservative earned revenue.
  const floorRate = Math.min(
    ...(Object.keys(PLANS) as PlanId[]).map((p) => netUsdPerCredit(p, input.eurUsd)),
  );
  const earnedRevenueUsd = done.reduce((s, j) => s + j.chargedCredits, 0) * floorRate;
  const variableCostUsd = jobs.reduce((s, j) => s + j.apiCostUsd, 0);

  const tiers = [...new Set(done.map((j) => j.modelTier))].sort().map((tier): TierEconomics => {
    const t = done.filter((j) => j.modelTier === tier);
    const cost = t.reduce((s, j) => s + j.apiCostUsd, 0);
    const credits = t.reduce((s, j) => s + j.chargedCredits, 0);
    const secs = t.reduce((s, j) => s + j.targetDurationSec, 0);
    return {
      tier,
      doneVideos: t.length,
      avgCostUsd: ratio(cost, t.length),
      avgCredits: ratio(credits, t.length),
      avgDurationSec: ratio(secs, t.length),
      costPerSecondUsd: ratio(cost, secs),
    };
  });

  return {
    mrrEur,
    mrrUsd: mrrEur * input.eurUsd,
    liveSubscribers: live.length,
    topUpRevenueUsd: (input.topUpRevenueCents / 100) * input.eurUsd,
    jobsInWindow: jobs.length,
    failedJobs: failed.length,
    failedCostUsd: failed.reduce((s, j) => s + j.apiCostUsd, 0),
    variableCostUsd,
    earnedRevenueUsd,
    grossMargin:
      earnedRevenueUsd > 0 ? (earnedRevenueUsd - variableCostUsd) / earnedRevenueUsd : null,
    fixedCostUsdPerMonth: OPS_COSTS.reduce((s, c) => s + (c.usdPerMonth ?? 0), 0),
    unknownFixedCosts: OPS_COSTS.filter((c) => c.usdPerMonth === null).map((c) => c.label),
    tiers,
  };
}
