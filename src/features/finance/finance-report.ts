/**
 * Finance report: MRR, cash margin and unit economics from data we already
 * store (subscriptions, the credit ledger, `render_jobs.api_cost_usd`) plus the
 * owner-filled fixed costs. Pure: the caller loads rows and passes `now`.
 *
 * Definitions:
 * - **MRR:** sum of plan list prices (EUR, VAT included) of live subscriptions,
 *   converted to net USD with the same assumptions as the margin gate. Annual
 *   billing doesn't exist yet, so every subscription is monthly.
 * - **Top-up revenue (30d):** `topup` ledger grants in the last 30 days, priced
 *   by the pack with that many credits (net of VAT and Stripe fees).
 * - **API cost (30d):** sum of `render_jobs.api_cost_usd` for jobs created in
 *   the last 30 days (any status: failed jobs still cost money).
 * - **MRR ratio (coverage):** MRR ÷ total monthly cost (API + fixed). ≥ 1 means
 *   subscriptions alone pay for the app. **Cash ratio** adds top-ups.
 * - **Gross margin:** (net revenue − API cost) ÷ net revenue.
 */
import { PLANS, TOPUP_PACKS, type PlanId } from '@/config/plans';
import { FIXED_COSTS, type FixedCost } from '@/config/finance-costs';
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';
import { isLiveSubscription } from '@/features/billing/entitlements';

export const DAY_MS = 86_400_000;
export const WINDOW_DAYS = 30;

export interface FinanceSubscription {
  planId: string;
  status: string;
}
export interface FinanceTopUp {
  credits: number;
  createdAt: Date;
}
export interface FinanceJob {
  status: string;
  createdAt: Date;
  modelTier: string;
  actualCredits: number;
  apiCostUsd: number;
}
export interface FinanceInput {
  now: Date;
  subscriptions: readonly FinanceSubscription[];
  topUps: readonly FinanceTopUp[];
  jobs: readonly FinanceJob[];
  fixedCosts?: readonly FixedCost[];
  assumptions?: RevenueAssumptions;
}

export interface TierEconomics {
  tier: string;
  jobs: number;
  doneJobs: number;
  creditsCharged: number;
  apiCostUsd: number;
  /** API cost per finished video, null when none finished. */
  costPerVideoUsd: number | null;
  /** API USD per 1,000 credits charged, null when no credits were charged. */
  costPer1kCredits: number | null;
}

export interface FinanceReport {
  asOf: string;
  payingSubscribers: number;
  planMix: Record<string, number>;
  mrrGrossEur: number;
  mrrNetUsd: number;
  arrNetUsd: number;
  arpuNetUsd: number | null;
  topUpNetUsd30d: number;
  apiCostUsd30d: number;
  failedJobCostUsd30d: number;
  fixedCostsKnownUsd: number;
  fixedCostsUnknown: string[];
  totalCostUsd30d: number;
  /** MRR ÷ total cost; null when cost is zero. */
  mrrRatio: number | null;
  cashRatio: number | null;
  grossMargin: number | null;
  monthlyProfitUsd: number;
  tiers: TierEconomics[];
}

/** Net USD we keep from one EUR price: remove VAT, then Stripe's fees. */
export function netUsdFromEurCents(cents: number, a: RevenueAssumptions): number {
  const grossEur = cents / 100;
  const netEur = grossEur / (1 + a.vatRate) - (grossEur * a.stripePercentFee + a.stripeFixedFeeEur);
  return Math.max(0, netEur) * a.usdPerEur;
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const since = input.now.getTime() - WINDOW_DAYS * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= since && d.getTime() <= input.now.getTime();

  const planMix: Record<string, number> = {};
  let mrrGrossEur = 0;
  let mrrNetUsd = 0;
  let payingSubscribers = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const plan = PLANS[s.planId as PlanId];
    if (!plan) continue;
    payingSubscribers += 1;
    planMix[plan.id] = (planMix[plan.id] ?? 0) + 1;
    mrrGrossEur += plan.priceCents / 100;
    mrrNetUsd += netUsdFromEurCents(plan.priceCents, a);
  }

  let topUpNetUsd30d = 0;
  for (const t of input.topUps) {
    if (!inWindow(t.createdAt)) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (pack) topUpNetUsd30d += netUsdFromEurCents(pack.priceCents, a);
  }

  const jobs30 = input.jobs.filter((j) => inWindow(j.createdAt));
  const apiCostUsd30d = jobs30.reduce((n, j) => n + j.apiCostUsd, 0);
  const failedJobCostUsd30d = jobs30
    .filter((j) => j.status === 'failed')
    .reduce((n, j) => n + j.apiCostUsd, 0);

  const tierNames = [...new Set(jobs30.map((j) => j.modelTier))].sort();
  const tiers: TierEconomics[] = tierNames.map((tier) => {
    const js = jobs30.filter((j) => j.modelTier === tier);
    const done = js.filter((j) => j.status === 'done');
    const credits = js.reduce((n, j) => n + j.actualCredits, 0);
    const cost = js.reduce((n, j) => n + j.apiCostUsd, 0);
    return {
      tier,
      jobs: js.length,
      doneJobs: done.length,
      creditsCharged: credits,
      apiCostUsd: cost,
      costPerVideoUsd: done.length ? cost / done.length : null,
      costPer1kCredits: credits ? (cost / credits) * 1000 : null,
    };
  });

  const fixed = input.fixedCosts ?? FIXED_COSTS;
  const fixedCostsKnownUsd = fixed.reduce((n, f) => n + (f.usdPerMonth ?? 0), 0);
  const fixedCostsUnknown = fixed.filter((f) => f.usdPerMonth === null).map((f) => f.label);

  const totalCostUsd30d = apiCostUsd30d + fixedCostsKnownUsd;
  const netRevenue = mrrNetUsd + topUpNetUsd30d;
  const ratio = (n: number) => (totalCostUsd30d > 0 ? n / totalCostUsd30d : null);

  return {
    asOf: input.now.toISOString(),
    payingSubscribers,
    planMix,
    mrrGrossEur,
    mrrNetUsd,
    arrNetUsd: mrrNetUsd * 12,
    arpuNetUsd: payingSubscribers ? mrrNetUsd / payingSubscribers : null,
    topUpNetUsd30d,
    apiCostUsd30d,
    failedJobCostUsd30d,
    fixedCostsKnownUsd,
    fixedCostsUnknown,
    totalCostUsd30d,
    mrrRatio: ratio(mrrNetUsd),
    cashRatio: ratio(netRevenue),
    grossMargin: netRevenue > 0 ? (netRevenue - apiCostUsd30d) / netRevenue : null,
    monthlyProfitUsd: netRevenue - totalCostUsd30d,
    tiers,
  };
}
