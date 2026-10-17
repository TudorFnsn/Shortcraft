/**
 * Realized unit economics from the database: MRR from active subscriptions,
 * what finished videos actually cost us (`render_jobs.api_cost_usd`) against the
 * credits they burned, and the implied cost per credit. Pure: the report script
 * does the reads. Plan prices are EUR cents (VAT inclusive), so MRR is shown
 * net of VAT in EUR, before Stripe fees.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

export interface SubRow {
  planId: string;
  status: string;
}

export interface JobCostRow {
  status: string;
  modelTier: string;
  targetDurationSec: number;
  actualCredits: number;
  apiCostUsd: number;
}

export interface TierEconomics {
  videos: number;
  apiCostUsd: number;
  credits: number;
  avgCostUsd: number;
  avgDurationSec: number;
  /** USD of API cost per 1,000 credits burned. Compare with the plan's price per 1,000 credits. */
  costPer1kCredits: number;
}

export interface UnitEconomics {
  activeSubscribers: number;
  mrrNetEur: number;
  byPlan: Record<string, number>;
  tiers: Record<string, TierEconomics>;
  /** Net revenue per 1,000 credits at each plan's price (USD), for comparison with `costPer1kCredits`. */
  netUsdPer1kCredits: Record<PlanId, number>;
  failedJobs: number;
  /** Cost of failed jobs (spend with no revenue behind it). */
  failedCostUsd: number;
}

const ACTIVE = new Set(['active', 'trialing']);

export function computeUnitEconomics(
  subs: readonly SubRow[],
  jobs: readonly JobCostRow[],
): UnitEconomics {
  const { vatRate, usdPerEur } = REVENUE_ASSUMPTIONS;
  const byPlan: Record<string, number> = {};
  let mrrGross = 0;
  let active = 0;
  for (const s of subs) {
    const plan = PLANS[s.planId as PlanId];
    if (!ACTIVE.has(s.status) || !plan) continue;
    active++;
    byPlan[s.planId] = (byPlan[s.planId] ?? 0) + 1;
    mrrGross += plan.priceCents / 100;
  }

  const acc: Record<string, { n: number; cost: number; credits: number; sec: number }> = {};
  let failedJobs = 0;
  let failedCostUsd = 0;
  for (const j of jobs) {
    if (j.status === 'failed') {
      failedJobs++;
      failedCostUsd += j.apiCostUsd;
      continue;
    }
    if (j.status !== 'done') continue;
    const t = (acc[j.modelTier] ??= { n: 0, cost: 0, credits: 0, sec: 0 });
    t.n++;
    t.cost += j.apiCostUsd;
    t.credits += j.actualCredits;
    t.sec += j.targetDurationSec;
  }
  const tiers: Record<string, TierEconomics> = {};
  for (const [tier, t] of Object.entries(acc)) {
    tiers[tier] = {
      videos: t.n,
      apiCostUsd: t.cost,
      credits: t.credits,
      avgCostUsd: t.cost / t.n,
      avgDurationSec: t.sec / t.n,
      costPer1kCredits: t.credits > 0 ? (t.cost / t.credits) * 1000 : 0,
    };
  }

  const netUsdPer1kCredits = Object.fromEntries(
    Object.values(PLANS).map((p) => [
      p.id,
      ((p.priceCents / 100 / (1 + vatRate)) * usdPerEur) / (p.monthlyCredits / 1000),
    ]),
  ) as Record<PlanId, number>;

  return {
    activeSubscribers: active,
    mrrNetEur: mrrGross / (1 + vatRate),
    byPlan,
    tiers,
    netUsdPer1kCredits,
    failedJobs,
    failedCostUsd,
  };
}
