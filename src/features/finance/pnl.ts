/**
 * Finance snapshot for the Finance CEO routine: MRR, net MRR, ARPU, API cost
 * per finished video, gross margin and a monthly P&L, from data we already
 * store plus the owner-maintained fixed costs in `config/costs.ts`.
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`.
 *
 * Caveat the report prints every time: `render_jobs.api_cost_usd` is the
 * catalog price (`models.ts costUsdPerUnit`) metered per step, NOT the
 * provider's invoice. Compare it with the real fal.ai / ElevenLabs /
 * Anthropic bills before trusting the margin.
 */
import { PLANS } from '@/config/plans';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { netRevenueUsd, REVENUE_ASSUMPTIONS } from '@/features/billing/margin';
import { DAY_MS } from '@/features/metrics/north-star';

export interface FinanceJob {
  status: string;
  modelTier: string;
  apiCostUsd: number;
  createdAt: Date;
}

export interface FinanceTopUp {
  priceCents: number;
  createdAt: Date;
}

/** Fixed monthly cost line, EUR cents. `null` = the owner has not filled it in. */
export interface FixedCost {
  id: string;
  label: string;
  monthlyCents: number | null;
}

export interface FinanceInput {
  now: Date;
  subscriptions: SubscriptionSnapshot[];
  jobs: FinanceJob[];
  topUps: FinanceTopUp[];
  fixedCosts: readonly FixedCost[];
}

export interface TierCost {
  tier: string;
  videos: number;
  avgCostUsd: number | null;
  totalCostUsd: number;
}

export interface FinanceReport {
  asOf: string;
  payingSubscribers: number;
  /** Gross, VAT-inclusive, EUR. */
  mrrGrossEur: number;
  /** After VAT + Stripe fees, USD. */
  mrrNetUsd: number;
  arpuNetUsd: number | null;
  /** Last 30 days. */
  videosDone30d: number;
  apiCostUsd30d: number;
  avgCostPerVideoUsd: number | null;
  costByTier: TierCost[];
  topUpNetUsd30d: number;
  /** Net MRR + top-ups − API cost (30d) − fixed costs, USD. */
  fixedCostsUsd: number;
  unfilledFixedCosts: string[];
  grossProfitUsd: number;
  netProfitUsd: number;
  /** grossProfit / (mrr + topups); null with no revenue. */
  grossMargin: number | null;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

export function computeFinance(input: FinanceInput): FinanceReport {
  const since = input.now.getTime() - 30 * DAY_MS;

  const live = input.subscriptions.filter(isLiveSubscription);
  const mrrGrossCents = live.reduce((s, sub) => s + PLANS[sub.planId].priceCents, 0);
  const mrrNetUsd = live.reduce((s, sub) => s + netRevenueUsd(PLANS[sub.planId].priceCents), 0);

  const done = input.jobs.filter((j) => j.status === 'done' && j.createdAt.getTime() >= since);
  // Failed jobs still burn provider spend (the credits are refunded), so cost counts them all.
  const costJobs = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const apiCostUsd30d = costJobs.reduce((s, j) => s + j.apiCostUsd, 0);

  const tiers = new Map<string, { videos: number; cost: number }>();
  for (const j of costJobs) {
    const t = tiers.get(j.modelTier) ?? { videos: 0, cost: 0 };
    if (j.status === 'done') t.videos += 1;
    t.cost += j.apiCostUsd;
    tiers.set(j.modelTier, t);
  }

  const topUpNetUsd30d = input.topUps
    .filter((t) => t.createdAt.getTime() >= since)
    .reduce((s, t) => s + netRevenueUsd(t.priceCents), 0);

  const fixedCostsUsd = input.fixedCosts.reduce(
    (s, c) => s + ((c.monthlyCents ?? 0) / 100) * REVENUE_ASSUMPTIONS.usdPerEur,
    0,
  );
  const revenue = mrrNetUsd + topUpNetUsd30d;
  const grossProfitUsd = revenue - apiCostUsd30d;

  return {
    asOf: input.now.toISOString(),
    payingSubscribers: live.length,
    mrrGrossEur: round2(mrrGrossCents / 100),
    mrrNetUsd: round2(mrrNetUsd),
    arpuNetUsd: live.length ? round2(mrrNetUsd / live.length) : null,
    videosDone30d: done.length,
    apiCostUsd30d: round2(apiCostUsd30d),
    avgCostPerVideoUsd: done.length ? round2(apiCostUsd30d / done.length) : null,
    costByTier: [...tiers.entries()]
      .map(([tier, t]) => ({
        tier,
        videos: t.videos,
        avgCostUsd: t.videos ? round2(t.cost / t.videos) : null,
        totalCostUsd: round2(t.cost),
      }))
      .sort((a, b) => b.totalCostUsd - a.totalCostUsd),
    topUpNetUsd30d: round2(topUpNetUsd30d),
    fixedCostsUsd: round2(fixedCostsUsd),
    unfilledFixedCosts: input.fixedCosts.filter((c) => c.monthlyCents === null).map((c) => c.id),
    grossProfitUsd: round2(grossProfitUsd),
    netProfitUsd: round2(grossProfitUsd - fixedCostsUsd),
    grossMargin: revenue > 0 ? Math.round((grossProfitUsd / revenue) * 1000) / 1000 : null,
  };
}
