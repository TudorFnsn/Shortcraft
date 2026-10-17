/**
 * Unit economics: MRR, what each video really cost us, and the gross margin
 * that is left, computed from data we already store (`subscriptions`,
 * `render_jobs.api_cost_usd`, paid `credit_transactions`). The margin gate
 * (`features/billing/margin.ts`) proves prices against WORST-CASE cost; this
 * measures what actually happened.
 *
 * Pure: the caller loads rows and passes `now`, so every number is
 * reproducible (same pattern as `features/metrics/north-star.ts`).
 *
 * Definitions:
 * - **MRR:** sum of list prices (EUR → USD) of live subscriptions as of `now`.
 *   Gross, VAT-inclusive prices like the catalog; `netMrrUsd` removes VAT and
 *   Stripe fees. Top-ups are one-off, so they are reported apart, never in MRR.
 * - **Window:** `[now - windowDays, now)`. Costs and revenue use the same window.
 * - **Cost per video:** `api_cost_usd` of jobs that reached `done`. Failed jobs
 *   are refunded to the customer but may still have burned provider money, so
 *   their cost is reported separately as `wastedUsd` and counted in total cost.
 * - **Gross margin:** (net revenue − API cost) ÷ net revenue. Fixed costs come
 *   on top as `burnUsd`; unknown ones (`null`) are listed, not assumed zero.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import type { FixedCost } from '@/config/fixed-costs';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { netRevenueUsd, REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  apiCostUsd: number;
  createdAt: Date;
}

export interface FinanceSubscription {
  userId: string;
  planId: string;
  status: string;
}

/** A `topup` ledger row; `delta` is the credits granted (matches a pack). */
export interface FinanceTopUp {
  userId: string;
  credits: number;
  createdAt: Date;
}

export interface FinanceInput {
  jobs: readonly FinanceJob[];
  subscriptions: readonly FinanceSubscription[];
  topUps: readonly FinanceTopUp[];
  fixedCosts: readonly FixedCost[];
  now: Date;
  windowDays?: number;
}

export interface PlanMrr {
  planId: string;
  subscribers: number;
  mrrUsd: number;
}

export interface TierCost {
  tier: string;
  videos: number;
  costUsd: number;
  avgCostUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  /** Gross, VAT-inclusive, in USD at the catalog FX rate. */
  mrrUsd: number;
  /** After VAT and Stripe fees. */
  netMrrUsd: number;
  arrUsd: number;
  payingSubscribers: number;
  /** Net MRR ÷ paying subscribers. */
  arpuUsd: number | null;
  byPlan: PlanMrr[];
  /** Net of VAT and fees, top-up purchases in the window. */
  topUpNetUsd: number;
  topUpPurchases: number;
  netRevenueUsd: number;
  videosDone: number;
  apiCostUsd: number;
  /** Cost of jobs that did not finish: money burned with nothing delivered. */
  wastedUsd: number;
  avgCostPerVideoUsd: number | null;
  byTier: TierCost[];
  /** (net revenue − API cost) ÷ net revenue, or null with no revenue. */
  grossMargin: number | null;
  /** Net revenue ÷ API cost (the gate's unit); null with no cost. */
  revenueMultiple: number | null;
  /** Monthly fixed costs we know; unknown ones are listed in `unknownFixed`. */
  fixedUsd: number;
  unknownFixed: string[];
  /** Net MRR − monthly API cost − known fixed costs, scaled to a month. */
  monthlyProfitUsd: number;
  /** Paying subscribers the fixed costs need to break even at current ARPU/cost. */
  breakEvenSubscribers: number | null;
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
const toUsd = (eurCents: number) => (eurCents / 100) * REVENUE_ASSUMPTIONS.usdPerEur;

export function computeFinance(input: FinanceInput): FinanceReport {
  const windowDays = input.windowDays ?? 30;
  const end = input.now.getTime();
  const start = end - windowDays * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= start && d.getTime() < end;

  // ── Recurring revenue ──
  const plans = new Map<string, PlanMrr>();
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const plan = PLANS[s.planId];
    const row = plans.get(plan.id) ?? { planId: plan.id, subscribers: 0, mrrUsd: 0 };
    row.subscribers += 1;
    row.mrrUsd += toUsd(plan.priceCents);
    plans.set(plan.id, row);
  }
  const byPlan = [...plans.values()].sort((a, b) => b.mrrUsd - a.mrrUsd);
  const payingSubscribers = byPlan.reduce((n, p) => n + p.subscribers, 0);
  const mrrUsd = byPlan.reduce((n, p) => n + p.mrrUsd, 0);
  const netMrrUsd = byPlan.reduce(
    (n, p) => n + p.subscribers * netRevenueUsd(PLANS[p.planId as keyof typeof PLANS].priceCents),
    0,
  );

