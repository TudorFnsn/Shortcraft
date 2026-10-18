/**
 * Unit economics for the Finance routine (FinancePlan.md): MRR, what we keep
 * after VAT + Stripe fees, API spend per finished video, fixed costs and the
 * resulting monthly profit, from data we already store.
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`. Subscription history isn't stored, so
 * MRR is "live subscriptions today"; everything else uses a rolling window.
 *
 * Unknowns stay `null` and are reported as unknown, never as zero: a profit
 * figure that silently drops a bill we haven't entered would flatter us.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { netRevenueUsd } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;
export const WINDOW_DAYS = 30;

export interface FinanceSubscription {
  userId: string;
  planId: string;
  status: string;
}

export interface FinanceJob {
  status: string;
  modelTier: string;
  targetDurationSec: number;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

/** A paid top-up credit grant (`credit_transactions.reason = 'topup'`). */
export interface FinanceTopUp {
  credits: number;
  createdAt: Date;
}

/** One recurring bill. `monthlyUsd: null` = not entered yet (unknown). */
export interface FixedCost {
  id: string;
  label: string;
  monthlyUsd: number | null;
}

export interface FinanceInput {
  now: Date;
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  topUps: readonly FinanceTopUp[];
  fixedCosts: readonly FixedCost[];
  /** Paid acquisition spend over the window, USD (null = not entered). */
  adSpendUsd30d: number | null;
}

export interface PlanMrr {
  planId: string;
  subscribers: number;
  /** Gross, VAT included, EUR. */
  grossEur: number;
  /** After VAT + Stripe fees, USD. */
  netUsd: number;
}

export interface TierCost {
  tier: string;
  videos: number;
  apiCostUsd: number;
  avgCostUsd: number | null;
  /** Credits we billed per $1 of API cost; the margin gate wants >= ~12,000 on Pro. */
  creditsPerUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  /** Gross MRR in EUR, VAT included (what customers see). */
  mrrEur: number;
  arrEur: number;
  /** MRR after VAT + Stripe fees, USD. */
  netMrrUsd: number;
  byPlan: PlanMrr[];
  topUpNetUsd30d: number;
  netRevenueUsd30d: number;
  videosDone30d: number;
  videosFailed30d: number;
  apiCostUsd30d: number;
  /** API cost of finished videos only; failed jobs are in apiCostUsd30d. */
  avgApiCostPerVideoUsd: number | null;
  byTier: TierCost[];
  /** Share of net revenue spent on provider APIs. */
  apiCostShare: number | null;
  fixedCostsUsd30d: number;
  unknownFixedCosts: string[];
  adSpendUsd30d: number | null;
  /** Net revenue − API − known fixed − ad spend. Null while any input is unknown. */
  profitUsd30d: number | null;
  /** Same without the unknowns, so there is always a number to track. */
  profitKnownCostsUsd30d: number;
  /** Net MRR ÷ (API + known fixed), steady-state view; null with no costs. */
  revenueToCostMultiple: number | null;
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeFinance(input: FinanceInput): FinanceReport {
  const since = input.now.getTime() - WINDOW_DAYS * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= since && d.getTime() < input.now.getTime();

  // MRR: live subscriptions on a plan we sell, as of now.
  const counts = new Map<string, number>();
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    counts.set(s.planId, (counts.get(s.planId) ?? 0) + 1);
  }
  const byPlan: PlanMrr[] = Object.values(PLANS).map((p) => {
    const subscribers = counts.get(p.id) ?? 0;
    return {
      planId: p.id,
      subscribers,
      grossEur: round((subscribers * p.priceCents) / 100),
      netUsd: round(subscribers * netRevenueUsd(p.priceCents)),
    };
  });
  const payingSubscribers = byPlan.reduce((n, p) => n + p.subscribers, 0);
  const mrrEur = round(byPlan.reduce((n, p) => n + p.grossEur, 0));
  const netMrrUsd = round(byPlan.reduce((n, p) => n + p.netUsd, 0));

  // Top-ups in the window, matched to a pack by credit count (unknown sizes are skipped).
  const packByCredits = new Map(TOPUP_PACKS.map((p) => [p.credits, p]));
  const topUpNetUsd30d = round(
    input.topUps
      .filter((t) => inWindow(t.createdAt))
      .reduce((sum, t) => {
        const pack = packByCredits.get(t.credits);
        return pack ? sum + netRevenueUsd(pack.priceCents) : sum;
      }, 0),
  );

  // API spend: every job in the window, finished or not (a failed job still burned money).
  const recent = input.jobs.filter((j) => inWindow(j.createdAt));
  const done = recent.filter((j) => j.status === 'done');
  const failed = recent.filter((j) => j.status === 'failed');
  const apiCostUsd30d = round(
    recent.reduce((n, j) => n + j.apiCostUsd, 0),
    4,
  );
  const doneCost = done.reduce((n, j) => n + j.apiCostUsd, 0);

  const tiers = [...new Set(done.map((j) => j.modelTier))].sort();
  const byTier: TierCost[] = tiers.map((tier) => {
    const jobs = done.filter((j) => j.modelTier === tier);
    const cost = jobs.reduce((n, j) => n + j.apiCostUsd, 0);
    const credits = jobs.reduce((n, j) => n + j.actualCredits, 0);
    return {
      tier,
      videos: jobs.length,
      apiCostUsd: round(cost, 4),
      avgCostUsd: jobs.length ? round(cost / jobs.length, 4) : null,
      creditsPerUsd: cost > 0 ? Math.round(credits / cost) : null,
    };
  });

  const netRevenueUsd30d = round(netMrrUsd + topUpNetUsd30d);
  const knownFixed = input.fixedCosts.reduce((n, c) => n + (c.monthlyUsd ?? 0), 0);
  const unknownFixedCosts = input.fixedCosts.filter((c) => c.monthlyUsd === null).map((c) => c.id);
  const ads = input.adSpendUsd30d ?? 0;
  const profitKnownCostsUsd30d = round(netRevenueUsd30d - apiCostUsd30d - knownFixed - ads);
  const allKnown = unknownFixedCosts.length === 0 && input.adSpendUsd30d !== null;
  const steadyCost = apiCostUsd30d + knownFixed;

  return {
    asOf: input.now.toISOString(),
    windowDays: WINDOW_DAYS,
    payingSubscribers,
    mrrEur,
    arrEur: round(mrrEur * 12),
    netMrrUsd,
    byPlan,
    topUpNetUsd30d,
    netRevenueUsd30d,
    videosDone30d: done.length,
    videosFailed30d: failed.length,
    apiCostUsd30d,
    avgApiCostPerVideoUsd: done.length ? round(doneCost / done.length, 4) : null,
    byTier,
    apiCostShare: netRevenueUsd30d > 0 ? round(apiCostUsd30d / netRevenueUsd30d, 3) : null,
    fixedCostsUsd30d: round(knownFixed),
    unknownFixedCosts,
    adSpendUsd30d: input.adSpendUsd30d,
    profitUsd30d: allKnown ? profitKnownCostsUsd30d : null,
    profitKnownCostsUsd30d,
    revenueToCostMultiple: steadyCost > 0 ? round(netRevenueUsd30d / steadyCost) : null,
  };
}
