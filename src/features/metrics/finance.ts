/**
 * Finance metrics: MRR, net revenue, API spend and margin, from data we already
 * store. Pure like `north-star.ts`: the caller loads rows (Supabase in
 * `scripts/finance-report.mts`, fixtures in tests) and passes `now`.
 *
 * Definitions:
 * - **MRR:** sum of plan prices (EUR, VAT inclusive) of live subscriptions as of
 *   `now`. **Net MRR** applies `netRevenueUsd` (VAT, Stripe fees, FX).
 * - **Top-up revenue:** `topup` ledger rows in the window, priced by the pack
 *   with the same credit count (unknown sizes are counted and priced at 0).
 * - **API cost:** `render_jobs.api_cost_usd` of jobs created in the window.
 *   Failed jobs are cash we spent for no video; reported on their own.
 * - **Gross margin:** (net subscription + top-up revenue − API cost) ÷ revenue.
 *   Subscription revenue is MRR, not cash collected (no invoice table yet).
 * - **Profit:** gross profit − fixed costs (`config/costs.ts`).
 */
import type { PlanId } from '@/config/plans';
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { FIXED_COSTS, type FixedCost } from '@/config/costs';
import { netRevenueUsd } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';

export const FINANCE_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export interface FinanceJob {
  status: string;
  modelTier: string;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface FinanceTopUp {
  credits: number;
  createdAt: Date;
}

export interface FinanceInput {
  subscriptions: readonly SubscriptionSnapshot[];
  jobs: readonly FinanceJob[];
  topUps: readonly FinanceTopUp[];
  now: Date;
  fixedCosts?: readonly FixedCost[];
  windowDays?: number;
}

export interface TierCost {
  videos: number;
  apiCostUsd: number;
  /** API cost ÷ finished videos; null with none. */
  costPerVideoUsd: number | null;
  /** Credits charged for these videos. */
  credits: number;
  /** API dollars per 1,000 credits charged — compare with the catalog's. */
  usdPer1kCredits: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  mrrEur: number;
  netMrrUsd: number;
  arpuEur: number | null;
  byPlan: Record<string, { subscribers: number; mrrEur: number }>;
  topUpRevenueUsd: number;
  unpricedTopUps: number;
  apiCostUsd: number;
  failedJobCostUsd: number;
  failedJobs: number;
  byTier: Record<string, TierCost>;
  fixedCostUsd: number;
  unconfirmedFixedCosts: string[];
  grossMargin: number | null;
  profitUsd: number;
  /** Subscribers on today's mix needed to cover fixed costs + API spend; null with no subscribers. */
  breakEvenSubscribers: number | null;
}

const orNull = (n: number, d: number) => (d === 0 ? null : n / d);

export function computeFinance(input: FinanceInput): FinanceReport {
  const windowDays = input.windowDays ?? FINANCE_WINDOW_DAYS;
  const end = input.now.getTime();
  const start = end - windowDays * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= start && d.getTime() < end;
  const fixed = input.fixedCosts ?? FIXED_COSTS;

  const byPlan: FinanceReport['byPlan'] = {};
  let mrrEur = 0;
  let netMrrUsd = 0;
  let subscribers = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const plan = PLANS[s.planId as PlanId];
    subscribers++;
    mrrEur += plan.priceCents / 100;
    netMrrUsd += netRevenueUsd(plan.priceCents);
    const row = (byPlan[s.planId] ??= { subscribers: 0, mrrEur: 0 });
    row.subscribers++;
    row.mrrEur += plan.priceCents / 100;
  }

  let topUpRevenueUsd = 0;
  let unpricedTopUps = 0;
  for (const t of input.topUps) {
    if (!inWindow(t.createdAt)) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (pack) topUpRevenueUsd += netRevenueUsd(pack.priceCents);
    else unpricedTopUps++;
  }

  const byTier: Record<string, TierCost> = {};
  let apiCostUsd = 0;
  let failedJobCostUsd = 0;
  let failedJobs = 0;
  for (const j of input.jobs) {
    if (!inWindow(j.createdAt)) continue;
    apiCostUsd += j.apiCostUsd;
    if (j.status === 'failed') {
      failedJobs++;
      failedJobCostUsd += j.apiCostUsd;
    }
    if (j.status !== 'done') continue;
    const t = (byTier[j.modelTier] ??= {
      videos: 0,
      apiCostUsd: 0,
      costPerVideoUsd: null,
      credits: 0,
      usdPer1kCredits: null,
    });
    t.videos++;
    t.apiCostUsd += j.apiCostUsd;
    t.credits += j.actualCredits;
  }
  for (const t of Object.values(byTier)) {
    t.costPerVideoUsd = orNull(t.apiCostUsd, t.videos);
    t.usdPer1kCredits = t.credits === 0 ? null : (t.apiCostUsd / t.credits) * 1000;
  }

  const revenueUsd = netMrrUsd + topUpRevenueUsd;
  const fixedCostUsd = fixed.reduce((sum, c) => sum + c.usdPerMonth, 0);
  const grossProfit = revenueUsd - apiCostUsd;
  // Per-subscriber margin = (net MRR − monthly API spend, excluding top-ups) ÷ subscribers.
  const perSub = subscribers === 0 ? 0 : (netMrrUsd - apiCostUsd) / subscribers;

  return {
    asOf: input.now.toISOString(),
    windowDays,
    payingSubscribers: subscribers,
    mrrEur,
    netMrrUsd,
    arpuEur: orNull(mrrEur, subscribers),
    byPlan,
    topUpRevenueUsd,
    unpricedTopUps,
    apiCostUsd,
    failedJobCostUsd,
    failedJobs,
    byTier,
    fixedCostUsd,
    unconfirmedFixedCosts: fixed.filter((c) => c.status !== 'confirmed').map((c) => c.id),
    grossMargin: orNull(grossProfit, revenueUsd),
    profitUsd: grossProfit - fixedCostUsd,
    breakEvenSubscribers: perSub > 0 ? Math.ceil(fixedCostUsd / perSub) : null,
  };
}