  // ── One-off revenue (top-ups) ──
  const packByCredits = new Map(TOPUP_PACKS.map((p) => [p.credits, p]));
  let topUpNetUsd = 0;
  let topUpPurchases = 0;
  for (const t of input.topUps) {
    const pack = packByCredits.get(t.credits);
    if (!pack || !inWindow(t.createdAt)) continue;
    topUpNetUsd += netRevenueUsd(pack.priceCents);
    topUpPurchases += 1;
  }

  // ── Cost ──
  const tiers = new Map<string, TierCost>();
  let videosDone = 0;
  let apiCostUsd = 0;
  let wastedUsd = 0;
  for (const j of input.jobs) {
    if (!inWindow(j.createdAt)) continue;
    apiCostUsd += j.apiCostUsd;
    if (j.status !== 'done') {
      if (j.status === 'failed') wastedUsd += j.apiCostUsd;
      continue;
    }
    videosDone += 1;
    const t = tiers.get(j.modelTier) ?? {
      tier: j.modelTier,
      videos: 0,
      costUsd: 0,
      avgCostUsd: null,
    };
    t.videos += 1;
    t.costUsd += j.apiCostUsd;
    tiers.set(j.modelTier, t);
  }
  const byTier = [...tiers.values()].map((t) => ({
    ...t,
    costUsd: round(t.costUsd, 4),
    avgCostUsd: round(t.costUsd / t.videos, 4),
  }));

  // Recurring revenue is monthly; scale the window's one-offs and costs to a month.
  const perMonth = 30 / windowDays;
  const netRevenue = netMrrUsd * (windowDays / 30) + topUpNetUsd;
  const monthlyApiUsd = apiCostUsd * perMonth;
  const monthlyRevenue = netMrrUsd + topUpNetUsd * perMonth;

  const known = input.fixedCosts.filter((c) => c.monthlyUsd !== null);
  const fixedUsd = known.reduce((n, c) => n + (c.monthlyUsd ?? 0), 0);
  const unknownFixed = input.fixedCosts.filter((c) => c.monthlyUsd === null).map((c) => c.label);

  const arpu = payingSubscribers > 0 ? netMrrUsd / payingSubscribers : null;
  const avgApiPerSub = payingSubscribers > 0 ? monthlyApiUsd / payingSubscribers : 0;
  const contribution = arpu === null ? null : arpu - avgApiPerSub;

  return {
    asOf: input.now.toISOString(),
    windowDays,
    mrrUsd: round(mrrUsd),
    netMrrUsd: round(netMrrUsd),
    arrUsd: round(netMrrUsd * 12),
    payingSubscribers,
    arpuUsd: arpu === null ? null : round(arpu),
    byPlan: byPlan.map((p) => ({ ...p, mrrUsd: round(p.mrrUsd) })),
    topUpNetUsd: round(topUpNetUsd),
    topUpPurchases,
    netRevenueUsd: round(netRevenue),
    videosDone,
    apiCostUsd: round(apiCostUsd, 4),
    wastedUsd: round(wastedUsd, 4),
    avgCostPerVideoUsd: videosDone > 0 ? round(apiCostUsd / videosDone, 4) : null,
    byTier,
    grossMargin: netRevenue > 0 ? round((netRevenue - apiCostUsd) / netRevenue, 4) : null,
    revenueMultiple: apiCostUsd > 0 ? round(netRevenue / apiCostUsd, 2) : null,
    fixedUsd: round(fixedUsd),
    unknownFixed,
    monthlyProfitUsd: round(monthlyRevenue - monthlyApiUsd - fixedUsd),
    breakEvenSubscribers:
      contribution !== null && contribution > 0 ? Math.ceil(fixedUsd / contribution) : null,
  };
}
