/**
 * Finance metrics: MRR, gross margin and cash view from data we already store
 * (subscriptions, render_jobs.api_cost_usd), so the Finance routine can see the
 * money side without a vendor. Stripe (Sigma / the connector) stays the source
 * of truth for real cash; this is the always-available approximation.
 *
 * Pure: the caller loads rows and passes `now`, so every number is reproducible.
 *
 * Definitions:
 * - **MRR:** sum of the monthly list price (EUR, VAT-inclusive) of live
 *   subscriptions, converted to net USD with the margin gate's assumptions
 *   (minus VAT and Stripe fees). Top-ups are one-off and never in MRR.
 * - **Variable cost:** `render_jobs.api_cost_usd` of jobs created in the window
 *   (failed jobs included: the provider charged us either way).
 * - **Gross margin:** (net revenue - variable cost) / net revenue.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;

export interface FinanceSubscription {
  planId: string;
  status: string;
}

export interface FinanceJob {
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  actualCredits: number;
}

export interface FinanceInput {
  now: Date;
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  /** Fixed monthly spend in USD (hosting, ElevenLabs plan, ...), from FinancePlan §4. */
  fixedMonthlyCostUsd: number;
  /** Window for variable cost, in days. Default 30. */
  windowDays?: number;
  assumptions?: RevenueAssumptions;
}

export interface TierCost {
  tier: string;
  jobs: number;
  apiCostUsd: number;
  avgCostUsd: number | null;
  credits: number;
  /** API cost per 1,000 credits charged: the real cost of the credit scale. */
  costPer1kCredits: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  subscribersByPlan: Record<string, number>;
  grossMrrEur: number;
  netMrrUsd: number;
  variableCostUsd: number;
  fixedCostUsd: number;
  /** Net MRR minus variable and fixed cost, per month. Negative = burning cash. */
  monthlyProfitUsd: number;
  grossMargin: number | null;
  failedCostUsd: number;
  byTier: TierCost[];
}

/** Net USD from one VAT-inclusive EUR charge: VAT out, Stripe fee out, FX in. */
export function netUsdFromGrossEur(
  grossEurCents: number,
  a: RevenueAssumptions = REVENUE_ASSUMPTIONS,
): number {
  const gross = grossEurCents / 100;
  const net = gross / (1 + a.vatRate);
  const afterFees = net - gross * a.stripePercentFee - a.stripeFixedFeeEur;
  return Math.max(0, afterFees) * a.usdPerEur;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const ratio = (n: number, d: number) => (d > 0 ? n / d : null);

export function computeFinance(input: FinanceInput): FinanceReport {
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * DAY_MS;
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;

  const subscribersByPlan: Record<string, number> = {};
  let grossMrrCents = 0;
  let netMrrUsd = 0;
  let payingSubscribers = 0;
  for (const s of input.subscriptions) {
    const plan = PLANS[s.planId as PlanId];
    if (!plan || !isLiveSubscription(s)) continue;
    payingSubscribers += 1;
    subscribersByPlan[plan.id] = (subscribersByPlan[plan.id] ?? 0) + 1;
    grossMrrCents += plan.priceCents;
    netMrrUsd += netUsdFromGrossEur(plan.priceCents, a);
  }

  const tiers = new Map<string, { jobs: number; cost: number; credits: number }>();
  let variableCostUsd = 0;
  let failedCostUsd = 0;
  for (const j of input.jobs) {
    if (j.createdAt.getTime() < since || j.createdAt.getTime() >= input.now.getTime()) continue;
    variableCostUsd += j.apiCostUsd;
    if (j.status === 'failed') failedCostUsd += j.apiCostUsd;
    const t = tiers.get(j.modelTier) ?? { jobs: 0, cost: 0, credits: 0 };
    t.jobs += 1;
    t.cost += j.apiCostUsd;
    t.credits += j.actualCredits;
    tiers.set(j.modelTier, t);
  }

  // Variable cost is per `windowDays`; scale to a month so profit is comparable with MRR.
  const monthlyVariable = (variableCostUsd * 30) / windowDays;
  const monthlyProfitUsd = netMrrUsd - monthlyVariable - input.fixedMonthlyCostUsd;

  return {
    asOf: input.now.toISOString(),
    windowDays,
    payingSubscribers,
    subscribersByPlan,
    grossMrrEur: round2(grossMrrCents / 100),
    netMrrUsd: round2(netMrrUsd),
    variableCostUsd: round2(variableCostUsd),
    fixedCostUsd: round2(input.fixedMonthlyCostUsd),
    monthlyProfitUsd: round2(monthlyProfitUsd),
    grossMargin: ratio(netMrrUsd - monthlyVariable, netMrrUsd),
    failedCostUsd: round2(failedCostUsd),
    byTier: [...tiers.entries()]
      .map(([tier, t]) => ({
        tier,
        jobs: t.jobs,
        apiCostUsd: round2(t.cost),
        avgCostUsd: t.jobs > 0 ? round2(t.cost / t.jobs) : null,
        credits: t.credits,
        costPer1kCredits: ratio(t.cost * 1000, t.credits),
      }))
      .sort((x, y) => y.apiCostUsd - x.apiCostUsd),
  };
}
