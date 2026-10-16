/**
 * Unit economics from live data: MRR, cost per finished video, gross margin,
 * and the money wasted on jobs that failed. Pure (data in, numbers out), so the
 * Finance CFO routine and `scripts/finance-report.mts` share one definition.
 *
 * Revenue follows `billing/margin.ts` (net of VAT + Stripe fees). Subscription
 * revenue is the monthly list price of each live subscription; top-up revenue
 * comes from the pack that matches the granted credits. Yearly billing is not
 * modelled yet (no yearly prices are sold), so it is counted as monthly.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { netRevenueUsd } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;

export interface FinanceJob {
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  actualCredits: number;
}

export interface FinanceSubscription {
  planId: string;
  status: string;
}

export interface FinanceTopUp {
  credits: number;
  createdAt: Date;
}

/** Fixed monthly vendor costs in USD. `null` = the owner has not told us yet. */
export type FixedCosts = Readonly<Record<string, number | null>>;

export interface FinanceInput {
  now: Date;
  jobs: readonly FinanceJob[];
  subscriptions: readonly FinanceSubscription[];
  topUps: readonly FinanceTopUp[];
  fixedCostsUsdPerMonth: FixedCosts;
  /** Window for variable figures (default 30 days). */
  windowDays?: number;
}

export interface TierEconomics {
  tier: string;
  finished: number;
  apiCostUsd: number;
  avgCostPerVideoUsd: number | null;
  creditsPerVideo: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  /** Net monthly recurring revenue (USD, after VAT + Stripe fees). */
  mrrNetUsd: number;
  /** Gross price MRR in EUR, as the customer pays. */
  mrrGrossEur: number;
  payingSubscribers: number;
  arpuNetUsd: number | null;
  topUpRevenueNetUsd: number;
  variableCostUsd: number;
  wastedOnFailedUsd: number;
  fixedCostsKnownUsd: number;
  fixedCostsUnknown: string[];
  /** (net revenue in window − variable − known fixed) / net revenue; null with no revenue. */
  grossMarginRatio: number | null;
  monthlyProfitUsd: number;
  /** Variable API cost ÷ MRR+top-ups. A cost-to-revenue ratio, lower is better. */
  apiCostShare: number | null;
  perTier: TierEconomics[];
  failureRate: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function computeFinance(input: FinanceInput): FinanceReport {
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * DAY_MS;
  const inWindow = <T extends { createdAt: Date }>(rows: readonly T[]) =>
    rows.filter((r) => r.createdAt.getTime() >= since);

  const live = input.subscriptions.filter(isLiveSubscription);
  const mrrNetUsd = live.reduce((s, sub) => s + netRevenueUsd(PLANS[sub.planId].priceCents), 0);
  const mrrGrossEur = live.reduce((s, sub) => s + PLANS[sub.planId].priceCents / 100, 0);

  const topUpRevenueNetUsd = inWindow(input.topUps).reduce((s, t) => {
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    return s + (pack ? netRevenueUsd(pack.priceCents) : 0);
  }, 0);

  const jobs = inWindow(input.jobs);
  const finished = jobs.filter((j) => j.status === 'done');
  const failed = jobs.filter((j) => j.status === 'failed');
  const variableCostUsd = jobs.reduce((s, j) => s + j.apiCostUsd, 0);
  const wastedOnFailedUsd = failed.reduce((s, j) => s + j.apiCostUsd, 0);

  const tiers = [...new Set(finished.map((j) => j.modelTier))].sort();
  const perTier: TierEconomics[] = tiers.map((tier) => {
    const t = finished.filter((j) => j.modelTier === tier);
    const cost = t.reduce((s, j) => s + j.apiCostUsd, 0);
    const credits = t.reduce((s, j) => s + j.actualCredits, 0);
    return {
      tier,
      finished: t.length,
      apiCostUsd: round2(cost),
      avgCostPerVideoUsd: t.length ? cost / t.length : null,
      creditsPerVideo: t.length ? credits / t.length : null,
    };
  });

  const fixedEntries = Object.entries(input.fixedCostsUsdPerMonth);
  const fixedCostsKnownUsd = fixedEntries.reduce((s, [, v]) => s + (v ?? 0), 0);
  const fixedCostsUnknown = fixedEntries.filter(([, v]) => v === null).map(([k]) => k);

  const revenue = mrrNetUsd + topUpRevenueNetUsd;
  const monthlyProfitUsd = revenue - variableCostUsd - fixedCostsKnownUsd;
  const decided = finished.length + failed.length;

  return {
    asOf: input.now.toISOString(),
    windowDays,
    mrrNetUsd: round2(mrrNetUsd),
    mrrGrossEur: round2(mrrGrossEur),
    payingSubscribers: live.length,
    arpuNetUsd: live.length ? round2(mrrNetUsd / live.length) : null,
    topUpRevenueNetUsd: round2(topUpRevenueNetUsd),
    variableCostUsd: round2(variableCostUsd),
    wastedOnFailedUsd: round2(wastedOnFailedUsd),
    fixedCostsKnownUsd: round2(fixedCostsKnownUsd),
    fixedCostsUnknown,
    grossMarginRatio: revenue > 0 ? monthlyProfitUsd / revenue : null,
    monthlyProfitUsd: round2(monthlyProfitUsd),
    apiCostShare: revenue > 0 ? variableCostUsd / revenue : null,
    perTier,
    failureRate: decided ? failed.length / decided : null,
  };
}
