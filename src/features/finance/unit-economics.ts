/**
 * Unit economics from data we already store: MRR from live subscriptions, API
 * cost per finished video from `render_jobs.api_cost_usd`, gross margin and a
 * fixed-cost view. Pure: the report script feeds it rows, tests feed fixtures.
 */
import { PLANS, type PlanId } from '@/config/plans';
import type { FixedCost } from '@/config/finance';
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;

export interface FinanceSub {
  planId: string;
  status: string;
}
export interface FinanceJob {
  status: string;
  createdAt: Date;
  apiCostUsd: number;
  actualCredits: number;
}
export interface FinanceInput {
  now: Date;
  subscriptions: FinanceSub[];
  jobs: FinanceJob[];
  fixedCosts: readonly FixedCost[];
  /** Stripe-reported net revenue for the window, when known (overrides the estimate). */
  assumptions?: RevenueAssumptions;
  windowDays?: number;
}

const LIVE = new Set(['active', 'trialing', 'past_due']);
const isPlan = (id: string): id is PlanId => id in PLANS;

/** Net USD we keep from one EUR charge (after VAT and Stripe fees). */
export function netUsdFromEurCents(cents: number, a: RevenueAssumptions): number {
  const gross = cents / 100;
  const net = (gross / (1 + a.vatRate)) * (1 - a.stripePercentFee) - a.stripeFixedFeeEur;
  return net * a.usdPerEur;
}

const ratio = (n: number, d: number) => (d > 0 ? n / d : null);

export function computeFinance(input: FinanceInput) {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * DAY_MS;

  const byPlan: Record<string, { subscribers: number; mrrNetUsd: number }> = {};
  let mrrNetUsd = 0;
  let subscribers = 0;
  for (const s of input.subscriptions) {
    if (!LIVE.has(s.status) || !isPlan(s.planId)) continue;
    const net = netUsdFromEurCents(PLANS[s.planId].priceCents, a);
    const row = (byPlan[s.planId] ??= { subscribers: 0, mrrNetUsd: 0 });
    row.subscribers += 1;
    row.mrrNetUsd += net;
    mrrNetUsd += net;
    subscribers += 1;
  }

  const recent = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const done = recent.filter((j) => j.status === 'done');
  const failed = recent.filter((j) => j.status === 'failed');
  // Failed jobs still burn provider money (refunded to the user, not to us).
  const apiCostUsd = recent.reduce((t, j) => t + j.apiCostUsd, 0);
  const failedCostUsd = failed.reduce((t, j) => t + j.apiCostUsd, 0);
  const creditsBurned = done.reduce((t, j) => t + j.actualCredits, 0);

  const knownFixed = input.fixedCosts.reduce((t, c) => t + (c.monthlyUsd ?? 0), 0);
  const unknownFixed = input.fixedCosts.filter((c) => c.monthlyUsd === null).map((c) => c.id);
  const monthlyApi = (apiCostUsd / windowDays) * 30;

  return {
    asOf: input.now.toISOString(),
    windowDays,
    mrrNetUsd,
    arrNetUsd: mrrNetUsd * 12,
    subscribers,
    arpuNetUsd: ratio(mrrNetUsd, subscribers),
    byPlan,
    videosFinished: done.length,
    apiCostUsd,
    failedCostUsd,
    apiCostPerVideoUsd: ratio(apiCostUsd, done.length),
    apiCostPer1kCreditsUsd: ratio(apiCostUsd * 1000, creditsBurned),
    apiCostShareOfMrr: ratio(monthlyApi, mrrNetUsd),
    grossMarginPct: mrrNetUsd > 0 ? (1 - monthlyApi / mrrNetUsd) * 100 : null,
    fixedCostsKnownUsd: knownFixed,
    fixedCostsUnknown: unknownFixed,
    monthlyNetUsd: mrrNetUsd - monthlyApi - knownFixed,
    breakEvenMrrUsd: knownFixed + monthlyApi,
  };
}
export type FinanceReport = ReturnType<typeof computeFinance>;
