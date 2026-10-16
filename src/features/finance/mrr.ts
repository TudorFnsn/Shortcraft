/**
 * MRR and unit economics, pure. Subscription revenue comes from the plan
 * catalog (the `subscriptions` table stores plan + status, not amounts), so
 * annual or discounted prices are approximated by the monthly list price until
 * Stripe analytics is connected. Net MRR removes VAT and Stripe fees using the
 * same assumptions as the margin gate.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';

export interface SubRow {
  planId: string;
  status: string;
}

export interface FinanceInput {
  subscriptions: readonly SubRow[];
  /** Credits charged on finished jobs in the window (render_jobs.charged_credits). */
  creditsCharged: number;
  /** Measured provider spend in the window, USD, when known (else estimated). */
  measuredApiCostUsd?: number;
  /** Blended API cost per credit, USD, used when spend isn't measured. */
  blendedUsdPerCredit: number;
  /** Fixed monthly costs in USD (hosting, Supabase, ElevenLabs plan, ...). */
  fixedCostsUsd: number;
  assumptions?: RevenueAssumptions;
}

export interface FinanceReport {
  payingSubscribers: number;
  byPlan: Record<string, number>;
  grossMrrEur: number;
  netMrrUsd: number;
  arrNetUsd: number;
  apiCostUsd: number;
  apiCostSource: 'measured' | 'estimated';
  fixedCostsUsd: number;
  totalCostUsd: number;
  /** Net MRR ÷ total cost; below 1 the app loses money. */
  mrrToCostRatio: number | null;
  grossMarginPct: number | null;
  burnUsd: number;
}

const LIVE = new Set(['active', 'trialing']);

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const byPlan: Record<string, number> = {};
  let grossCents = 0;
  let netUsd = 0;
  let paying = 0;
  for (const s of input.subscriptions) {
    const plan = PLANS[s.planId as PlanId];
    if (!plan || !LIVE.has(s.status)) continue;
    paying += 1;
    byPlan[plan.id] = (byPlan[plan.id] ?? 0) + 1;
    grossCents += plan.priceCents;
    const eur = plan.priceCents / 100;
    const afterVat = eur / (1 + a.vatRate);
    const afterFees = afterVat - afterVat * a.stripePercentFee - a.stripeFixedFeeEur;
    netUsd += Math.max(0, afterFees) * a.usdPerEur;
  }
  const measured = input.measuredApiCostUsd !== undefined;
  const apiCostUsd = measured
    ? (input.measuredApiCostUsd as number)
    : input.creditsCharged * input.blendedUsdPerCredit;
  const totalCostUsd = apiCostUsd + input.fixedCostsUsd;
  return {
    payingSubscribers: paying,
    byPlan,
    grossMrrEur: grossCents / 100,
    netMrrUsd: netUsd,
    arrNetUsd: netUsd * 12,
    apiCostUsd,
    apiCostSource: measured ? 'measured' : 'estimated',
    fixedCostsUsd: input.fixedCostsUsd,
    totalCostUsd,
    mrrToCostRatio: totalCostUsd > 0 ? netUsd / totalCostUsd : null,
    grossMarginPct: netUsd > 0 ? ((netUsd - apiCostUsd) / netUsd) * 100 : null,
    burnUsd: netUsd - totalCostUsd,
  };
}
