/**
 * Finance metrics: MRR, realized API cost, cost per finished video and gross
 * margin, from data we already store (`subscriptions`, `render_jobs`,
 * `credit_transactions`). Companion to `north-star.ts`; same rules: pure, the
 * caller loads rows and passes `now`, so every number is reproducible.
 *
 * Definitions:
 * - **MRR:** sum of list prices of live subscriptions (`isLiveSubscription`),
 *   in EUR, VAT included (consumer prices). `netMrrEur` strips VAT and the
 *   Stripe fee using the margin gate's own `REVENUE_ASSUMPTIONS`, so it is the
 *   cash we keep per month. Discounts and coupons are not stored; Stripe is the
 *   source of truth for those (see FinancePlan.md).
 * - **Top-up revenue (30d):** top-up grants in the window, priced from the pack
 *   with the same credit count. One-off, so kept out of MRR.
 * - **API cost (30d):** `render_jobs.api_cost_usd` of jobs created in the
 *   window, split into finished vs failed (failed jobs are refunded, so their
 *   cost is pure burn).
 * - **Cost per finished video:** API cost of `done` jobs ÷ count, per tier.
 * - **API cost ÷ net revenue:** the headline ratio. Target: ≤ 1/3 (the margin
 *   gate's 3x rule).
 */
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { DAY_MS } from './north-star';

export const FINANCE_WINDOW_DAYS = 30;

export interface FinanceSubscription extends SubscriptionSnapshot {
  userId: string;
}

export interface FinanceJob {
  status: string;
  modelTier: string;
  apiCostUsd: number;
  chargedCredits: number;
  createdAt: Date;
}

/** A ledger row with reason `topup`. */
export interface FinanceTopUp {
  credits: number;
  createdAt: Date;
}

export interface FinanceInput {
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  topUps: readonly FinanceTopUp[];
  now: Date;
  /** Fixed monthly costs in USD that are not per-job (hosting, Supabase, ElevenLabs plan…). Owner-supplied. */
  fixedCostsUsdPerMonth?: number;
  assumptions?: RevenueAssumptions;
}

export interface TierCost {
  tier: string;
  finished: number;
  costUsd: number;
  /** null when no finished video exists in the window. */
  costPerVideoUsd: number | null;
  credits: number;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  /** Live subscribers per plan id. */
  byPlan: Record<string, number>;
  mrrEur: number;
  netMrrEur: number;
  /** MRR ÷ paying subscribers; null with none. */
  arpuEur: number | null;
  topUpRevenueEur: number;
  netTopUpRevenueEur: number;
  apiCostUsd: number;
  failedCostUsd: number;
  jobsFinished: number;
  jobsFailed: number;
  tiers: TierCost[];
  /** Realized USD of API cost per 1,000 credits charged (finished jobs). null with no credits. */
  costUsdPer1kCredits: number | null;
  fixedCostsUsd: number;
  netRevenueUsd: number;
  /** API cost ÷ net revenue (subscriptions + top-ups). null with no revenue. Target ≤ 1/3. */
  apiCostRatio: number | null;
  /** (net revenue − API cost − fixed) in USD. */
  grossProfitUsd: number;
  /** Net revenue ÷ (API cost + fixed); null with no cost. The margin gate wants ≥ 3. */
  revenueMultiple: number | null;
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

/** Cash kept from a VAT-inclusive EUR amount, after VAT and the Stripe fee. */
export function netOfVatAndFees(grossEur: number, a: RevenueAssumptions): number {
  return Math.max(
    0,
    grossEur / (1 + a.vatRate) - (grossEur * a.stripePercentFee + a.stripeFixedFeeEur),
  );
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const since = input.now.getTime() - FINANCE_WINDOW_DAYS * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= since && d.getTime() < input.now.getTime();

  const byPlan: Record<string, number> = {};
  let mrrEur = 0;
  let netMrrEur = 0;
  let payingSubscribers = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const plan = (PLANS as Record<string, (typeof PLANS)[keyof typeof PLANS]>)[s.planId];
    if (!plan) continue;
    payingSubscribers += 1;
    byPlan[plan.id] = (byPlan[plan.id] ?? 0) + 1;
    const eur = plan.priceCents / 100;
    mrrEur += eur;
    netMrrEur += netOfVatAndFees(eur, a);
  }

  let topUpRevenueEur = 0;
  let netTopUpRevenueEur = 0;
  for (const t of input.topUps) {
    if (!inWindow(t.createdAt)) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (!pack) continue;
    const eur = pack.priceCents / 100;
    topUpRevenueEur += eur;
    netTopUpRevenueEur += netOfVatAndFees(eur, a);
  }

  const tierMap = new Map<string, TierCost>();
  let apiCostUsd = 0;
  let failedCostUsd = 0;
  let jobsFinished = 0;
  let jobsFailed = 0;
  let finishedCost = 0;
  let finishedCredits = 0;
  for (const j of input.jobs) {
    if (!inWindow(j.createdAt)) continue;
    apiCostUsd += j.apiCostUsd;
    if (j.status === 'failed') {
      jobsFailed += 1;
      failedCostUsd += j.apiCostUsd;
    }
    if (j.status !== 'done') continue;
    jobsFinished += 1;
    finishedCost += j.apiCostUsd;
    finishedCredits += j.chargedCredits;
    const t = tierMap.get(j.modelTier) ?? {
      tier: j.modelTier,
      finished: 0,
      costUsd: 0,
      costPerVideoUsd: null,
      credits: 0,
    };
    t.finished += 1;
    t.costUsd += j.apiCostUsd;
    t.credits += j.chargedCredits;
    tierMap.set(j.modelTier, t);
  }
  const tiers = [...tierMap.values()]
    .map((t) => ({
      ...t,
      costUsd: round(t.costUsd, 4),
      costPerVideoUsd: t.finished ? round(t.costUsd / t.finished, 4) : null,
    }))
    .sort((x, y) => x.tier.localeCompare(y.tier));

  const netRevenueUsd = (netMrrEur + netTopUpRevenueEur) * a.usdPerEur;
  const fixedCostsUsd = input.fixedCostsUsdPerMonth ?? 0;
  const totalCost = apiCostUsd + fixedCostsUsd;

  return {
    asOf: input.now.toISOString(),
    windowDays: FINANCE_WINDOW_DAYS,
    payingSubscribers,
    byPlan,
    mrrEur: round(mrrEur),
    netMrrEur: round(netMrrEur),
    arpuEur: payingSubscribers ? round(mrrEur / payingSubscribers) : null,
    topUpRevenueEur: round(topUpRevenueEur),
    netTopUpRevenueEur: round(netTopUpRevenueEur),
    apiCostUsd: round(apiCostUsd, 4),
    failedCostUsd: round(failedCostUsd, 4),
    jobsFinished,
    jobsFailed,
    tiers,
    costUsdPer1kCredits: finishedCredits ? round((finishedCost / finishedCredits) * 1000, 4) : null,
    fixedCostsUsd,
    netRevenueUsd: round(netRevenueUsd),
    apiCostRatio: netRevenueUsd > 0 ? round(apiCostUsd / netRevenueUsd, 4) : null,
    grossProfitUsd: round(netRevenueUsd - totalCost),
    revenueMultiple: totalCost > 0 ? round(netRevenueUsd / totalCost) : null,
  };
}
