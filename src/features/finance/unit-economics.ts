/**
 * Unit economics for the Finance CFO routine: MRR, cost per finished video,
 * gross margin and the MRR ratio. Pure functions: scripts/finance-report.mts
 * reads the data, this module does the math.
 *
 * MRR ratio = net MRR / (variable API cost + fixed costs) for the same period.
 * Above 1 the app pays for itself; the CFO routine steers it toward 3.
 */
import type { FixedCost } from '@/config/fixed-costs';

export interface SubscriptionInput {
  /** Monthly price in EUR cents. */
  priceCents: number;
  /** True when the subscription counts as paying (see isLiveSubscription). */
  live: boolean;
}

export interface JobInput {
  status: string;
  apiCostUsd: number;
  createdAt: Date;
}

export interface Assumptions {
  eurToUsd: number;
  /** Share of the gross price kept after VAT + Stripe fees. */
  netRevenueShare: number;
}

export const DEFAULT_ASSUMPTIONS: Assumptions = { eurToUsd: 1.08, netRevenueShare: 0.74 };

export interface UnitEconomics {
  payingSubscribers: number;
  grossMrrUsd: number;
  netMrrUsd: number;
  windowDays: number;
  videosFinished: number;
  videosFailed: number;
  variableCostUsd: number;
  failedCostUsd: number;
  costPerFinishedVideoUsd: number | null;
  fixedCostUsd: number;
  unconfirmedFixedUsd: number;
  /** netMrr / (variable cost scaled to 30 days + fixed). null when there is no cost. */
  mrrRatio: number | null;
  grossMarginPct: number | null;
}

const round = (n: number, d = 4) => Number(n.toFixed(d));

export function computeUnitEconomics(input: {
  now: Date;
  windowDays: number;
  subscriptions: readonly SubscriptionInput[];
  jobs: readonly JobInput[];
  fixedCosts: readonly FixedCost[];
  assumptions?: Assumptions;
}): UnitEconomics {
  const a = input.assumptions ?? DEFAULT_ASSUMPTIONS;
  const since = input.now.getTime() - input.windowDays * 86_400_000;
  const live = input.subscriptions.filter((s) => s.live);
  const grossMrrUsd = live.reduce((sum, s) => sum + (s.priceCents / 100) * a.eurToUsd, 0);
  const netMrrUsd = grossMrrUsd * a.netRevenueShare;

  const jobs = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const done = jobs.filter((j) => j.status === 'done');
  const failed = jobs.filter((j) => j.status === 'failed');
  const sum = (xs: readonly JobInput[]) => xs.reduce((t, j) => t + j.apiCostUsd, 0);
  const variableCostUsd = sum(jobs);
  const monthlyVariable = (variableCostUsd / input.windowDays) * 30;
  const fixedCostUsd = input.fixedCosts.reduce((t, c) => t + c.monthlyUsd, 0);
  const unconfirmedFixedUsd = input.fixedCosts
    .filter((c) => !c.confirmed)
    .reduce((t, c) => t + c.monthlyUsd, 0);
  const totalCost = monthlyVariable + fixedCostUsd;

  return {
    payingSubscribers: live.length,
    grossMrrUsd: round(grossMrrUsd, 2),
    netMrrUsd: round(netMrrUsd, 2),
    windowDays: input.windowDays,
    videosFinished: done.length,
    videosFailed: failed.length,
    variableCostUsd: round(variableCostUsd),
    failedCostUsd: round(sum(failed)),
    costPerFinishedVideoUsd: done.length ? round(variableCostUsd / done.length) : null,
    fixedCostUsd: round(fixedCostUsd, 2),
    unconfirmedFixedUsd: round(unconfirmedFixedUsd, 2),
    mrrRatio: totalCost > 0 ? round(netMrrUsd / totalCost, 2) : null,
    grossMarginPct: netMrrUsd > 0 ? round(((netMrrUsd - totalCost) / netMrrUsd) * 100, 1) : null,
  };
}
