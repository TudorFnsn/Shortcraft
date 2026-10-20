/**
 * Finance metrics: MRR, cash collected, what videos cost us, and burn. Pure,
 * like `north-star.ts`: the caller loads rows (Supabase in
 * `scripts/finance-report.mts`, fixtures in tests) and passes `now`.
 *
 * Definitions (money in USD cents unless a name ends in `Usd`):
 * - **MRR:** sum of plan list prices for live subscriptions, ex-VAT (VAT is the
 *   state's money). Monthly price only; yearly billing isn't sold yet.
 * - **Net MRR:** MRR after Stripe's percentage + fixed fee, per subscription.
 * - **Top-up revenue:** `topup` ledger rows in the window, priced by pack size.
 *   A row whose size matches no pack is counted in `unpricedTopUps`, not guessed.
 * - **Variable cost:** `render_jobs.api_cost_usd` in the window, failed jobs
 *   included (we paid the providers even when the video never shipped).
 * - **Cost per finished video:** variable cost of `done` jobs ÷ `done` jobs.
 * - **Burn:** fixed costs + variable cost. Unknown fixed costs are listed, not
 *   counted as zero.
 * - **Break-even subscribers:** how many average-priced subscribers cover fixed
 *   costs after Stripe fees and average variable cost per subscriber.
 */
import { isLiveSubscription } from '@/features/billing/entitlements';
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import type { FixedCost } from '@/config/fixed-costs';
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;

export interface FinanceJob {
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  actualCredits: number;
}

export interface FinanceSubscription {
  userId: string;
  planId: string;
  status: string;
}

export interface FinanceTopUp {
  /** Credits granted by the ledger row (positive). */
  credits: number;
  createdAt: Date;
}

export interface FinanceInput {
  jobs: readonly FinanceJob[];
  subscriptions: readonly FinanceSubscription[];
  topUps: readonly FinanceTopUp[];
  fixedCosts: readonly FixedCost[];
  now: Date;
  /** Window for cash + cost totals, in days. Default 30. */
  windowDays?: number;
  assumptions?: RevenueAssumptions;
}

export interface TierEconomics {
  tier: string;
  finished: number;
  failed: number;
  costUsd: number;
  costPerFinishedUsd: number | null;
  creditsPerFinished: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  mrrUsd: number;
  netMrrUsd: number;
  payingSubscribers: number;
  arpuUsd: number | null;
  subscribersByPlan: Record<string, number>;
  topUpRevenueUsd: number;
  unpricedTopUps: number;
  variableCostUsd: number;
  failedCostUsd: number;
  finishedVideos: number;
  costPerFinishedUsd: number | null;
  byTier: TierEconomics[];
  fixedCostUsd: number;
  unknownFixedCosts: string[];
  burnUsd: number;
  /** (net MRR + net top-ups) − burn, over the window. Negative = losing cash. */
  netCashUsd: number;
  /** Variable cost ÷ net revenue, or null with no revenue. Lower is better. */
  cogsRatio: number | null;
  breakEvenSubscribers: number | null;
}

const round = (n: number, dp = 4): number => Number(n.toFixed(dp));

/** Net of VAT and Stripe fees, in USD, for one charge of `priceCents` EUR. */
function netUsd(priceCents: number, a: RevenueAssumptions): number {
  const gross = priceCents / 100;
  const net = gross / (1 + a.vatRate) - (gross * a.stripePercentFee + a.stripeFixedFeeEur);
  return net * a.usdPerEur;
}

