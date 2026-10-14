/**
 * Finance snapshot: MRR, API spend per video and cash margin, from data we
 * already store (`subscriptions`, `render_jobs.api_cost_usd`, paid
 * `credit_transactions`). Pure, like `north-star.ts`: the caller loads rows
 * and passes `now`.
 *
 * Simplifications, all stated so the routine doesn't over-read them:
 * - **MRR** = sum of list prices of live subscriptions (no VAT, no discounts,
 *   no FX; EUR). Yearly billing does not exist yet.
 * - **API cost** = `render_jobs.api_cost_usd`, the orchestrator's metered cost
 *   per job (failed jobs keep the spend they incurred before failing).
 * - **Fixed costs** are not in the database; the caller passes the monthly USD
 *   total from `FinancePlan.md` §4.
 */
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { PLANS, type PlanId } from '@/config/plans';

export const DAY_MS = 86_400_000;

export interface FinanceJob {
  tier: string;
  status: string;
  apiCostUsd: number;
  createdAt: Date;
}

export interface FinanceInput {
  now: Date;
  subscriptions: readonly SubscriptionSnapshot[];
  jobs: readonly FinanceJob[];
  /** EUR → USD, to put revenue and cost on one scale. */
  eurToUsd: number;
  /** Fixed monthly spend in USD (hosting, DB, ElevenLabs plan, domain…). */
  fixedMonthlyUsd: number;
  /** Stripe fee share of revenue (EEA cards ≈ 1.5% + €0.25; use a flat share). */
  stripeFeeShare?: number;
}

export interface TierCost {
  tier: string;
  done: number;
  failed: number;
  avgCostUsdPerDone: number;
  totalCostUsd: number;
}

export interface FinanceReport {
  asOf: string;
  mrrEur: number;
  payingSubscribers: number;
  byPlan: Record<string, { subscribers: number; mrrEur: number }>;
  arpuEur: number;
  /** Last 30 days of API spend, USD. */
  apiCost30dUsd: number;
  videosDone30d: number;
  failedCost30dUsd: number;
  tiers: TierCost[];
  /** Revenue after Stripe fees minus API and fixed cost, USD per month (MRR basis). */
  monthlyCashMarginUsd: number;
  /** MRR (USD, after fees) ÷ (30d API cost + fixed). null when there is no cost yet. */
  revenueToCostRatio: number | null;
  /** Subscribers at the current ARPU needed to cover fixed cost alone. */
  breakEvenSubscribers: number | null;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function computeFinance(input: FinanceInput): FinanceReport {
  const fee = input.stripeFeeShare ?? 0.03;
  const live = input.subscriptions.filter(isLiveSubscription);
  const byPlan: FinanceReport['byPlan'] = {};
  let mrrCents = 0;
  for (const s of live) {
    const plan = PLANS[s.planId as PlanId];
    if (!plan) continue;
    const row = (byPlan[plan.id] ??= { subscribers: 0, mrrEur: 0 });
    row.subscribers += 1;
    row.mrrEur += plan.priceCents / 100;
    mrrCents += plan.priceCents;
  }
  const subscribers = Object.values(byPlan).reduce((n, p) => n + p.subscribers, 0);
  const mrrEur = mrrCents / 100;

  const since = input.now.getTime() - 30 * DAY_MS;
  const recent = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const tiers = new Map<string, TierCost>();
  let apiCost = 0;
  let failedCost = 0;
  let done = 0;
  for (const j of recent) {
    const t = tiers.get(j.tier) ?? {
      tier: j.tier,
      done: 0,
      failed: 0,
      avgCostUsdPerDone: 0,
      totalCostUsd: 0,
    };
    t.totalCostUsd += j.apiCostUsd;
    apiCost += j.apiCostUsd;
    if (j.status === 'done') {
      t.done += 1;
      done += 1;
    } else if (j.status === 'failed') {
      t.failed += 1;
      failedCost += j.apiCostUsd;
    }
    tiers.set(j.tier, t);
  }
  const tierRows = [...tiers.values()].map((t) => ({
    ...t,
    totalCostUsd: round(t.totalCostUsd, 4),
    avgCostUsdPerDone: t.done ? round(t.totalCostUsd / t.done, 4) : 0,
  }));

  const netRevenueUsd = mrrEur * input.eurToUsd * (1 - fee);
  const cost = apiCost + input.fixedMonthlyUsd;
  const arpu = subscribers ? mrrEur / subscribers : 0;
  const costPerSub = subscribers ? cost / subscribers : 0;
  const netPerSub = subscribers ? netRevenueUsd / subscribers : 0;
  return {
    asOf: input.now.toISOString(),
    mrrEur: round(mrrEur),
    payingSubscribers: subscribers,
    byPlan,
    arpuEur: round(arpu),
    apiCost30dUsd: round(apiCost, 4),
    videosDone30d: done,
    failedCost30dUsd: round(failedCost, 4),
    tiers: tierRows,
    monthlyCashMarginUsd: round(netRevenueUsd - cost),
    revenueToCostRatio: cost > 0 ? round(netRevenueUsd / cost) : null,
    breakEvenSubscribers:
      netPerSub > 0 && costPerSub >= 0 ? Math.ceil(input.fixedMonthlyUsd / netPerSub) : null,
  };
}
