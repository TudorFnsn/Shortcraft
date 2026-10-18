/**
 * Unit economics: MRR against what the API providers cost us, from data we
 * already store (`subscriptions`, `render_jobs.api_cost_usd`). Feeds the
 * Finance routine (FinancePlan.md).
 *
 * Pure: the caller loads rows and passes `now`. Revenue is NET (after VAT and
 * Stripe fees, same assumptions as the margin gate) and in USD. Provider costs
 * are what the orchestrator recorded (`api_cost_usd`); fixed costs (hosting,
 * Supabase, ElevenLabs plan, domain) are not in the database, so the caller
 * passes them in as `fixedMonthlyUsd`.
 *
 * Definitions:
 * - **MRR:** sum of the monthly price of every live subscription on a plan we
 *   sell (gross, EUR) and its net USD equivalent.
 * - **Variable cost (30d):** `api_cost_usd` of every job created in the last
 *   30 days, finished or not. A failed job still spent money; that waste is
 *   reported on its own.
 * - **Gross margin (30d):** (net MRR − variable cost) ÷ net MRR.
 */
import { PLANS } from '@/config/plans';
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';

const DAY_MS = 86_400_000;

export interface EconJob {
  status: string;
  modelTier: string;
  targetDurationSec: number;
  actualCredits: number;
  apiCostUsd: number;
  createdAt: Date;
}

export interface EconInput {
  now: Date;
  subscriptions: SubscriptionSnapshot[];
  jobs: EconJob[];
  /** Hosting, database, voice plan, domain, etc. per month in USD. */
  fixedMonthlyUsd: number;
  assumptions?: RevenueAssumptions;
}

export interface TierEcon {
  tier: string;
  videos: number;
  avgCostUsd: number | null;
  avgCredits: number | null;
  /** Provider cost per 1,000 credits charged. */
  costPer1kCredits: number | null;
}

export interface UnitEconomics {
  asOf: string;
  payingSubscribers: number;
  mrrGrossEur: number;
  mrrNetUsd: number;
  variableCostUsd30d: number;
  failedCostUsd30d: number;
  fixedMonthlyUsd: number;
  grossMarginUsd: number;
  /** Null when there is no revenue to divide by. */
  grossMarginRate: number | null;
  /** Net MRR − variable − fixed. Negative = burning cash. */
  contributionUsd: number;
  videos30d: number;
  byTier: TierEcon[];
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Net USD of one gross EUR charge: remove VAT, then the Stripe fee, then convert. */
export function netUsdOfGrossEur(grossEur: number, a: RevenueAssumptions): number {
  const exVat = grossEur / (1 + a.vatRate);
  const afterFees = exVat - (grossEur * a.stripePercentFee + a.stripeFixedFeeEur);
  return Math.max(0, afterFees) * a.usdPerEur;
}

export function computeUnitEconomics(input: EconInput): UnitEconomics {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const since = input.now.getTime() - 30 * DAY_MS;

  let mrrGrossEur = 0;
  let mrrNetUsd = 0;
  let payingSubscribers = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const eur = PLANS[s.planId].priceCents / 100;
    payingSubscribers += 1;
    mrrGrossEur += eur;
    mrrNetUsd += netUsdOfGrossEur(eur, a);
  }

  const recent = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const variable = recent.reduce((sum, j) => sum + j.apiCostUsd, 0);
  const failed = recent
    .filter((j) => j.status === 'failed')
    .reduce((sum, j) => sum + j.apiCostUsd, 0);

  const done = recent.filter((j) => j.status === 'done');
  const tiers = [...new Set(done.map((j) => j.modelTier))].sort();
  const byTier = tiers.map((tier): TierEcon => {
    const rows = done.filter((j) => j.modelTier === tier);
    const cost = rows.reduce((s, j) => s + j.apiCostUsd, 0);
    const credits = rows.reduce((s, j) => s + j.actualCredits, 0);
    return {
      tier,
      videos: rows.length,
      avgCostUsd: rows.length ? round(cost / rows.length, 4) : null,
      avgCredits: rows.length ? Math.round(credits / rows.length) : null,
      costPer1kCredits: credits ? round((cost / credits) * 1000, 4) : null,
    };
  });

  const grossMarginUsd = mrrNetUsd - variable;
  return {
    asOf: input.now.toISOString(),
    payingSubscribers,
    mrrGrossEur: round(mrrGrossEur),
    mrrNetUsd: round(mrrNetUsd),
    variableCostUsd30d: round(variable),
    failedCostUsd30d: round(failed),
    fixedMonthlyUsd: input.fixedMonthlyUsd,
    grossMarginUsd: round(grossMarginUsd),
    grossMarginRate: mrrNetUsd > 0 ? round(grossMarginUsd / mrrNetUsd, 3) : null,
    contributionUsd: round(grossMarginUsd - input.fixedMonthlyUsd),
    videos30d: done.length,
    byTier,
  };
}