/** Ex-VAT, before Stripe fees, in USD. */
function exVatUsd(priceCents: number, a: RevenueAssumptions): number {
  return (priceCents / 100 / (1 + a.vatRate)) * a.usdPerEur;
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= since && d.getTime() < input.now.getTime();

  // Recurring revenue (snapshot as of now).
  let mrr = 0;
  let netMrr = 0;
  let subscribers = 0;
  const subscribersByPlan: Record<string, number> = {};
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const plan = PLANS[s.planId];
    subscribers += 1;
    mrr += exVatUsd(plan.priceCents, a);
    netMrr += netUsd(plan.priceCents, a);
    subscribersByPlan[plan.id] = (subscribersByPlan[plan.id] ?? 0) + 1;
  }

  // One-time revenue (window).
  let topUpRevenue = 0;
  let unpriced = 0;
  for (const t of input.topUps) {
    if (!inWindow(t.createdAt)) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (pack) topUpRevenue += netUsd(pack.priceCents, a);
    else unpriced += 1;
  }

  // Variable cost (window).
  const tiers = new Map<string, { done: number; failed: number; cost: number; credits: number }>();
  let variable = 0;
  let failedCost = 0;
  let finished = 0;
  let finishedCost = 0;
  for (const j of input.jobs) {
    if (!inWindow(j.createdAt)) continue;
    variable += j.apiCostUsd;
    const t = tiers.get(j.modelTier) ?? { done: 0, failed: 0, cost: 0, credits: 0 };
    t.cost += j.apiCostUsd;
    if (j.status === 'done') {
      finished += 1;
      finishedCost += j.apiCostUsd;
      t.done += 1;
      t.credits += j.actualCredits;
    } else if (j.status === 'failed') {
      failedCost += j.apiCostUsd;
      t.failed += 1;
    }
    tiers.set(j.modelTier, t);
  }

  const byTier: TierEconomics[] = [...tiers.entries()]
    .map(([tier, t]) => ({
      tier,
      finished: t.done,
      failed: t.failed,
      costUsd: round(t.cost),
      costPerFinishedUsd: t.done > 0 ? round(t.cost / t.done) : null,
      creditsPerFinished: t.done > 0 ? Math.round(t.credits / t.done) : null,
    }))
    .sort((x, y) => x.tier.localeCompare(y.tier));

  // Fixed costs.
  const unknown = input.fixedCosts.filter((c) => c.monthlyCents === null).map((c) => c.vendor);
  const fixed =
    (input.fixedCosts.reduce((sum, c) => sum + (c.monthlyCents ?? 0), 0) / 100 / 30) * windowDays;

  const burn = fixed + variable;
  const netRevenue = netMrr * (windowDays / 30) + topUpRevenue;

  // Break-even: fixed ≈ subs × (avg net price − avg variable cost per sub).
  const avgNet = subscribers > 0 ? netMrr / subscribers : null;
  const varPerSub = subscribers > 0 ? (variable * (30 / windowDays)) / subscribers : null;
  const unitProfit = avgNet !== null && varPerSub !== null ? avgNet - varPerSub : null;
  const monthlyFixed = input.fixedCosts.reduce((s, c) => s + (c.monthlyCents ?? 0), 0) / 100;
  const breakEven =
    unitProfit !== null && unitProfit > 0 ? Math.ceil(monthlyFixed / unitProfit) : null;

  return {
    asOf: input.now.toISOString(),
    windowDays,
    mrrUsd: round(mrr, 2),
    netMrrUsd: round(netMrr, 2),
    payingSubscribers: subscribers,
    arpuUsd: subscribers > 0 ? round(mrr / subscribers, 2) : null,
    subscribersByPlan,
    topUpRevenueUsd: round(topUpRevenue, 2),
    unpricedTopUps: unpriced,
    variableCostUsd: round(variable, 2),
    failedCostUsd: round(failedCost, 2),
    finishedVideos: finished,
    costPerFinishedUsd: finished > 0 ? round(finishedCost / finished) : null,
    byTier,
    fixedCostUsd: round(fixed, 2),
    unknownFixedCosts: unknown,
    burnUsd: round(burn, 2),
    netCashUsd: round(netRevenue - burn, 2),
    cogsRatio: netRevenue > 0 ? round(variable / netRevenue, 3) : null,
    breakEvenSubscribers: breakEven,
  };
}
