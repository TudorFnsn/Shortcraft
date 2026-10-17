/**
 * FinOps metrics: MRR, realised API cost per video, gross margin and the
 * "MRR ratio" (API cost / MRR) the FinOps routine watches every run.
 *
 * Pure: the caller loads rows (Supabase in `scripts/finops-report.mts`,
 * fixtures in tests). Money is USD unless a name says otherwise.
 *
 * Definitions:
 * - **MRR:** sum of net monthly revenue (after VAT + Stripe fees, the same math
 *   as the margin gate) of live subscriptions on plans we sell. Top-ups are
 *   one-off, so they are reported as `topUpNetUsd` and kept out of MRR.
 * - **API cost:** `render_jobs.api_cost_usd` of jobs created in the window
 *   (failed jobs are refunded and cost 0 there, so provider spend on failures
 *   is invisible: compare against the provider invoices).
 * - **MRR ratio:** monthly API cost / MRR. Under 1/3 keeps the 3x margin rule.
 * - **Credit yield:** USD of API cost per 1,000 credits charged. Rising yield
 *   means the same credits burn more cash.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { isLiveSubscription } from '@/features/billing/entitlements';

export const DAY_MS = 86_400_000;

export interface FinopsJob {
  tier: string;
  status: string;
  createdAt: Date;
  apiCostUsd: number;
  actualCredits: number;
}

export interface FinopsSubscription {
  planId: string;
  status: string;
}

export interface FinopsInput {
  now: Date;
  /** Window for the cost side, in days (30 = a month). */
  windowDays: number;
  jobs: readonly FinopsJob[];
  subscriptions: readonly FinopsSubscription[];
  /** Net USD of top-ups bought in the window (0 when unknown). */
  topUpNetUsd?: number;
  /** Fixed monthly costs paid regardless of volume (hosting, DB, tools), USD. */
  fixedMonthlyUsd?: number;
}

export interface TierCost {
  tier: string;
  videos: number;
  failed: number;
  apiCostUsd: number;
  avgCostUsd: number;
  avgCredits: number;
  /** USD of API cost per 1,000 credits charged; null with no credits. */
  usdPer1kCredits: number | null;
}

export interface FinopsReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  subscribersByPlan: Record<PlanId, number>;
  mrrUsd: number;
  topUpNetUsd: number;
  apiCostUsd: number;
  /** Window cost scaled to 30 days. */
  apiCostMonthlyUsd: number;
  fixedMonthlyUsd: number;
  /** API cost / MRR; null when MRR is 0. */
  mrrRatio: number | null;
  /** (MRR + top-ups − API − fixed) / (MRR + top-ups); null with no revenue. */
  grossMargin: number | null;
  /** Monthly cash left after API and fixed costs. */
  netCashUsd: number;
  tiers: TierCost[];
}

const round = (n: number, dp = 4) => Number(n.toFixed(dp));

export function computeFinops(input: FinopsInput): FinopsReport {
  const { now, windowDays } = input;
  const since = now.getTime() - windowDays * DAY_MS;
  const subscribersByPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  let mrr = 0;
  for (const s of input.subscriptions) {
    const snap = { planId: s.planId, status: s.status };
    if (!isLiveSubscription(snap)) continue;
    subscribersByPlan[snap.planId] += 1;
    mrr += netRevenueUsd(PLANS[snap.planId].priceCents);
  }

  const byTier = new Map<
    string,
    { videos: number; failed: number; cost: number; credits: number }
  >();
  for (const j of input.jobs) {
    if (j.createdAt.getTime() < since || j.createdAt.getTime() >= now.getTime()) continue;
    const t = byTier.get(j.tier) ?? { videos: 0, failed: 0, cost: 0, credits: 0 };
    if (j.status === 'done') {
      t.videos += 1;
      t.credits += j.actualCredits;
    } else if (j.status === 'failed') t.failed += 1;
    t.cost += j.apiCostUsd;
    byTier.set(j.tier, t);
  }
  const tiers: TierCost[] = [...byTier.entries()]
    .map(([tier, t]) => ({
      tier,
      videos: t.videos,
      failed: t.failed,
      apiCostUsd: round(t.cost),
      avgCostUsd: t.videos ? round(t.cost / t.videos) : 0,
      avgCredits: t.videos ? Math.round(t.credits / t.videos) : 0,
      usdPer1kCredits: t.credits ? round((t.cost / t.credits) * 1000) : null,
    }))
    .sort((a, b) => b.apiCostUsd - a.apiCostUsd);

  const apiCost = tiers.reduce((sum, t) => sum + t.apiCostUsd, 0);
  const apiMonthly = (apiCost / windowDays) * 30;
  const topUp = input.topUpNetUsd ?? 0;
  const fixed = input.fixedMonthlyUsd ?? 0;
  const revenue = mrr + topUp;
  const netCash = revenue - apiMonthly - fixed;

  return {
    asOf: now.toISOString(),
    windowDays,
    payingSubscribers: Object.values(subscribersByPlan).reduce((a, b) => a + b, 0),
    subscribersByPlan,
    mrrUsd: round(mrr, 2),
    topUpNetUsd: round(topUp, 2),
    apiCostUsd: round(apiCost, 2),
    apiCostMonthlyUsd: round(apiMonthly, 2),
    fixedMonthlyUsd: round(fixed, 2),
    mrrRatio: mrr > 0 ? round(apiMonthly / mrr) : null,
    grossMargin: revenue > 0 ? round(netCash / revenue) : null,
    netCashUsd: round(netCash, 2),
    tiers,
  };
}
