/**
 * Unit economics: MRR, cost per finished video, gross margin and break-even,
 * from rows we already store (`subscriptions`, `render_jobs`). No vendor, no
 * new tables.
 *
 * Pure: the caller loads rows and passes `now`, so every number is reproducible
 * (Supabase in `scripts/finance-report.mts`, fixtures in tests).
 *
 * Definitions:
 * - **MRR:** sum of plan list prices (EUR, VAT inclusive) of live subscriptions
 *   (`isLiveSubscription`). `netMrrUsd` removes VAT, converts to USD and takes
 *   Stripe's percent fee and fixed fee per subscriber, i.e. what we keep.
 * - **Variable cost (30d):** `api_cost_usd` summed over jobs created in the last
 *   30 days, including failed jobs (money spent on a video nobody got).
 * - **Gross margin:** (net MRR − 30d variable cost) ÷ net MRR. It is a monthly
 *   proxy: top-up revenue is not stored per purchase here, so it is excluded.
 * - **Credit use:** credits burned on done jobs ÷ credits granted to live
 *   subscribers this month. Unused credits are pure margin (breakage).
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
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface FinanceInput {
  subscriptions: FinanceSubscription[];
  jobs: FinanceJob[];
  fixedCostsUsdPerMonth: number | null;
  cashOnHandUsd: number | null;
  now: Date;
  assumptions?: RevenueAssumptions;
}

export interface TierCost {
  tier: string;
  doneVideos: number;
  avgCostUsd: number | null;
  avgCredits: number | null;
}

export interface FinanceReport {
  asOf: string;
  payingSubscribers: number;
  subscribersByPlan: Record<PlanId, number>;
  mrrEur: number;
  netMrrUsd: number;
  arpuEur: number | null;
  variableCost30dUsd: number;
  wastedOnFailed30dUsd: number;
  doneVideos30d: number;
  avgCostPerDoneVideoUsd: number | null;
  byTier: TierCost[];
  grossMargin: number | null;
  creditUse: number | null;
  /** Net MRR ÷ 30d variable cost; the 3x rule from the margin gate, measured. */
  realizedMultiple: number | null;
  fixedCostsUsdPerMonth: number | null;
  /** Net MRR − variable − fixed per month; null while fixed costs are unknown. */
  monthlyProfitUsd: number | null;
  /** Subscribers needed to cover fixed costs at today's per-subscriber margin. */
  breakEvenSubscribers: number | null;
  runwayMonths: number | null;
}

const round = (n: number, d = 2) => Number(n.toFixed(d));

/** What we keep from one EUR-priced charge: minus VAT and Stripe fees, in USD. */
export function netUsdOf(priceEur: number, a: RevenueAssumptions): number {
  const exVat = priceEur / (1 + a.vatRate);
  const fees = priceEur * a.stripePercentFee + a.stripeFixedFeeEur;
  return Math.max(0, exVat - fees) * a.usdPerEur;
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const since = input.now.getTime() - 30 * DAY_MS;

  const subscribersByPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  let mrrEur = 0;
  let netMrrUsd = 0;
  let creditsGranted = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const plan = PLANS[s.planId];
    subscribersByPlan[s.planId] += 1;
    mrrEur += plan.priceCents / 100;
    netMrrUsd += netUsdOf(plan.priceCents / 100, a);
    creditsGranted += plan.monthlyCredits;
  }
  const payingSubscribers = Object.values(subscribersByPlan).reduce((x, y) => x + y, 0);

  const recent = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const done = recent.filter((j) => j.status === 'done');
  const variableCost30dUsd = recent.reduce((sum, j) => sum + j.apiCostUsd, 0);
  const wastedOnFailed30dUsd = recent
    .filter((j) => j.status === 'failed')
    .reduce((sum, j) => sum + j.apiCostUsd, 0);

  const tiers = [...new Set(done.map((j) => j.modelTier))].sort();
  const byTier: TierCost[] = tiers.map((tier) => {
    const rows = done.filter((j) => j.modelTier === tier);
    return {
      tier,
      doneVideos: rows.length,
      avgCostUsd: round(rows.reduce((s, j) => s + j.apiCostUsd, 0) / rows.length, 4),
      avgCredits: Math.round(rows.reduce((s, j) => s + j.actualCredits, 0) / rows.length),
    };
  });

  const creditsBurned = done.reduce((s, j) => s + j.actualCredits, 0);
  const fixed = input.fixedCostsUsdPerMonth;
  const marginPerSub =
    payingSubscribers > 0 ? (netMrrUsd - variableCost30dUsd) / payingSubscribers : null;
  const monthlyProfitUsd = fixed === null ? null : round(netMrrUsd - variableCost30dUsd - fixed);

  return {
    asOf: input.now.toISOString(),
    payingSubscribers,
    subscribersByPlan,
    mrrEur: round(mrrEur),
    netMrrUsd: round(netMrrUsd),
    arpuEur: payingSubscribers > 0 ? round(mrrEur / payingSubscribers) : null,
    variableCost30dUsd: round(variableCost30dUsd, 4),
    wastedOnFailed30dUsd: round(wastedOnFailed30dUsd, 4),
    doneVideos30d: done.length,
    avgCostPerDoneVideoUsd: done.length > 0 ? round(variableCost30dUsd / done.length, 4) : null,
    byTier,
    grossMargin: netMrrUsd > 0 ? round((netMrrUsd - variableCost30dUsd) / netMrrUsd, 4) : null,
    creditUse: creditsGranted > 0 ? round(creditsBurned / creditsGranted, 4) : null,
    realizedMultiple: variableCost30dUsd > 0 ? round(netMrrUsd / variableCost30dUsd) : null,
    fixedCostsUsdPerMonth: fixed,
    monthlyProfitUsd,
    breakEvenSubscribers:
      fixed !== null && marginPerSub !== null && marginPerSub > 0
        ? Math.ceil(fixed / marginPerSub)
        : null,
    runwayMonths:
      input.cashOnHandUsd !== null && monthlyProfitUsd !== null && monthlyProfitUsd < 0
        ? round(input.cashOnHandUsd / -monthlyProfitUsd, 1)
        : null,
  };
}
