/**
 * Finance report: MRR, plan mix, API cost per finished video and gross margin,
 * computed from rows the app already stores. Pure: the script reads the rows,
 * this module does the math, so it is tested without a database.
 *
 * Money in = plan price (EUR, VAT inclusive) → net of VAT and Stripe fees, in USD
 * (same assumptions as the margin gate). Money out = `render_jobs.api_cost_usd`
 * (provider spend) plus the fixed monthly costs the owner lists in FinancePlan.md.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';
import { isLiveSubscription } from '@/features/billing/entitlements';

export const DAY_MS = 86_400_000;

export interface FinanceSub {
  userId: string;
  planId: string;
  status: string;
}
export interface FinanceJob {
  status: string;
  modelTier: string;
  apiCostUsd: number;
  createdAt: Date;
}
export interface FinanceGrant {
  /** Top-up purchase price in EUR cents (0 for subscription grants). */
  amountCents: number;
  createdAt: Date;
}
export interface FinanceInput {
  now: Date;
  subscriptions: FinanceSub[];
  jobs: FinanceJob[];
  /** One-time top-up purchases, newest window only is used. */
  topUps: FinanceGrant[];
  /** Fixed monthly costs in USD (Vercel, Supabase, ElevenLabs plan, domain…). */
  fixedMonthlyUsd: number;
  assumptions?: RevenueAssumptions;
}

export interface TierCost {
  videos: number;
  avgCostUsd: number | null;
  totalCostUsd: number;
}

export interface FinanceReport {
  asOf: string;
  /** Net monthly recurring revenue, USD, after VAT and Stripe fees. */
  mrrNetUsd: number;
  /** Gross MRR in EUR (what customers pay, VAT inclusive). */
  mrrGrossEur: number;
  planMix: Record<string, number>;
  payingSubscribers: number;
  arpuNetUsd: number | null;
  /** Last 30 days. */
  topUpNetUsd: number;
  apiCostUsd30d: number;
  failedCostUsd30d: number;
  byTier: Record<string, TierCost>;
  fixedMonthlyUsd: number;
  /** (MRR + top-ups − API − fixed) in USD for the last 30 days. */
  cashMarginUsd: number;
  /** Revenue ÷ API cost; null while there is no spend. Gate floor is 3. */
  revenueToApiCost: number | null;
  /** Revenue ÷ (API + fixed); below 1 means the app loses cash. */
  revenueToAllCosts: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** EUR cents paid by a customer → USD we keep after VAT, % fee and fixed fee. */
export function netUsd(grossCents: number, a: RevenueAssumptions = REVENUE_ASSUMPTIONS): number {
  if (grossCents <= 0) return 0;
  const gross = grossCents / 100;
  const net = gross / (1 + a.vatRate) - gross * a.stripePercentFee - a.stripeFixedFeeEur;
  return Math.max(0, net * a.usdPerEur);
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const since = input.now.getTime() - 30 * DAY_MS;

  const planMix: Record<string, number> = {};
  let mrrNet = 0;
  let mrrGross = 0;
  let paying = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription({ planId: s.planId as PlanId, status: s.status })) continue;
    const plan = PLANS[s.planId as PlanId];
    if (!plan || plan.priceCents <= 0) continue;
    paying += 1;
    planMix[plan.id] = (planMix[plan.id] ?? 0) + 1;
    mrrGross += plan.priceCents / 100;
    mrrNet += netUsd(plan.priceCents, a);
  }

  const topUpNet = input.topUps
    .filter((t) => t.createdAt.getTime() >= since)
    .reduce((sum, t) => sum + netUsd(t.amountCents, a), 0);

  const byTier: Record<string, TierCost> = {};
  let apiCost = 0;
  let failedCost = 0;
  for (const j of input.jobs) {
    if (j.createdAt.getTime() < since) continue;
    apiCost += j.apiCostUsd;
    if (j.status === 'failed') failedCost += j.apiCostUsd;
    if (j.status !== 'done') continue;
    const t = (byTier[j.modelTier] ??= { videos: 0, avgCostUsd: null, totalCostUsd: 0 });
    t.videos += 1;
    t.totalCostUsd += j.apiCostUsd;
  }
  for (const t of Object.values(byTier)) {
    t.avgCostUsd = t.videos ? round2(t.totalCostUsd / t.videos) : null;
    t.totalCostUsd = round2(t.totalCostUsd);
  }

  const revenue = mrrNet + topUpNet;
  const allCosts = apiCost + input.fixedMonthlyUsd;
  return {
    asOf: input.now.toISOString(),
    mrrNetUsd: round2(mrrNet),
    mrrGrossEur: round2(mrrGross),
    planMix,
    payingSubscribers: paying,
    arpuNetUsd: paying ? round2(mrrNet / paying) : null,
    topUpNetUsd: round2(topUpNet),
    apiCostUsd30d: round2(apiCost),
    failedCostUsd30d: round2(failedCost),
    byTier,
    fixedMonthlyUsd: round2(input.fixedMonthlyUsd),
    cashMarginUsd: round2(revenue - allCosts),
    revenueToApiCost: apiCost > 0 ? round2(revenue / apiCost) : null,
    revenueToAllCosts: allCosts > 0 ? round2(revenue / allCosts) : null,
  };
}
