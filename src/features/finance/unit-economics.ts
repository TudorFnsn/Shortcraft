/**
 * Unit economics for the Finance CFO routine: MRR, what a finished video costs
 * us, and realised gross margin, computed from data we already store. No
 * vendor, no new tables.
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`, so every number is reproducible.
 *
 * Definitions:
 * - **MRR:** the monthly list price of every live subscription on a plan we
 *   sell (`isLiveSubscription`), gross of VAT and Stripe fees, in EUR. **Net
 *   MRR** is the same after VAT + Stripe fees, in USD (the unit our costs are in),
 *   using the margin gate's `netRevenueUsd`.
 * - **Window:** jobs created in the trailing 30 days. Failed jobs count toward
 *   cost (we paid the providers) but not toward "finished videos".
 * - **Cost per finished video:** window API cost of all jobs ÷ finished jobs.
 *   Failures are therefore part of the price of a video, as they are in life.
 * - **Realised margin:** (net MRR − window API cost) ÷ net MRR. It ignores
 *   top-up revenue (listed separately) and credits still unspent, so read it
 *   as a monthly run-rate, not an audit.
 * - **Burn ratio:** window API cost ÷ net MRR. The share of every net euro of
 *   recurring revenue that goes to providers; the margin gate's 3x floor is 33%.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { netRevenueUsd, REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;
export const WINDOW_DAYS = 30;

export interface FinanceSubscription extends SubscriptionSnapshot {
  userId: string;
}

export interface FinanceJob {
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  chargedCredits: number;
}

/** A `topup` ledger row; revenue is looked up from the pack with the same credits. */
export interface FinanceTopUp {
  credits: number;
  createdAt: Date;
}

export interface FinanceInput {
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  topUps: readonly FinanceTopUp[];
  now: Date;
}

export interface TierCost {
  tier: string;
  jobs: number;
  finished: number;
  apiCostUsd: number;
  /** Average API cost of a finished video of this tier (failures included), or null. */
  costPerFinishedUsd: number | null;
  chargedCredits: number;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  subscribersByPlan: Record<string, number>;
  payingSubscribers: number;
  mrrEur: number;
  netMrrUsd: number;
  /** Gross MRR ÷ paying subscribers, in EUR, or null with none. */
  arpuEur: number | null;
  topUpRevenueEur: number;
  topUpsInWindow: number;
  jobsInWindow: number;
  finishedInWindow: number;
  failedInWindow: number;
  apiCostUsd: number;
  costPerFinishedUsd: number | null;
  /** API cost ÷ net MRR, or null when there is no MRR yet. */
  burnRatio: number | null;
  /** (net MRR − API cost) ÷ net MRR, or null when there is no MRR yet. */
  realisedMargin: number | null;
  /** API cost per 1,000 credits charged: what a credit really costs us. */
  costPer1kCreditsUsd: number | null;
  byTier: TierCost[];
}

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;
const ratio = (n: number, d: number): number | null => (d > 0 ? round(n / d) : null);

export function computeFinance(input: FinanceInput): FinanceReport {
  const since = input.now.getTime() - WINDOW_DAYS * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= since && d.getTime() <= input.now.getTime();

  const subscribersByPlan: Record<string, number> = {};
  let mrrCents = 0;
  let netMrrUsd = 0;
  let paying = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const plan = PLANS[s.planId as keyof typeof PLANS];
    if (!plan) continue;
    paying += 1;
    subscribersByPlan[plan.id] = (subscribersByPlan[plan.id] ?? 0) + 1;
    mrrCents += plan.priceCents;
    netMrrUsd += netRevenueUsd(plan.priceCents, REVENUE_ASSUMPTIONS);
  }

  const topUps = input.topUps.filter((t) => inWindow(t.createdAt));
  const topUpCents = topUps.reduce(
    (sum, t) => sum + (TOPUP_PACKS.find((p) => p.credits === t.credits)?.priceCents ?? 0),
    0,
  );

  const jobs = input.jobs.filter((j) => inWindow(j.createdAt));
  const tiers = new Map<string, TierCost>();
  let apiCost = 0;
  let charged = 0;
  let finished = 0;
  let failed = 0;
  for (const j of jobs) {
    const t = tiers.get(j.modelTier) ?? {
      tier: j.modelTier,
      jobs: 0,
      finished: 0,
      apiCostUsd: 0,
      costPerFinishedUsd: null,
      chargedCredits: 0,
    };
    t.jobs += 1;
    t.apiCostUsd += j.apiCostUsd;
    t.chargedCredits += j.chargedCredits;
    if (j.status === 'done') t.finished += 1;
    tiers.set(j.modelTier, t);
    apiCost += j.apiCostUsd;
    charged += j.chargedCredits;
    if (j.status === 'done') finished += 1;
    if (j.status === 'failed') failed += 1;
  }

  return {
    asOf: input.now.toISOString(),
    windowDays: WINDOW_DAYS,
    subscribersByPlan,
    payingSubscribers: paying,
    mrrEur: mrrCents / 100,
    netMrrUsd: round(netMrrUsd, 2),
    arpuEur: paying > 0 ? round(mrrCents / 100 / paying, 2) : null,
    topUpRevenueEur: topUpCents / 100,
    topUpsInWindow: topUps.length,
    jobsInWindow: jobs.length,
    finishedInWindow: finished,
    failedInWindow: failed,
    apiCostUsd: round(apiCost, 2),
    costPerFinishedUsd: ratio(apiCost, finished),
    burnRatio: ratio(apiCost, netMrrUsd),
    realisedMargin: netMrrUsd > 0 ? round((netMrrUsd - apiCost) / netMrrUsd) : null,
    costPer1kCreditsUsd: charged > 0 ? round((apiCost / charged) * 1000) : null,
    byTier: [...tiers.values()]
      .map((t) => ({
        ...t,
        apiCostUsd: round(t.apiCostUsd, 2),
        costPerFinishedUsd: ratio(t.apiCostUsd, t.finished),
      }))
      .sort((a, b) => a.tier.localeCompare(b.tier)),
  };
}
