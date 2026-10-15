/**
 * Finance report math: MRR from live subscriptions and what finished videos cost
 * us versus the credits they burned. Pure; `scripts/finance-report.mts` feeds it.
 *
 * `apiCostUsd` is real usage x the catalog's list prices (not a provider invoice),
 * so compare it to the invoices in `FinancePlan.md` before trusting the margin.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';

export interface FinanceSubscription {
  planId: string;
  status: string;
}

export interface FinanceJob {
  status: string;
  modelTier: string;
  createdAt: Date;
  actualCredits: number;
  apiCostUsd: number;
}

export interface TierEconomics {
  tier: string;
  videos: number;
  apiCostUsd: number;
  credits: number;
  avgCostUsd: number | null;
  /** Our API cost per 1,000 credits burned. */
  costPer1kCredits: number | null;
}

export interface FinanceReport {
  asOf: string;
  /** Monthly recurring revenue in EUR (gross, before VAT and Stripe fees). */
  mrrEur: number;
  payingSubscribers: number;
  byPlan: Array<{ planId: string; subscribers: number; mrrEur: number }>;
  /** Cost of finished videos created in the last 30 days. */
  last30d: { videos: number; apiCostUsd: number; failedVideos: number; failedShare: number | null };
  tiers: TierEconomics[];
}

const DAY_MS = 86_400_000;

export function computeFinance(input: {
  now: Date;
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
}): FinanceReport {
  const live = input.subscriptions.filter((s) => isLiveSubscription(s));
  const plans = new Map<string, { subscribers: number; mrrEur: number }>();
  for (const s of live) {
    const price = (PLANS[s.planId as PlanId]?.priceCents ?? 0) / 100;
    const row = plans.get(s.planId) ?? { subscribers: 0, mrrEur: 0 };
    row.subscribers += 1;
    row.mrrEur += price;
    plans.set(s.planId, row);
  }

  const since = input.now.getTime() - 30 * DAY_MS;
  const recent = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const failed = recent.filter((j) => j.status === 'failed');
  const done = input.jobs.filter((j) => j.status === 'done');
  const tiers = new Map<string, { videos: number; cost: number; credits: number }>();
  for (const j of done) {
    const t = tiers.get(j.modelTier) ?? { videos: 0, cost: 0, credits: 0 };
    t.videos += 1;
    t.cost += j.apiCostUsd;
    t.credits += j.actualCredits;
    tiers.set(j.modelTier, t);
  }

  const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
  return {
    asOf: input.now.toISOString(),
    mrrEur: round([...plans.values()].reduce((a, p) => a + p.mrrEur, 0)),
    payingSubscribers: live.length,
    byPlan: [...plans].map(([planId, p]) => ({ planId, ...p })),
    last30d: {
      videos: recent.filter((j) => j.status === 'done').length,
      // Failed jobs still cost money (a script, maybe images) even though credits are refunded.
      apiCostUsd: round(
        recent
          .filter((j) => j.status === 'done' || j.status === 'failed')
          .reduce((a, j) => a + j.apiCostUsd, 0),
        4,
      ),
      failedVideos: failed.length,
      failedShare: recent.length ? round(failed.length / recent.length, 3) : null,
    },
    tiers: [...tiers].map(([tier, t]) => ({
      tier,
      videos: t.videos,
      apiCostUsd: round(t.cost, 4),
      credits: t.credits,
      avgCostUsd: t.videos ? round(t.cost / t.videos, 4) : null,
      costPer1kCredits: t.credits ? round((t.cost / t.credits) * 1000, 4) : null,
    })),
  };
}
