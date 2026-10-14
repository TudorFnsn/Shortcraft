/**
 * Finance metrics: MRR, what we keep of it, and what the providers cost us.
 *
 * Pure, like `north-star.ts`: the caller loads rows (Supabase in
 * `scripts/finance-report.mts`, fixtures in tests) and passes `now`.
 *
 * Definitions:
 * - **MRR:** sum of the monthly list price (EUR, VAT inclusive) of every live
 *   subscription on a plan we sell. Yearly billing is counted at the monthly
 *   price, so it can overstate cash by the yearly discount.
 * - **Net MRR (USD):** the same subscriptions after VAT and Stripe fees, via
 *   `netRevenueUsd` (the margin gate's own assumptions).
 * - **API cost:** `render_jobs.api_cost_usd` summed over jobs created in the
 *   window, which is what the orchestrator metered. Hosting and SaaS fixed costs
 *   are passed in by the caller (they aren't in the database).
 * - **Gross margin:** (net MRR - API cost in the last 30d) / net MRR. Null with
 *   no net MRR, since a ratio on zero revenue says nothing.
 */
import { PLANS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';

export const DAY_MS = 86_400_000;

export interface FinanceJob {
  status: string;
  createdAt: Date;
  apiCostUsd: number;
  chargedCredits: number;
}

export interface FixedCost {
  name: string;
  monthlyUsd: number;
}

export interface FinanceInput {
  now: Date;
  subscriptions: readonly SubscriptionSnapshot[];
  jobs: readonly FinanceJob[];
  fixedCosts?: readonly FixedCost[];
}

export interface FinanceReport {
  asOf: string;
  payingSubscribers: number;
  mrrEur: number;
  netMrrUsd: number;
  apiCostUsd30d: number;
  fixedCostsUsd: number;
  /** Net MRR - API cost (30d) - fixed costs. Negative = burning cash. */
  monthlyProfitUsd: number;
  grossMargin: number | null;
  videosDone30d: number;
  /** Mean metered API cost of a finished video. Null with none. */
  costPerVideoUsd: number | null;
  /** Credits charged per API dollar over 30d (the live credit scale). */
  creditsPerApiUsd: number | null;
  /** API cost of jobs that failed: money spent for no delivered video. */
  failedCostUsd30d: number;
  byPlan: { planId: string; subscribers: number; mrrEur: number; netUsd: number }[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeFinance(input: FinanceInput): FinanceReport {
  const since = input.now.getTime() - 30 * DAY_MS;
  const live = input.subscriptions.filter(isLiveSubscription);

  const byPlan = Object.values(PLANS)
    .filter((p) => p.priceCents > 0)
    .map((p) => {
      const subscribers = live.filter((s) => s.planId === p.id).length;
      return {
        planId: p.id,
        subscribers,
        mrrEur: round2((subscribers * p.priceCents) / 100),
        netUsd: round2(subscribers * netRevenueUsd(p.priceCents)),
      };
    });

  const mrrEur = round2(byPlan.reduce((s, p) => s + p.mrrEur, 0));
  const netMrrUsd = round2(byPlan.reduce((s, p) => s + p.netUsd, 0));

  const recent = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const done = recent.filter((j) => j.status === 'done');
  const apiCostUsd30d = round2(recent.reduce((s, j) => s + j.apiCostUsd, 0));
  const failedCostUsd30d = round2(
    recent.filter((j) => j.status === 'failed').reduce((s, j) => s + j.apiCostUsd, 0),
  );
  const fixedCostsUsd = round2((input.fixedCosts ?? []).reduce((s, c) => s + c.monthlyUsd, 0));
  const charged = recent.reduce((s, j) => s + j.chargedCredits, 0);

  return {
    asOf: input.now.toISOString(),
    payingSubscribers: live.length,
    mrrEur,
    netMrrUsd,
    apiCostUsd30d,
    fixedCostsUsd,
    monthlyProfitUsd: round2(netMrrUsd - apiCostUsd30d - fixedCostsUsd),
    grossMargin: netMrrUsd > 0 ? (netMrrUsd - apiCostUsd30d) / netMrrUsd : null,
    videosDone30d: done.length,
    costPerVideoUsd: done.length ? apiCostUsd30d / done.length : null,
    creditsPerApiUsd: apiCostUsd30d > 0 ? charged / apiCostUsd30d : null,
    failedCostUsd30d,
    byPlan,
  };
}
