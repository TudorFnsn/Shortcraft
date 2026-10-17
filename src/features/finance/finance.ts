/**
 * Finance report math: MRR, cash in vs. cost out, and cost per video.
 *
 * Pure: takes plain rows (read by `scripts/finance-report.mts`) and the plan
 * catalog, returns numbers. Revenue is derived from what we store (live
 * subscriptions x plan price, paid top-up grants x pack credits), not from
 * Stripe, so it is an estimate until the Stripe connector is authorized.
 * `api_cost_usd` is real usage x catalog list prices, not provider invoices.
 */
import { PLANS, TOPUP_PACKS, type PlanId } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { isLiveSubscription } from '@/features/billing/entitlements';

export interface FinanceInput {
  now: Date;
  subscriptions: { planId: string; status: string }[];
  /** Paid top-up grants in the window, by credits granted. */
  topups: { credits: number; createdAt: Date }[];
  jobs: {
    status: string;
    modelTier: string;
    targetDurationSec: number;
    apiCostUsd: number;
    actualCredits: number;
    createdAt: Date;
  }[];
  /** Monthly fixed costs in USD the owner keeps in the plan (hosting, DB, ...). */
  fixedCostsUsdPerMonth: number;
  windowDays: number;
}

export interface TierCost {
  videos: number;
  apiCostUsd: number;
  avgCostUsd: number | null;
  credits: number;
  /** Credits charged per API dollar spent; null when nothing was spent. */
  creditsPerUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  mrrEur: number;
  /** MRR after VAT + Stripe fees, USD. */
  netMrrUsd: number;
  payingSubscribers: number;
  subscribersByPlan: Record<PlanId, number>;
  arpuEur: number | null;
  topupRevenueEur: number;
  apiCostUsd: number;
  failedJobCostUsd: number;
  byTier: Record<string, TierCost>;
  fixedCostsUsd: number;
  /** Net recurring revenue minus variable and fixed cost, scaled to a month. */
  monthlyProfitUsd: number;
  /** Net revenue ÷ (api + fixed) for the window, null with no spend. */
  revenueToCost: number | null;
}

const DAY_MS = 86_400_000;
const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeFinance(input: FinanceInput): FinanceReport {
  const subscribersByPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  let mrrCents = 0;
  let netMrrUsd = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    subscribersByPlan[s.planId] += 1;
    mrrCents += PLANS[s.planId].priceCents;
    netMrrUsd += netRevenueUsd(PLANS[s.planId].priceCents);
  }
  const payingSubscribers = Object.values(subscribersByPlan).reduce((a, b) => a + b, 0);

  const since = input.now.getTime() - input.windowDays * DAY_MS;
  // Per purchase: Stripe's fixed fee applies to each top-up, so net each one.
  const packCents = (credits: number) => TOPUP_PACKS.find((p) => p.credits === credits)?.priceCents;
  let topupCents = 0;
  let topupNetUsd = 0;
  for (const t of input.topups) {
    const cents = packCents(t.credits);
    if (t.createdAt.getTime() < since || cents === undefined) continue;
    topupCents += cents;
    topupNetUsd += netRevenueUsd(cents);
  }

  const windowJobs = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const byTier: Record<string, TierCost> = {};
  let apiCostUsd = 0;
  let failedJobCostUsd = 0;
  for (const j of windowJobs) {
    apiCostUsd += j.apiCostUsd;
    if (j.status === 'failed') failedJobCostUsd += j.apiCostUsd;
    if (j.status !== 'done') continue;
    const t = (byTier[j.modelTier] ??= {
      videos: 0,
      apiCostUsd: 0,
      avgCostUsd: null,
      credits: 0,
      creditsPerUsd: null,
    });
    t.videos += 1;
    t.apiCostUsd += j.apiCostUsd;
    t.credits += j.actualCredits;
  }
  for (const t of Object.values(byTier)) {
    t.avgCostUsd = t.videos ? round(t.apiCostUsd / t.videos, 4) : null;
    t.creditsPerUsd = t.apiCostUsd > 0 ? Math.round(t.credits / t.apiCostUsd) : null;
    t.apiCostUsd = round(t.apiCostUsd, 4);
  }

  const monthScale = 30 / input.windowDays;
  const windowNet = netMrrUsd * (input.windowDays / 30) + topupNetUsd;
  const spend = apiCostUsd + input.fixedCostsUsdPerMonth * (input.windowDays / 30);

  return {
    asOf: input.now.toISOString(),
    windowDays: input.windowDays,
    mrrEur: round(mrrCents / 100),
    netMrrUsd: round(netMrrUsd),
    payingSubscribers,
    subscribersByPlan,
    arpuEur: payingSubscribers ? round(mrrCents / 100 / payingSubscribers) : null,
    topupRevenueEur: round(topupCents / 100),
    apiCostUsd: round(apiCostUsd, 4),
    failedJobCostUsd: round(failedJobCostUsd, 4),
    byTier,
    fixedCostsUsd: round(input.fixedCostsUsdPerMonth),
    monthlyProfitUsd: round(
      netMrrUsd + topupNetUsd * monthScale - apiCostUsd * monthScale - input.fixedCostsUsdPerMonth,
    ),
    revenueToCost: spend > 0 ? round(windowNet / spend) : null,
  };
}
