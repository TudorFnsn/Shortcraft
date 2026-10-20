/**
 * Finance metrics for the Finance CFO routine (FinancePlan.md): MRR, what the
 * API spend was, and the ratio between them, computed from data we already
 * store. Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`.
 *
 * Definitions:
 * - **MRR:** the monthly list price (EUR, VAT-inclusive) of every live
 *   subscription on a plan we sell. Top-ups are not recurring and stay out.
 * - **Net MRR:** MRR after VAT and Stripe fees, in USD, the same math as the
 *   margin gate (`netRevenueUsd`).
 * - **API cost (30d):** `render_jobs.api_cost_usd` of jobs created in the last
 *   30 days, split into finished, failed and in-flight. Failed jobs are refunded
 *   to the user, so their cost is pure burn.
 * - **MRR ratio:** net MRR ÷ API cost of the last 30 days. The margin gate asks
 *   3x for a fully burned plan; this is the same question on real usage.
 *   Top-up revenue is not in the numerator, so the ratio is conservative.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { netRevenueUsd, TARGET_MARGIN_MULTIPLE } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;

export interface FinanceSubscription extends SubscriptionSnapshot {
  userId: string;
}

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  chargedCredits: number;
}

export interface FinanceInput {
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  now: Date;
}

export interface PlanMrr {
  planId: PlanId;
  subscribers: number;
  mrrEur: number;
}

export interface TierCost {
  tier: string;
  finished: number;
  apiCostUsd: number;
  /** API cost per finished video, null with no finished video. */
  costPerVideoUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  mrrEur: number;
  arrEur: number;
  netMrrUsd: number;
  payingSubscribers: number;
  /** MRR ÷ paying subscribers, EUR. Null with no subscriber. */
  arpuEur: number | null;
  byPlan: PlanMrr[];
  apiCostUsd: number;
  /** Cost of jobs that ended `failed` (refunded to the user: pure burn). */
  failedCostUsd: number;
  /** Cost of jobs not yet finished or failed. */
  inFlightCostUsd: number;
  byTier: TierCost[];
  /** Net MRR ÷ API cost; null when no API cost was recorded. */
  mrrRatio: number | null;
  targetRatio: number;
  /** API dollars per 1,000 credits charged on finished jobs; null with none. */
  costPer1kCreditsUsd: number | null;
  /** Users with a finished video in the window who are not on a live subscription. */
  freeActiveUsers: number;
  /** API cost of those users' jobs: what the free tier and trials cost us. */
  freeUserCostUsd: number;
}

const round = (n: number, places: number): number => {
  const f = 10 ** places;
  return Math.round(n * f) / f;
};

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now } = input;
  const since = now.getTime() - WINDOW_DAYS * DAY_MS;

  const live = input.subscriptions.filter(isLiveSubscription);
  const byPlanMap = new Map<PlanId, PlanMrr>();
  let netMrrUsd = 0;
  for (const s of live) {
    const plan = PLANS[s.planId as PlanId];
    if (!plan) continue;
    const row = byPlanMap.get(plan.id) ?? { planId: plan.id, subscribers: 0, mrrEur: 0 };
    row.subscribers += 1;
    row.mrrEur += plan.priceCents / 100;
    byPlanMap.set(plan.id, row);
    netMrrUsd += netRevenueUsd(plan.priceCents);
  }
  const byPlan = [...byPlanMap.values()].sort((a, b) => b.mrrEur - a.mrrEur);
  const payingSubscribers = byPlan.reduce((n, p) => n + p.subscribers, 0);
  const mrrEur = byPlan.reduce((n, p) => n + p.mrrEur, 0);

  const payingIds = new Set(live.map((s) => s.userId));
  const recent = input.jobs.filter((j) => j.createdAt.getTime() >= since);

  let apiCostUsd = 0;
  let failedCostUsd = 0;
  let inFlightCostUsd = 0;
  let finishedCredits = 0;
  let finishedCost = 0;
  const tiers = new Map<string, TierCost>();
  const freeUsers = new Set<string>();
  let freeUserCostUsd = 0;

  for (const j of recent) {
    apiCostUsd += j.apiCostUsd;
    if (j.status === 'failed') failedCostUsd += j.apiCostUsd;
    else if (j.status !== 'done') inFlightCostUsd += j.apiCostUsd;
    else {
      finishedCredits += j.chargedCredits;
      finishedCost += j.apiCostUsd;
      const t = tiers.get(j.modelTier) ?? {
        tier: j.modelTier,
        finished: 0,
        apiCostUsd: 0,
        costPerVideoUsd: null,
      };
      t.finished += 1;
      t.apiCostUsd += j.apiCostUsd;
      tiers.set(j.modelTier, t);
    }
    if (!payingIds.has(j.userId)) {
      freeUserCostUsd += j.apiCostUsd;
      if (j.status === 'done') freeUsers.add(j.userId);
    }
  }

  const byTier = [...tiers.values()]
    .map((t) => ({
      ...t,
      apiCostUsd: round(t.apiCostUsd, 4),
      costPerVideoUsd: t.finished ? round(t.apiCostUsd / t.finished, 4) : null,
    }))
    .sort((a, b) => b.apiCostUsd - a.apiCostUsd);

  return {
    asOf: now.toISOString(),
    windowDays: WINDOW_DAYS,
    mrrEur: round(mrrEur, 2),
    arrEur: round(mrrEur * 12, 2),
    netMrrUsd: round(netMrrUsd, 2),
    payingSubscribers,
    arpuEur: payingSubscribers ? round(mrrEur / payingSubscribers, 2) : null,
    byPlan,
    apiCostUsd: round(apiCostUsd, 4),
    failedCostUsd: round(failedCostUsd, 4),
    inFlightCostUsd: round(inFlightCostUsd, 4),
    byTier,
    mrrRatio: apiCostUsd > 0 ? round(netMrrUsd / apiCostUsd, 2) : null,
    targetRatio: TARGET_MARGIN_MULTIPLE,
    costPer1kCreditsUsd:
      finishedCredits > 0 ? round((finishedCost / finishedCredits) * 1000, 4) : null,
    freeActiveUsers: freeUsers.size,
    freeUserCostUsd: round(freeUserCostUsd, 4),
  };
}
