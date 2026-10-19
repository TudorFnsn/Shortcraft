/**
 * Finance metrics: MRR, realised gross margin and API cost per video, computed
 * from data we already store (`subscriptions`, `render_jobs.api_cost_usd`, paid
 * `credit_transactions`). Pure: the caller loads rows and passes `now`.
 *
 * Definitions:
 * - **MRR (gross, EUR):** sum of list prices of live subscriptions (`active`,
 *   `trialing`, `past_due`). Yearly billing is not sold yet, so no normalising.
 * - **Net MRR (USD):** each subscription's price after VAT + Stripe fees, using
 *   the same assumptions as the margin gate (`netRevenueUsd`).
 * - **API cost (window):** sum of `api_cost_usd` over jobs created in the
 *   window, split into videos that finished and spend that bought no video
 *   (failed or still running) so waste is visible.
 * - **Top-up revenue:** paid `topup` ledger rows matched to a pack by credits.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { netRevenueUsd } from '@/features/billing/margin';
import { DAY_MS } from '@/features/metrics/north-star';

export interface FinanceJob {
  status: string;
  modelTier: string;
  apiCostUsd: number;
  createdAt: Date;
}

export interface FinanceSubscription {
  planId: string;
  status: string;
}

export interface FinanceTopUp {
  credits: number;
  createdAt: Date;
}

export interface FinanceInput {
  now: Date;
  /** Trailing window in days for cost and top-up figures. */
  windowDays: number;
  jobs: readonly FinanceJob[];
  subscriptions: readonly FinanceSubscription[];
  topUps: readonly FinanceTopUp[];
  /** Fixed monthly spend in USD (hosting, ElevenLabs plan, Supabase, ...). */
  fixedMonthlyCostUsd?: number;
}

export interface TierCost {
  tier: string;
  videos: number;
  apiCostUsd: number;
  costPerVideoUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  mrrEur: number;
  netMrrUsd: number;
  payingSubscribers: number;
  byPlan: Record<string, { subscribers: number; mrrEur: number }>;
  topUpRevenueEur: number;
  topUpRevenueNetUsd: number;
  apiCostUsd: number;
  /** API spend on jobs that never finished (failed / stuck). */
  wastedApiCostUsd: number;
  videosFinished: number;
  byTier: TierCost[];
  /** Window revenue (subs prorated to the window + top-ups), USD net. */
  revenueNetUsd: number;
  grossMarginUsd: number;
  /** null when there is no revenue to divide by. */
  grossMarginPct: number | null;
  fixedCostUsd: number;
  /** Gross margin minus fixed costs, prorated to the window. */
  contributionUsd: number;
  /** Months of fixed cost the gross margin covers in the window (>=1 = profitable). */
  breakEvenRatio: number | null;
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now, windowDays } = input;
  const since = now.getTime() - windowDays * DAY_MS;
  const monthFraction = windowDays / 30;

  const byPlan: FinanceReport['byPlan'] = {};
  let mrrEur = 0;
  let subNetUsd = 0;
  let payingSubscribers = 0;
  for (const s of input.subscriptions) {
    const plan = PLANS[s.planId as keyof typeof PLANS];
    if (!plan || !isLiveSubscription({ planId: s.planId, status: s.status })) continue;
    payingSubscribers++;
    mrrEur += plan.priceCents / 100;
    subNetUsd += netRevenueUsd(plan.priceCents);
    const row = (byPlan[plan.id] ??= { subscribers: 0, mrrEur: 0 });
    row.subscribers++;
    row.mrrEur = round(row.mrrEur + plan.priceCents / 100);
  }

  let topUpRevenueEur = 0;
  let topUpRevenueNetUsd = 0;
  for (const t of input.topUps) {
    if (t.createdAt.getTime() < since) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (!pack) continue;
    topUpRevenueEur += pack.priceCents / 100;
    topUpRevenueNetUsd += netRevenueUsd(pack.priceCents);
  }

  let apiCostUsd = 0;
  let wastedApiCostUsd = 0;
  let videosFinished = 0;
  const tiers = new Map<string, { videos: number; cost: number }>();
  for (const j of input.jobs) {
    if (j.createdAt.getTime() < since) continue;
    apiCostUsd += j.apiCostUsd;
    if (j.status === 'done') {
      videosFinished++;
      const t = tiers.get(j.modelTier) ?? { videos: 0, cost: 0 };
      t.videos++;
      t.cost += j.apiCostUsd;
      tiers.set(j.modelTier, t);
    } else {
      wastedApiCostUsd += j.apiCostUsd;
    }
  }

  const revenueNetUsd = subNetUsd * monthFraction + topUpRevenueNetUsd;
  const grossMarginUsd = revenueNetUsd - apiCostUsd;
  const fixedCostUsd = (input.fixedMonthlyCostUsd ?? 0) * monthFraction;

  return {
    asOf: now.toISOString(),
    windowDays,
    mrrEur: round(mrrEur),
    netMrrUsd: round(subNetUsd),
    payingSubscribers,
    byPlan,
    topUpRevenueEur: round(topUpRevenueEur),
    topUpRevenueNetUsd: round(topUpRevenueNetUsd),
    apiCostUsd: round(apiCostUsd, 4),
    wastedApiCostUsd: round(wastedApiCostUsd, 4),
    videosFinished,
    byTier: [...tiers].map(([tier, t]) => ({
      tier,
      videos: t.videos,
      apiCostUsd: round(t.cost, 4),
      costPerVideoUsd: t.videos ? round(t.cost / t.videos, 4) : null,
    })),
    revenueNetUsd: round(revenueNetUsd),
    grossMarginUsd: round(grossMarginUsd),
    grossMarginPct: revenueNetUsd > 0 ? round(grossMarginUsd / revenueNetUsd, 4) : null,
    fixedCostUsd: round(fixedCostUsd),
    contributionUsd: round(grossMarginUsd - fixedCostUsd),
    breakEvenRatio: fixedCostUsd > 0 ? round(grossMarginUsd / fixedCostUsd) : null,
  };
}
