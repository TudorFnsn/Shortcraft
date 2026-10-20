import { netRevenueUsd } from '@/features/billing/margin';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import type { FixedCost } from '@/config/fixed-costs';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const WINDOW_DAYS = 30;

export interface FinanceInput {
  now: Date;
  subscriptions: Array<{ userId: string; planId: string; status: string }>;
  jobs: Array<{
    userId: string;
    status: string;
    modelTier: string;
    apiCostUsd: number;
    actualCredits: number;
    targetDurationSec: number;
    createdAt: Date;
  }>;
  /** `topup` ledger rows: credits bought and when. */
  topups: Array<{ credits: number; createdAt: Date }>;
  fixedCosts: readonly FixedCost[];
}

export interface TierCost {
  videos: number;
  apiCostUsd: number;
  avgCostPerVideoUsd: number | null;
  creditsCharged: number;
  /** API dollars per 1,000 credits charged (our real cost of a credit). */
  costPer1kCreditsUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  /** Net of VAT and Stripe fees, USD. */
  mrrNetUsd: number;
  mrrGrossEur: number;
  arrNetUsd: number;
  payingByPlan: Record<string, number>;
  payingSubscribers: number;
  arpuNetUsd: number | null;
  topupNetUsd: number;
  revenueNetUsd: number;
  apiCostUsd: number;
  /** API spend on jobs that did not finish (refunded to the user: pure loss). */
  wastedApiCostUsd: number;
  /** API spend by users who never paid (trial burn actually incurred). */
  freeUserApiCostUsd: number;
  byTier: Record<string, TierCost>;
  fixedKnownUsd: number;
  fixedUnknown: string[];
  /** (revenue - API cost) / revenue; null with no revenue. */
  grossMargin: number | null;
  /** revenue - API cost - known fixed costs. */
  contributionUsd: number;
  /** Subscribers needed to cover known fixed costs at the current ARPU. */
  breakEvenSubscribers: number | null;
}

const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

export function computeFinance(input: FinanceInput): FinanceReport {
  const since = input.now.getTime() - WINDOW_DAYS * DAY_MS;

  const payingByPlan: Record<string, number> = {};
  const payers = new Set<string>();
  let mrrNetUsd = 0;
  let mrrGrossEur = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const plan = PLANS[s.planId];
    payers.add(s.userId);
    payingByPlan[plan.id] = (payingByPlan[plan.id] ?? 0) + 1;
    mrrNetUsd += netRevenueUsd(plan.priceCents);
    mrrGrossEur += plan.priceCents / 100;
  }
  const payingSubscribers = [...Object.values(payingByPlan)].reduce((a, b) => a + b, 0);

  let topupNetUsd = 0;
  for (const t of input.topups) {
    if (t.createdAt.getTime() < since) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (pack) topupNetUsd += netRevenueUsd(pack.priceCents);
  }

  const tiers: Record<string, { videos: number; cost: number; credits: number }> = {};
  let apiCostUsd = 0;
  let wasted = 0;
  let freeUser = 0;
  for (const j of input.jobs) {
    if (j.createdAt.getTime() < since) continue;
    apiCostUsd += j.apiCostUsd;
    if (j.status === 'failed') wasted += j.apiCostUsd;
    if (!payers.has(j.userId)) freeUser += j.apiCostUsd;
    if (j.status !== 'done') continue;
    const t = (tiers[j.modelTier] ??= { videos: 0, cost: 0, credits: 0 });
    t.videos += 1;
    t.cost += j.apiCostUsd;
    t.credits += j.actualCredits;
  }
  const byTier: Record<string, TierCost> = {};
  for (const [tier, t] of Object.entries(tiers)) {
    byTier[tier] = {
      videos: t.videos,
      apiCostUsd: round(t.cost),
      avgCostPerVideoUsd: t.videos ? round(t.cost / t.videos) : null,
      creditsCharged: t.credits,
      costPer1kCreditsUsd: t.credits ? round((t.cost / t.credits) * 1000, 5) : null,
    };
  }

  const revenueNetUsd = mrrNetUsd + topupNetUsd;
  const fixedKnownUsd = input.fixedCosts.reduce((a, c) => a + (c.usdPerMonth ?? 0), 0);
  const arpu = payingSubscribers ? mrrNetUsd / payingSubscribers : null;
  const contributionUsd = revenueNetUsd - apiCostUsd - fixedKnownUsd;

  return {
    asOf: input.now.toISOString(),
    windowDays: WINDOW_DAYS,
    mrrNetUsd: round(mrrNetUsd, 2),
    mrrGrossEur: round(mrrGrossEur, 2),
    arrNetUsd: round(mrrNetUsd * 12, 2),
    payingByPlan,
    payingSubscribers,
    arpuNetUsd: arpu === null ? null : round(arpu, 2),
    topupNetUsd: round(topupNetUsd, 2),
    revenueNetUsd: round(revenueNetUsd, 2),
    apiCostUsd: round(apiCostUsd, 2),
    wastedApiCostUsd: round(wasted, 2),
    freeUserApiCostUsd: round(freeUser, 2),
    byTier,
    fixedKnownUsd: round(fixedKnownUsd, 2),
    fixedUnknown: input.fixedCosts.filter((c) => c.usdPerMonth === null).map((c) => c.id),
    grossMargin: revenueNetUsd > 0 ? round((revenueNetUsd - apiCostUsd) / revenueNetUsd) : null,
    contributionUsd: round(contributionUsd, 2),
    breakEvenSubscribers:
      arpu && arpu > 0 ? Math.ceil((apiCostUsd + fixedKnownUsd - topupNetUsd) / arpu) : null,
  };
}
