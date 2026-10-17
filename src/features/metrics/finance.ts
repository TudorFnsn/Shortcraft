/**
 * Unit-economics metrics for the Finance CFO routine (FinancePlan.md): MRR,
 * measured API cost per video, gross margin and what free users cost us. Pure:
 * the caller loads rows (Supabase in `scripts/finance-report.mts`, fixtures in
 * tests) and passes `now`.
 *
 * Definitions:
 * - **MRR:** sum of list prices of live subscriptions (gross, EUR, VAT incl.).
 *   Annual or discounted subscriptions aren't distinguished; this is an upper
 *   bound until Stripe is read directly.
 * - **Net MRR / top-up revenue:** after VAT + Stripe fees (`netRevenueUsd`).
 *   Top-ups are matched to a pack by credits granted.
 * - **API cost:** `render_jobs.api_cost_usd`, which the orchestrator meters per
 *   step. Failed jobs are counted separately: the money was spent, the user was
 *   refunded.
 * - **Gross margin (30d):** (net MRR + net top-ups - API cost) / (net MRR +
 *   net top-ups). Net MRR is a monthly figure, so the window is the last 30d.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { netRevenueUsd } from '@/features/billing/margin';
import { DAY_MS } from './north-star';

export interface FinanceJob {
  userId: string;
  status: string;
  createdAt: Date;
  apiCostUsd: number;
  actualCredits: number;
  targetDurationSec: number;
  modelTier: string;
}

export interface FinanceSubscription {
  userId: string;
  planId: string;
  status: string;
}

export interface FinanceTopUp {
  userId: string;
  createdAt: Date;
  credits: number;
}

export interface FinanceInput {
  now: Date;
  jobs: FinanceJob[];
  subscriptions: FinanceSubscription[];
  topUps: FinanceTopUp[];
  /** Users that have ever paid (subscription row or top-up). */
  payerIds: ReadonlySet<string>;
}

export interface CostBucket {
  videos: number;
  apiCostUsd: number;
  avgCostUsd: number;
  credits: number;
  /** USD of API cost per 1,000 credits burned. */
  costPer1kCredits: number;
}

export interface FinanceReport {
  asOf: string;
  mrrEur: number;
  netMrrUsd: number;
  liveSubscribers: Record<string, number>;
  topUps30d: { count: number; netRevenueUsd: number };
  apiCost30d: {
    done: number;
    failedWasted: number;
    /** Cost of jobs by users who have never paid. */
    unpaidUsers: number;
  };
  byTier: Record<string, CostBucket>;
  grossMargin30d: number | null;
  revenueToCost30d: number | null;
  /** API cost per live subscriber over 30d (subscribers' jobs only). */
  costPerSubscriber30d: number | null;
}

const bucket = (jobs: FinanceJob[]): CostBucket => {
  const apiCostUsd = jobs.reduce((s, j) => s + j.apiCostUsd, 0);
  const credits = jobs.reduce((s, j) => s + j.actualCredits, 0);
  return {
    videos: jobs.length,
    apiCostUsd,
    avgCostUsd: jobs.length ? apiCostUsd / jobs.length : 0,
    credits,
    costPer1kCredits: credits ? (apiCostUsd / credits) * 1000 : 0,
  };
};

export function computeFinance(input: FinanceInput): FinanceReport {
  const since = input.now.getTime() - 30 * DAY_MS;
  const recent = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const done = recent.filter((j) => j.status === 'done');
  const failed = recent.filter((j) => j.status === 'failed');

  const live = input.subscriptions.flatMap((s) =>
    isLiveSubscription(s) ? [{ userId: s.userId, planId: s.planId }] : [],
  );
  const liveSubscribers: Record<string, number> = {};
  let mrrCents = 0;
  let netMrrUsd = 0;
  for (const s of live) {
    liveSubscribers[s.planId] = (liveSubscribers[s.planId] ?? 0) + 1;
    mrrCents += PLANS[s.planId].priceCents;
    netMrrUsd += netRevenueUsd(PLANS[s.planId].priceCents);
  }

  const topUps = input.topUps.filter((t) => t.createdAt.getTime() >= since);
  const topUpNet = topUps.reduce((sum, t) => {
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    return sum + (pack ? netRevenueUsd(pack.priceCents) : 0);
  }, 0);

  const tiers = [...new Set(done.map((j) => j.modelTier))];
  const byTier = Object.fromEntries(
    tiers.map((t) => [t, bucket(done.filter((j) => j.modelTier === t))]),
  );

  const sum = (js: FinanceJob[]) => js.reduce((s, j) => s + j.apiCostUsd, 0);
  const doneCost = sum(done);
  const failedCost = sum(failed);
  const totalCost = doneCost + failedCost;
  const revenue = netMrrUsd + topUpNet;
  const liveIds = new Set(live.map((s) => s.userId));
  const subscriberCost = sum(recent.filter((j) => liveIds.has(j.userId)));

  return {
    asOf: input.now.toISOString(),
    mrrEur: mrrCents / 100,
    netMrrUsd,
    liveSubscribers,
    topUps30d: { count: topUps.length, netRevenueUsd: topUpNet },
    apiCost30d: {
      done: doneCost,
      failedWasted: failedCost,
      unpaidUsers: sum(recent.filter((j) => !input.payerIds.has(j.userId))),
    },
    byTier,
    grossMargin30d: revenue > 0 ? (revenue - totalCost) / revenue : null,
    revenueToCost30d: totalCost > 0 ? revenue / totalCost : null,
    costPerSubscriber30d: live.length ? subscriberCost / live.length : null,
  };
}
