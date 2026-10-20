/**
 * Finance metrics: MRR, what a finished video costs us, and the MRR ratio
 * (net MRR ÷ all monthly cost). Companion to `north-star.ts`; used by
 * `scripts/finance-report.mts` and the Finance CFO routine.
 *
 * Pure: the caller loads rows and passes `now`.
 *
 * Definitions:
 * - **MRR:** sum of list prices of live subscriptions on plans we sell
 *   (`isLiveSubscription`). The subscriptions table stores no billing interval,
 *   so yearly plans would be overstated; Stripe is the source for exact MRR.
 * - **Net MRR:** MRR after VAT and Stripe fees (`REVENUE_ASSUMPTIONS`), in USD.
 * - **Variable cost (30d):** `api_cost_usd` of every job created in the last 30
 *   days, including failed ones: a failed render still spent provider money.
 * - **MRR ratio:** net MRR ÷ (variable cost 30d + known fixed costs). Below 1
 *   the app loses cash; the CFO routine's target is ≥ 3.
 * - Top-up revenue is not in MRR (one-off) and not derivable from the ledger.
 */
import { FIXED_COSTS, type FixedCost } from '@/config/finance';
import { PLANS } from '@/config/plans';
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { DAY_MS } from './north-star';

export interface FinanceJob {
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  actualCredits: number;
}

export interface FinanceInput {
  now: Date;
  subscriptions: readonly SubscriptionSnapshot[];
  jobs: readonly FinanceJob[];
  fixedCosts?: readonly FixedCost[];
  assumptions?: RevenueAssumptions;
}

export interface TierCost {
  tier: string;
  jobs: number;
  done: number;
  costUsd: number;
  /** Variable cost per finished video (all spend ÷ done), null with none done. */
  costPerDoneUsd: number | null;
  /** Provider USD spent per 1,000 credits charged (lower = fatter margin). */
  costPer1kCreditsUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  payingSubscribers: number;
  mrrEur: number;
  /** MRR after VAT + Stripe fees, USD. */
  netMrrUsd: number;
  arpuEur: number | null;
  variableCost30dUsd: number;
  /** Failed-job spend as a share of variable cost, null when nothing spent. */
  failedShareOfCost: number | null;
  fixedKnownUsd: number;
  fixedUnknownVendors: string[];
  totalCostUsd: number;
  /** Net MRR ÷ total monthly cost; null when there is no cost to divide by. */
  mrrRatio: number | null;
  grossMarginPct: number | null;
  byTier: TierCost[];
}

const round = (n: number, dp = 4) => Number(n.toFixed(dp));

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now, subscriptions, jobs } = input;
  const fixed = input.fixedCosts ?? FIXED_COSTS;
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;

  let mrrEur = 0;
  let netEur = 0;
  let payers = 0;
  for (const s of subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const priceEur = PLANS[s.planId].priceCents / 100;
    payers += 1;
    mrrEur += priceEur;
    netEur += priceEur / (1 + a.vatRate) - (priceEur * a.stripePercentFee + a.stripeFixedFeeEur);
  }
  const netMrrUsd = netEur * a.usdPerEur;

  const since = now.getTime() - 30 * DAY_MS;
  const recent = jobs.filter((j) => j.createdAt.getTime() >= since && j.createdAt <= now);
  const variable = recent.reduce((sum, j) => sum + j.apiCostUsd, 0);
  const failedCost = recent
    .filter((j) => j.status === 'failed')
    .reduce((sum, j) => sum + j.apiCostUsd, 0);

  const tiers = new Map<string, FinanceJob[]>();
  for (const j of recent) tiers.set(j.modelTier, [...(tiers.get(j.modelTier) ?? []), j]);
  const byTier: TierCost[] = [...tiers.entries()]
    .map(([tier, list]) => {
      const done = list.filter((j) => j.status === 'done').length;
      const costUsd = list.reduce((s, j) => s + j.apiCostUsd, 0);
      const credits = list.reduce((s, j) => s + j.actualCredits, 0);
      return {
        tier,
        jobs: list.length,
        done,
        costUsd: round(costUsd),
        costPerDoneUsd: done ? round(costUsd / done) : null,
        costPer1kCreditsUsd: credits ? round((costUsd / credits) * 1000) : null,
      };
    })
    .sort((x, y) => y.costUsd - x.costUsd);

  const fixedKnownUsd = fixed.reduce((s, f) => s + (f.monthlyUsd ?? 0), 0);
  const total = variable + fixedKnownUsd;

  return {
    asOf: now.toISOString(),
    payingSubscribers: payers,
    mrrEur: round(mrrEur, 2),
    netMrrUsd: round(netMrrUsd, 2),
    arpuEur: payers ? round(mrrEur / payers, 2) : null,
    variableCost30dUsd: round(variable, 2),
    failedShareOfCost: variable > 0 ? round(failedCost / variable) : null,
    fixedKnownUsd: round(fixedKnownUsd, 2),
    fixedUnknownVendors: fixed.filter((f) => f.monthlyUsd === null).map((f) => f.vendor),
    totalCostUsd: round(total, 2),
    mrrRatio: total > 0 ? round(netMrrUsd / total, 2) : null,
    grossMarginPct: netMrrUsd > 0 ? round(((netMrrUsd - total) / netMrrUsd) * 100, 1) : null,
    byTier,
  };
}
