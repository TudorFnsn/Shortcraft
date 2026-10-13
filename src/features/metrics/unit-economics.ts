/**
 * Unit economics: MRR, 30-day revenue vs API spend, cost per finished video.
 * Pure — `scripts/finance-report.mts` feeds it rows read from Supabase.
 *
 * MRR is list price of live subscriptions (monthly billing assumed; yearly
 * prices don't exist yet). Revenue is net of VAT + Stripe fees using the same
 * assumptions as the margin gate. Top-up revenue is matched to a pack by the
 * credits granted. Fixed costs (hosting, tools) are passed in by the caller.
 */
import { PLANS, TOPUP_PACKS, type PlanId } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { isLiveSubscription } from '@/features/billing/entitlements';

export const DAY_MS = 86_400_000;
const round = (n: number, dp = 4): number => Number(n.toFixed(dp));

export interface FinanceInput {
  now: Date;
  subscriptions: { planId: string; status: string }[];
  jobs: {
    status: string;
    modelTier: string;
    apiCostUsd: number;
    actualCredits: number;
    createdAt: Date;
  }[];
  /** `topup` ledger rows (delta = credits of the pack bought). */
  topUps: { credits: number; createdAt: Date }[];
  /** Monthly fixed costs in USD (hosting, tools). Unknown = 0 and flagged by the caller. */
  fixedCostsUsdPerMonth?: number;
}

export interface TierEconomics {
  finishedVideos: number;
  apiCostUsd: number;
  costPerVideoUsd: number | null;
}

export interface UnitEconomics {
  asOf: string;
  payingSubscribers: number;
  subscribersByPlan: Record<PlanId, number>;
  mrrEur: number;
  /** MRR after VAT + Stripe fees, USD. */
  mrrNetUsd: number;
  arpuEur: number | null;
  last30d: {
    topUpNetUsd: number;
    revenueNetUsd: number;
    apiCostUsd: number;
    /** Spend on jobs that never finished (failed or abandoned): pure waste. */
    wastedApiCostUsd: number;
    fixedCostsUsd: number;
    profitUsd: number;
    /** revenue ÷ (API + fixed). Null when nothing was spent. */
    coverage: number | null;
    finishedVideos: number;
    failedVideos: number;
    costPerFinishedVideoUsd: number | null;
    byTier: Record<string, TierEconomics>;
    /** API dollars per 1,000 credits actually spent. */
    apiUsdPer1kCredits: number | null;
  };
}

const PLAN_IDS = Object.keys(PLANS) as PlanId[];

export function computeUnitEconomics(input: FinanceInput): UnitEconomics {
  const since = input.now.getTime() - 30 * DAY_MS;

  const subscribersByPlan = Object.fromEntries(PLAN_IDS.map((id) => [id, 0])) as Record<
    PlanId,
    number
  >;
  let mrrCents = 0;
  let mrrNetUsd = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription({ planId: s.planId, status: s.status })) continue;
    const plan = PLANS[s.planId as PlanId];
    subscribersByPlan[plan.id] += 1;
    mrrCents += plan.priceCents;
    mrrNetUsd += netRevenueUsd(plan.priceCents);
  }
  const payingSubscribers = PLAN_IDS.reduce((n, id) => n + subscribersByPlan[id], 0);

  let topUpNetUsd = 0;
  for (const t of input.topUps) {
    if (t.createdAt.getTime() < since) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (pack) topUpNetUsd += netRevenueUsd(pack.priceCents);
  }

  const byTier: Record<string, TierEconomics> = {};
  let apiCost = 0;
  let wasted = 0;
  let finished = 0;
  let failed = 0;
  let credits = 0;
  for (const j of input.jobs) {
    if (j.createdAt.getTime() < since) continue;
    apiCost += j.apiCostUsd;
    credits += j.actualCredits;
    if (j.status === 'done') {
      finished += 1;
      const t = (byTier[j.modelTier] ??= {
        finishedVideos: 0,
        apiCostUsd: 0,
        costPerVideoUsd: null,
      });
      t.finishedVideos += 1;
      t.apiCostUsd += j.apiCostUsd;
    } else {
      wasted += j.apiCostUsd;
      if (j.status === 'failed') failed += 1;
    }
  }
  for (const t of Object.values(byTier)) {
    t.costPerVideoUsd = round(t.apiCostUsd / t.finishedVideos);
    t.apiCostUsd = round(t.apiCostUsd);
  }

  const fixed = input.fixedCostsUsdPerMonth ?? 0;
  const revenue = mrrNetUsd + topUpNetUsd;
  const spend = apiCost + fixed;

  return {
    asOf: input.now.toISOString(),
    payingSubscribers,
    subscribersByPlan,
    mrrEur: round(mrrCents / 100, 2),
    mrrNetUsd: round(mrrNetUsd, 2),
    arpuEur: payingSubscribers ? round(mrrCents / 100 / payingSubscribers, 2) : null,
    last30d: {
      topUpNetUsd: round(topUpNetUsd, 2),
      revenueNetUsd: round(revenue, 2),
      apiCostUsd: round(apiCost),
      wastedApiCostUsd: round(wasted),
      fixedCostsUsd: round(fixed, 2),
      profitUsd: round(revenue - spend, 2),
      coverage: spend > 0 ? round(revenue / spend, 2) : null,
      finishedVideos: finished,
      failedVideos: failed,
      costPerFinishedVideoUsd: finished ? round(apiCost / finished) : null,
      byTier,
      apiUsdPer1kCredits: credits > 0 ? round((apiCost / credits) * 1000) : null,
    },
  };
}
