/**
 * Unit economics: MRR, per-video API cost and the 30-day profit picture, from
 * data we already store. Pure: the caller loads rows (Supabase in
 * `scripts/finance-report.mts`, fixtures in tests) and passes `now`.
 *
 * Definitions:
 * - **MRR (gross):** sum of list prices of live subscriptions on plans we sell.
 * - **MRR (net):** the same after VAT and Stripe fees (`netRevenueUsd`), USD.
 * - **Top-up revenue:** paid `topup` grants in the window, priced by matching
 *   the credits to a `TOPUP_PACKS` entry (unmatched grants are counted, not priced).
 * - **API cost:** `render_jobs.api_cost_usd` of jobs created in the window.
 *   Failed jobs keep their cost: it is money spent with no video delivered.
 * - **Cost ratio:** (API + fixed costs) / net revenue. Below 1 = profit.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { netRevenueUsd } from '@/features/billing/margin';

export const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export interface FinanceJob {
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  actualCredits: number;
}

export interface FinanceInput {
  now: Date;
  subscriptions: ReadonlyArray<{ planId: string; status: string }>;
  jobs: readonly FinanceJob[];
  /** Paid `topup` ledger rows (credits granted). */
  topups: ReadonlyArray<{ credits: number; createdAt: Date }>;
  /** Fixed monthly costs in USD; null = unknown. */
  fixedCosts: ReadonlyArray<{ id: string; monthlyUsd: number | null }>;
}

export interface TierCost {
  tier: string;
  done: number;
  failed: number;
  apiCostUsd: number;
  /** Cost of delivered videos ÷ done; null with no done jobs. */
  costPerVideoUsd: number | null;
  /** API cost of failed jobs: spent, nothing delivered. */
  wastedUsd: number;
  /** USD of API cost per 1,000 credits burned on done jobs; null with none. */
  costPer1kCreditsUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  mrrGrossEur: number;
  mrrNetUsd: number;
  topupNetUsd: number;
  unpricedTopups: number;
  netRevenueUsd: number;
  apiCostUsd: number;
  fixedCostsUsd: number;
  unknownFixedCosts: string[];
  profitUsd: number;
  costRatio: number | null;
  apiCostShare: number | null;
  tiers: TierCost[];
}

const round = (n: number, dp = 4) => Number(n.toFixed(dp));

export function computeFinance(input: FinanceInput): FinanceReport {
  const since = input.now.getTime() - WINDOW_DAYS * DAY_MS;

  let payingSubscribers = 0;
  let mrrGrossEur = 0;
  let mrrNetUsd = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const plan = PLANS[s.planId];
    payingSubscribers += 1;
    mrrGrossEur += plan.priceCents / 100;
    mrrNetUsd += netRevenueUsd(plan.priceCents);
  }

  let topupNetUsd = 0;
  let unpricedTopups = 0;
  for (const t of input.topups) {
    if (t.createdAt.getTime() < since) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (pack) topupNetUsd += netRevenueUsd(pack.priceCents);
    else unpricedTopups += 1;
  }

  const byTier = new Map<string, TierCost & { doneCost: number; doneCredits: number }>();
  let apiCostUsd = 0;
  for (const j of input.jobs) {
    if (j.createdAt.getTime() < since) continue;
    if (j.status !== 'done' && j.status !== 'failed') {
      apiCostUsd += j.apiCostUsd;
      continue;
    }
    const t = byTier.get(j.modelTier) ?? {
      tier: j.modelTier,
      done: 0,
      failed: 0,
      apiCostUsd: 0,
      costPerVideoUsd: null,
      wastedUsd: 0,
      costPer1kCreditsUsd: null,
      doneCost: 0,
      doneCredits: 0,
    };
    t.apiCostUsd += j.apiCostUsd;
    if (j.status === 'done') {
      t.done += 1;
      t.doneCost += j.apiCostUsd;
      t.doneCredits += j.actualCredits;
    } else {
      t.failed += 1;
      t.wastedUsd += j.apiCostUsd;
    }
    byTier.set(j.modelTier, t);
    apiCostUsd += j.apiCostUsd;
  }

  const tiers: TierCost[] = [...byTier.values()]
    .map(({ doneCost, doneCredits, ...t }) => ({
      ...t,
      apiCostUsd: round(t.apiCostUsd),
      wastedUsd: round(t.wastedUsd),
      costPerVideoUsd: t.done > 0 ? round(doneCost / t.done) : null,
      costPer1kCreditsUsd: doneCredits > 0 ? round((doneCost / doneCredits) * 1000) : null,
    }))
    .sort((a, b) => a.tier.localeCompare(b.tier));

  const unknownFixedCosts = input.fixedCosts.filter((c) => c.monthlyUsd === null).map((c) => c.id);
  const fixedCostsUsd = input.fixedCosts.reduce((sum, c) => sum + (c.monthlyUsd ?? 0), 0);
  const net = mrrNetUsd + topupNetUsd;

  return {
    asOf: input.now.toISOString(),
    windowDays: WINDOW_DAYS,
    payingSubscribers,
    mrrGrossEur: round(mrrGrossEur, 2),
    mrrNetUsd: round(mrrNetUsd, 2),
    topupNetUsd: round(topupNetUsd, 2),
    unpricedTopups,
    netRevenueUsd: round(net, 2),
    apiCostUsd: round(apiCostUsd, 2),
    fixedCostsUsd: round(fixedCostsUsd, 2),
    unknownFixedCosts,
    profitUsd: round(net - apiCostUsd - fixedCostsUsd, 2),
    costRatio: net > 0 ? round((apiCostUsd + fixedCostsUsd) / net, 3) : null,
    apiCostShare: net > 0 ? round(apiCostUsd / net, 3) : null,
    tiers,
  };
}
