/**
 * Unit economics for the finance routine: MRR, what a video really costs us per
 * tier, and how far monthly net revenue is from covering the fixed bills.
 *
 * Pure: the report script (`scripts/finance-report.mts`) reads the database and
 * `docs/finance/costs.json`, this module only does the math. Revenue uses the
 * same VAT/Stripe/FX assumptions as the margin gate, so the two never disagree.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import {
  netRevenueUsd,
  REVENUE_ASSUMPTIONS,
  type RevenueAssumptions,
} from '@/features/billing/margin';

export interface SubscriptionRow {
  planId: string;
  status: string;
}

export interface JobRow {
  status: string;
  modelTier: string;
  apiCostUsd: number;
  /** Credits actually charged (settled) for the job. */
  credits: number;
}

export interface FixedCost {
  name: string;
  /** Monthly cost in USD. `null` = not yet reported by the owner. */
  monthlyUsd: number | null;
}

export interface Mrr {
  /** Paying subscribers per plan (active, trialing, past_due). */
  subscribers: Record<PlanId, number>;
  /** Sticker MRR in EUR cents, VAT included. */
  grossEurCents: number;
  /** What we keep per month in USD after VAT and Stripe fees. */
  netUsd: number;
}

export function computeMrr(
  subs: readonly SubscriptionRow[],
  assumptions: RevenueAssumptions = REVENUE_ASSUMPTIONS,
): Mrr {
  const subscribers: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  for (const s of subs) if (isLiveSubscription(s)) subscribers[s.planId] += 1;
  let grossEurCents = 0;
  let netUsd = 0;
  for (const id of Object.keys(subscribers) as PlanId[]) {
    grossEurCents += subscribers[id] * PLANS[id].priceCents;
    netUsd += subscribers[id] * netRevenueUsd(PLANS[id].priceCents, assumptions);
  }
  return { subscribers, grossEurCents, netUsd };
}

export interface TierEconomics {
  tier: string;
  finished: number;
  failed: number;
  /** API dollars spent on finished jobs. */
  apiCostUsd: number;
  /** API dollars spent on jobs that failed (refunded to the user: pure loss). */
  wastedUsd: number;
  avgCostPerVideoUsd: number | null;
  creditsCharged: number;
  /** API dollars per 1,000 credits charged (lower is better). */
  costPer1kCreditsUsd: number | null;
}

export function computeTierEconomics(jobs: readonly JobRow[]): TierEconomics[] {
  const tiers = [...new Set(jobs.map((j) => j.modelTier))].sort();
  return tiers.map((tier) => {
    const mine = jobs.filter((j) => j.modelTier === tier);
    const done = mine.filter((j) => j.status === 'done');
    const failed = mine.filter((j) => j.status === 'failed');
    const apiCostUsd = sum(done.map((j) => j.apiCostUsd));
    const creditsCharged = sum(done.map((j) => j.credits));
    return {
      tier,
      finished: done.length,
      failed: failed.length,
      apiCostUsd,
      wastedUsd: sum(failed.map((j) => j.apiCostUsd)),
      avgCostPerVideoUsd: done.length ? apiCostUsd / done.length : null,
      creditsCharged,
      costPer1kCreditsUsd: creditsCharged ? (apiCostUsd / creditsCharged) * 1000 : null,
    };
  });
}

export interface Profit {
  netRevenueUsd: number;
  apiCostUsd: number;
  fixedCostsUsd: number;
  /** Fixed costs the owner has not reported yet; the result is optimistic while this is non-empty. */
  unknownFixedCosts: string[];
  grossProfitUsd: number;
  /** grossProfit / netRevenue, null with no revenue. */
  grossMargin: number | null;
  netProfitUsd: number;
  /** Net revenue needed per month to cover fixed costs at the current gross margin. */
  breakEvenNetRevenueUsd: number | null;
}

export function computeProfit(input: {
  netRevenueUsd: number;
  apiCostUsd: number;
  fixedCosts: readonly FixedCost[];
}): Profit {
  const fixedCostsUsd = sum(input.fixedCosts.map((c) => c.monthlyUsd ?? 0));
  const grossProfitUsd = input.netRevenueUsd - input.apiCostUsd;
  const grossMargin = input.netRevenueUsd > 0 ? grossProfitUsd / input.netRevenueUsd : null;
  return {
    netRevenueUsd: input.netRevenueUsd,
    apiCostUsd: input.apiCostUsd,
    fixedCostsUsd,
    unknownFixedCosts: input.fixedCosts.filter((c) => c.monthlyUsd === null).map((c) => c.name),
    grossProfitUsd,
    grossMargin,
    netProfitUsd: grossProfitUsd - fixedCostsUsd,
    breakEvenNetRevenueUsd: grossMargin && grossMargin > 0 ? fixedCostsUsd / grossMargin : null,
  };
}

function sum(xs: readonly number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
