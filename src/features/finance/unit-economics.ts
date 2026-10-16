/**
 * Unit economics for the Finance routine: MRR, net revenue after VAT + Stripe
 * fees, API cost per finished video and gross margin. Pure; the data comes from
 * `scripts/finance-report.mts` (read-only). Definitions live here so the routine
 * and the tests agree.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';

export interface FinanceSub {
  planId: string;
  /** True when the subscription grants paid access (see `isLiveSubscription`). */
  live: boolean;
}

export interface FinanceJob {
  status: string;
  modelTier: string;
  apiCostUsd: number;
  chargedCredits: number;
}

export interface FinanceInput {
  subs: readonly FinanceSub[];
  jobs: readonly FinanceJob[];
  /** Recurring + top-up revenue actually collected this month, EUR cents, if known (Stripe). */
  collectedEurCents?: number;
  /** Fixed monthly costs in USD (hosting, Supabase, ElevenLabs plan, Sentry...). */
  fixedCostsUsd?: number;
  assumptions?: RevenueAssumptions;
}

export interface TierEconomics {
  videos: number;
  apiCostUsd: number;
  avgCostPerVideoUsd: number | null;
  avgChargedCredits: number | null;
}

export interface FinanceReport {
  payingSubscribers: number;
  /** Gross MRR in EUR (VAT included, as customers see it). */
  mrrEur: number;
  /** MRR after VAT and Stripe fees, in USD. */
  netMrrUsd: number;
  arrEur: number;
  arpuEur: number | null;
  /** Provider cost of every job on record, USD (all time, not monthly), failed ones included. */
  apiCostUsd: number;
  /** The part of `apiCostUsd` spent on jobs that did not finish (refunded to the user). */
  failedCostUsd: number;
  tiers: Record<'standard' | 'premium', TierEconomics>;
  fixedCostsUsd: number;
  /** Net MRR minus fixed costs (monthly run-rate; API cost is all-time so it is not subtracted). */
  runRateAfterFixedUsd: number;
  /** Months of fixed cost the net MRR covers; null with no fixed costs. */
  fixedCostCoverage: number | null;
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Net USD from one gross EUR monthly charge: strip VAT, then Stripe's fee. */
export function netUsdFromGrossEur(grossEur: number, a: RevenueAssumptions): number {
  const exVat = grossEur / (1 + a.vatRate);
  return (exVat - (grossEur * a.stripePercentFee + a.stripeFixedFeeEur)) * a.usdPerEur;
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const live = input.subs.filter((s) => s.live);
  let mrrEur = 0;
  let netMrrUsd = 0;
  for (const s of live) {
    const plan = PLANS[s.planId as PlanId];
    if (!plan) continue;
    const eur = plan.priceCents / 100;
    mrrEur += eur;
    netMrrUsd += netUsdFromGrossEur(eur, a);
  }

  const tiers = {
    standard: { videos: 0, apiCostUsd: 0, credits: 0 },
    premium: { videos: 0, apiCostUsd: 0, credits: 0 },
  };
  let failedCost = 0;
  let allCost = 0;
  for (const j of input.jobs) {
    allCost += j.apiCostUsd;
    if (j.status === 'failed') failedCost += j.apiCostUsd;
    if (j.status !== 'done' && j.status !== 'completed') continue;
    const t = j.modelTier === 'premium' ? tiers.premium : tiers.standard;
    t.videos += 1;
    t.apiCostUsd += j.apiCostUsd;
    t.credits += j.chargedCredits;
  }
  const tier = (t: typeof tiers.standard): TierEconomics => ({
    videos: t.videos,
    apiCostUsd: round(t.apiCostUsd, 4),
    avgCostPerVideoUsd: t.videos ? round(t.apiCostUsd / t.videos, 4) : null,
    avgChargedCredits: t.videos ? Math.round(t.credits / t.videos) : null,
  });

  const fixed = input.fixedCostsUsd ?? 0;
  return {
    payingSubscribers: live.length,
    mrrEur: round(mrrEur),
    netMrrUsd: round(netMrrUsd),
    arrEur: round(mrrEur * 12),
    arpuEur: live.length ? round(mrrEur / live.length) : null,
    apiCostUsd: round(allCost, 4),
    failedCostUsd: round(failedCost, 4),
    tiers: { standard: tier(tiers.standard), premium: tier(tiers.premium) },
    fixedCostsUsd: fixed,
    runRateAfterFixedUsd: round(netMrrUsd - fixed),
    fixedCostCoverage: fixed > 0 ? round(netMrrUsd / fixed) : null,
  };
}
