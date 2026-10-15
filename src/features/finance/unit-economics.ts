/**
 * Unit economics from our own database: MRR, what each finished video costs us
 * in API spend, how much cash leaks into failed jobs and free users, and the
 * "MRR ratios" the Finance routine steers by. Pure: callers pass rows in, so
 * the math is testable and the script stays a thin, read-only reader.
 *
 * Money in USD (FX and fee assumptions come from the margin gate, so both
 * reports agree). API cost per job is `render_jobs.api_cost_usd`, metered by
 * the orchestrator as each provider step settles.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import type { FixedCost } from '@/config/fixed-costs';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { netRevenueUsd, REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;
export const WINDOW_DAYS = 30;

export interface FinanceSub {
  userId: string;
  planId: string;
  status: string;
}
export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}
export interface FinanceTopup {
  credits: number;
  createdAt: Date;
}
export interface FinanceInput {
  now: Date;
  subscriptions: FinanceSub[];
  jobs: FinanceJob[];
  topups: FinanceTopup[];
  fixedCosts: readonly FixedCost[];
}

export interface TierCost {
  tier: string;
  videos: number;
  avgApiCostUsd: number | null;
  /** Realized API cost per credit charged (compare with the catalog's modelled rate). */
  usdPerCredit: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  /** Subscribers whose last invoice failed: revenue at risk. */
  pastDueSubscribers: number;
  mrrGrossEur: number;
  mrrNetUsd: number;
  topupNetUsd: number;
  revenueNetUsd: number;
  arpuNetUsd: number | null;
  videosDone: number;
  videosFailed: number;
  apiCostUsd: number;
  apiCostDoneUsd: number;
  /** Spend on jobs that ended `failed` (refunded to the creator, paid to the provider). */
  apiCostFailedUsd: number;
  /** Spend on users with no live subscription (trial burn = acquisition cost). */
  apiCostFreeUsersUsd: number;
  avgApiCostPerVideoUsd: number | null;
  byTier: TierCost[];
  /** API cost ÷ net revenue. The headline MRR ratio: lower is better, <1/3 is the 3x gate. */
  apiCostToRevenue: number | null;
  /** Revenue ÷ API cost (the margin-gate multiple, measured instead of modelled). */
  revenueMultiple: number | null;
  fixedCostKnownUsd: number;
  fixedCostUnknown: string[];
  fixedCostToRevenue: number | null;
  contributionUsd: number;
  /** Contribution after the fixed costs we know about (unknown lines are NOT counted). */
  profitUsd: number;
  /** Subscribers needed to cover known fixed costs at today's ARPU and per-subscriber API cost. */
  breakEvenSubscribers: number | null;
}

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now } = input;
  const since = now.getTime() - WINDOW_DAYS * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= since;

  const live = input.subscriptions.flatMap((s) =>
    isLiveSubscription(s) ? [{ userId: s.userId, planId: s.planId, status: s.status }] : [],
  );
  const payingUsers = new Set(live.map((s) => s.userId));
  const pastDue = live.filter((s) => s.status === 'past_due').length;

  const mrrGrossEur = live.reduce((t, s) => t + PLANS[s.planId].priceCents / 100, 0);
  const mrrNetUsd = live.reduce((t, s) => t + netRevenueUsd(PLANS[s.planId].priceCents), 0);

  const packByCredits = new Map(TOPUP_PACKS.map((p) => [p.credits, p]));
  const topupNetUsd = input.topups
    .filter((t) => inWindow(t.createdAt))
    .reduce((t, x) => {
      const pack = packByCredits.get(x.credits);
      return t + (pack ? netRevenueUsd(pack.priceCents) : 0);
    }, 0);
  const revenueNetUsd = mrrNetUsd + topupNetUsd;

  const jobs = input.jobs.filter((j) => inWindow(j.createdAt));
  const done = jobs.filter((j) => j.status === 'done');
  const failed = jobs.filter((j) => j.status === 'failed');
  const sum = (rows: FinanceJob[]) => rows.reduce((t, j) => t + j.apiCostUsd, 0);
  const apiCostUsd = sum(jobs);
  const apiCostDoneUsd = sum(done);

  const tiers = [...new Set(done.map((j) => j.modelTier))].sort();
  const byTier: TierCost[] = tiers.map((tier) => {
    const rows = done.filter((j) => j.modelTier === tier);
    const credits = rows.reduce((t, j) => t + j.actualCredits, 0);
    const cost = sum(rows);
    return {
      tier,
      videos: rows.length,
      avgApiCostUsd: div(cost, rows.length) && round(cost / rows.length),
      usdPerCredit: div(cost, credits) && round(cost / credits, 7),
    };
  });

  const fixedCostKnownUsd = input.fixedCosts.reduce((t, c) => t + (c.monthlyUsd ?? 0), 0);
  const fixedCostUnknown = input.fixedCosts.filter((c) => c.monthlyUsd === null).map((c) => c.id);
  const contributionUsd = revenueNetUsd - apiCostUsd;

  const arpu = div(mrrNetUsd, live.length);
  const costPerSub = div(apiCostUsd, Math.max(payingUsers.size, 1)) ?? 0;
  const perSubContribution = (arpu ?? 0) - costPerSub;

  return {
    asOf: now.toISOString(),
    windowDays: WINDOW_DAYS,
    payingSubscribers: live.length,
    pastDueSubscribers: pastDue,
    mrrGrossEur: round(mrrGrossEur, 2),
    mrrNetUsd: round(mrrNetUsd, 2),
    topupNetUsd: round(topupNetUsd, 2),
    revenueNetUsd: round(revenueNetUsd, 2),
    arpuNetUsd: arpu === null ? null : round(arpu, 2),
    videosDone: done.length,
    videosFailed: failed.length,
    apiCostUsd: round(apiCostUsd),
    apiCostDoneUsd: round(apiCostDoneUsd),
    apiCostFailedUsd: round(sum(failed)),
    apiCostFreeUsersUsd: round(sum(jobs.filter((j) => !payingUsers.has(j.userId)))),
    avgApiCostPerVideoUsd: done.length ? round(apiCostDoneUsd / done.length) : null,
    byTier,
    apiCostToRevenue:
      div(apiCostUsd, revenueNetUsd) === null ? null : round(apiCostUsd / revenueNetUsd),
    revenueMultiple:
      div(revenueNetUsd, apiCostUsd) === null ? null : round(revenueNetUsd / apiCostUsd, 2),
    fixedCostKnownUsd: round(fixedCostKnownUsd, 2),
    fixedCostUnknown,
    fixedCostToRevenue:
      div(fixedCostKnownUsd, revenueNetUsd) === null
        ? null
        : round(fixedCostKnownUsd / revenueNetUsd),
    contributionUsd: round(contributionUsd, 2),
    profitUsd: round(contributionUsd - fixedCostKnownUsd, 2),
    breakEvenSubscribers:
      perSubContribution > 0 ? Math.ceil(fixedCostKnownUsd / perSubContribution) : null,
  };
}

/** `0.31` → `31%`, null → `n/a`. */
export const pct = (r: number | null): string => (r === null ? 'n/a' : `${Math.round(r * 100)}%`);

export { REVENUE_ASSUMPTIONS };
