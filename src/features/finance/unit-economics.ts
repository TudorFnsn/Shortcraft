/**
 * Unit economics: MRR and what a finished video costs us versus what it earns,
 * computed from data we already store (`subscriptions`, `render_jobs`). Used by
 * the Finance CFO routine (FinancePlan.md) and `scripts/finance-report.mts`.
 *
 * Pure: the caller loads rows and passes `now`, so every number is reproducible.
 *
 * Definitions:
 * - **MRR:** sum of list price (EUR) of live subscriptions on a plan we sell,
 *   gross of VAT and Stripe fees. **Net MRR** applies the margin gate's
 *   `netRevenueUsd` (VAT + Stripe fees) per subscriber, in USD.
 * - **API cost:** `render_jobs.api_cost_usd`, which is what our adapters
 *   *reported* (catalog assumptions until a provider returns billed cost). The
 *   CFO routine reconciles it against real provider invoices.
 * - **Credits per USD of cost:** `actual_credits / api_cost_usd` on done jobs.
 *   The margin gate needs this high enough that a fully burned plan clears 3x.
 */
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { netRevenueUsd } from '@/features/billing/margin';
import { PLANS, type PlanId } from '@/config/plans';

export const DAY_MS = 86_400_000;

export interface FinanceJob {
  status: string;
  modelTier: string;
  actualCredits: number;
  apiCostUsd: number;
  createdAt: Date;
}

export interface FinanceInput {
  now: Date;
  subscriptions: readonly SubscriptionSnapshot[];
  jobs: readonly FinanceJob[];
  /** Look-back window for job cost stats. Default 30 days. */
  windowDays?: number;
}

export interface TierCost {
  tier: string;
  videos: number;
  apiCostUsd: number;
  avgCostUsd: number | null;
  avgCredits: number | null;
  creditsPerUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  subscribersByPlan: Record<PlanId, number>;
  payingSubscribers: number;
  mrrEur: number;
  arrEur: number;
  netMrrUsd: number;
  arpuEur: number | null;
  /** API cost of all jobs created in the window (done, failed and in-flight). */
  windowApiCostUsd: number;
  /** Cost burned by jobs that did not finish (failed or cancelled). */
  wastedApiCostUsd: number;
  tiers: TierCost[];
  /** (net MRR - API cost scaled to a month) / net MRR; null without revenue. */
  grossMarginMonthly: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function computeFinance(input: FinanceInput): FinanceReport {
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * DAY_MS;

  const subscribersByPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  for (const sub of input.subscriptions) {
    if (isLiveSubscription(sub)) subscribersByPlan[sub.planId] += 1;
  }

  let mrrCents = 0;
  let netMrrUsd = 0;
  let payingSubscribers = 0;
  for (const id of Object.keys(subscribersByPlan) as PlanId[]) {
    const n = subscribersByPlan[id];
    payingSubscribers += n;
    mrrCents += n * PLANS[id].priceCents;
    netMrrUsd += n * netRevenueUsd(PLANS[id].priceCents);
  }

  const jobs = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const byTier = new Map<string, { videos: number; cost: number; credits: number }>();
  let windowApiCostUsd = 0;
  let wastedApiCostUsd = 0;
  for (const j of jobs) {
    windowApiCostUsd += j.apiCostUsd;
    if (j.status === 'failed' || j.status === 'cancelled') wastedApiCostUsd += j.apiCostUsd;
    if (j.status !== 'done') continue;
    const t = byTier.get(j.modelTier) ?? { videos: 0, cost: 0, credits: 0 };
    t.videos += 1;
    t.cost += j.apiCostUsd;
    t.credits += j.actualCredits;
    byTier.set(j.modelTier, t);
  }

  const tiers: TierCost[] = [...byTier.entries()]
    .map(([tier, t]) => ({
      tier,
      videos: t.videos,
      apiCostUsd: round2(t.cost),
      avgCostUsd: div(t.cost, t.videos),
      avgCredits: div(t.credits, t.videos),
      creditsPerUsd: div(t.credits, t.cost),
    }))
    .sort((a, b) => a.tier.localeCompare(b.tier));

  const monthlyCost = windowApiCostUsd * (30 / windowDays);
  return {
    asOf: input.now.toISOString(),
    windowDays,
    subscribersByPlan,
    payingSubscribers,
    mrrEur: round2(mrrCents / 100),
    arrEur: round2((mrrCents * 12) / 100),
    netMrrUsd: round2(netMrrUsd),
    arpuEur: payingSubscribers > 0 ? round2(mrrCents / 100 / payingSubscribers) : null,
    windowApiCostUsd: round2(windowApiCostUsd),
    wastedApiCostUsd: round2(wastedApiCostUsd),
    tiers,
    grossMarginMonthly: netMrrUsd > 0 ? (netMrrUsd - monthlyCost) / netMrrUsd : null,
  };
}
