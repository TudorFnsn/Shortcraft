/**
 * Unit economics from data we already store: MRR, spend per finished video and
 * gross margin. Pure: the caller loads rows (Supabase in
 * `scripts/finance-report.mts`, fixtures in tests) and passes `now`.
 *
 * Definitions (money is EUR for revenue and USD for provider cost; `usdPerEur`
 * converts, and is an input so a report never hides the rate it assumed):
 * - **MRR:** list monthly price of every live subscription (`active`,
 *   `trialing`, `past_due`; same test as plan gating). Discounts, coupons and
 *   yearly billing are not stored, so this is the list-price MRR; Stripe
 *   (Sigma) is the truth once it is connected.
 * - **Variable cost:** `render_jobs.api_cost_usd` of jobs created in the window.
 *   Failed jobs keep their cost (we paid the provider and refunded the user).
 * - **Cost per video:** variable cost ÷ jobs that reached `done`, so the cost
 *   of failures is carried by the videos that did ship.
 * - **Gross margin:** (net revenue − variable − fixed cost) ÷ net revenue,
 *   where net revenue is MRR after the Stripe fee and VAT assumptions.
 */
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import type { RevenueAssumptions } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;

export interface FinanceSubscription extends SubscriptionSnapshot {
  userId: string;
}

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  apiCostUsd: number;
  createdAt: Date;
}

export interface FixedCost {
  name: string;
  /** USD per month. `null` = owner has not supplied it yet (reported as a gap). */
  monthlyUsd: number | null;
}

export interface FinanceInput {
  now: Date;
  /** Monthly list price in EUR cents, by plan id. */
  planPriceCents: Readonly<Record<string, number>>;
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  fixedCosts: readonly FixedCost[];
  /** Revenue assumptions (see `margin.ts` `REVENUE_ASSUMPTIONS`). */
  assumptions: RevenueAssumptions;
  windowDays?: number;
}

export interface TierCost {
  tier: string;
  jobs: number;
  done: number;
  costUsd: number;
  costPerDoneUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  mrrEur: number;
  netMrrEur: number;
  payingSubscribers: number;
  arpuEur: number | null;
  byPlan: Array<{ planId: string; subscribers: number; mrrEur: number }>;
  jobs: number;
  doneVideos: number;
  failedJobs: number;
  variableCostUsd: number;
  costPerDoneVideoUsd: number | null;
  byTier: TierCost[];
  /** Variable cost scaled to a 30-day month, so it compares with MRR. */
  variableCostMonthlyUsd: number;
  fixedCostMonthlyUsd: number;
  fixedCostGaps: string[];
  netRevenueMonthlyUsd: number;
  grossMargin: number | null;
  /** Monthly profit (net revenue − variable − fixed) in USD; fixed gaps count as 0. */
  profitMonthlyUsd: number;
  /** Variable cost per EUR of MRR; a row that grows toward 1 is losing money. */
  costToRevenue: number | null;
  /** Subscribers needed to cover the fixed costs at today's ARPU and variable ratio. */
  breakEvenSubscribers: number | null;
}

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeFinance(input: FinanceInput): FinanceReport {
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * DAY_MS;
  const a = input.assumptions;

  const planAgg = new Map<string, { subscribers: number; mrrEur: number }>();
  let mrrEur = 0;
  let netMrrEur = 0;
  let subs = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const price = (input.planPriceCents[s.planId] ?? 0) / 100;
    const row = planAgg.get(s.planId) ?? { subscribers: 0, mrrEur: 0 };
    row.subscribers += 1;
    row.mrrEur += price;
    planAgg.set(s.planId, row);
    mrrEur += price;
    const exVat = price / (1 + a.vatRate);
    netMrrEur += Math.max(0, exVat - price * a.stripePercentFee - a.stripeFixedFeeEur);
    subs += 1;
  }

  const tiers = new Map<string, TierCost>();
  let jobs = 0;
  let done = 0;
  let failed = 0;
  let variable = 0;
  for (const j of input.jobs) {
    if (j.createdAt.getTime() < since || j.createdAt.getTime() >= input.now.getTime()) continue;
    jobs += 1;
    variable += j.apiCostUsd;
    if (j.status === 'done') done += 1;
    if (j.status === 'failed') failed += 1;
    const t = tiers.get(j.modelTier) ?? {
      tier: j.modelTier,
      jobs: 0,
      done: 0,
      costUsd: 0,
      costPerDoneUsd: null,
    };
    t.jobs += 1;
    t.costUsd += j.apiCostUsd;
    if (j.status === 'done') t.done += 1;
    tiers.set(j.modelTier, t);
  }

  const fixedCostMonthlyUsd = input.fixedCosts.reduce((sum, c) => sum + (c.monthlyUsd ?? 0), 0);
  const variableCostMonthlyUsd = (variable / windowDays) * 30;
  const netRevenueMonthlyUsd = netMrrEur * a.usdPerEur;
  const profitMonthlyUsd = netRevenueMonthlyUsd - variableCostMonthlyUsd - fixedCostMonthlyUsd;
  const mrrUsd = mrrEur * a.usdPerEur;

  // Break-even: each subscriber nets `arpuNetUsd` and burns `varPerSub` of provider cost.
  const arpuNetUsd = subs > 0 ? netRevenueMonthlyUsd / subs : 0;
  const varPerSub = subs > 0 ? variableCostMonthlyUsd / subs : 0;
  const contribution = arpuNetUsd - varPerSub;

  return {
    asOf: input.now.toISOString(),
    windowDays,
    mrrEur: round(mrrEur, 2),
    netMrrEur: round(netMrrEur, 2),
    payingSubscribers: subs,
    arpuEur: subs > 0 ? round(mrrEur / subs, 2) : null,
    byPlan: [...planAgg.entries()]
      .map(([planId, v]) => ({ planId, subscribers: v.subscribers, mrrEur: round(v.mrrEur, 2) }))
      .sort((x, y) => y.mrrEur - x.mrrEur),
    jobs,
    doneVideos: done,
    failedJobs: failed,
    variableCostUsd: round(variable),
    costPerDoneVideoUsd: done > 0 ? round(variable / done) : null,
    byTier: [...tiers.values()]
      .map((t) => ({
        ...t,
        costUsd: round(t.costUsd),
        costPerDoneUsd: t.done > 0 ? round(t.costUsd / t.done) : null,
      }))
      .sort((x, y) => y.costUsd - x.costUsd),
    variableCostMonthlyUsd: round(variableCostMonthlyUsd, 2),
    fixedCostMonthlyUsd: round(fixedCostMonthlyUsd, 2),
    fixedCostGaps: input.fixedCosts.filter((c) => c.monthlyUsd === null).map((c) => c.name),
    netRevenueMonthlyUsd: round(netRevenueMonthlyUsd, 2),
    grossMargin: netRevenueMonthlyUsd > 0 ? round(profitMonthlyUsd / netRevenueMonthlyUsd) : null,
    profitMonthlyUsd: round(profitMonthlyUsd, 2),
    costToRevenue: mrrUsd > 0 ? round(variableCostMonthlyUsd / mrrUsd) : null,
    breakEvenSubscribers: contribution > 0 ? Math.ceil(fixedCostMonthlyUsd / contribution) : null,
  };
}
