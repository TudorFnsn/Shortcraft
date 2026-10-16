/**
 * Unit economics — what the app earns and what it spends, from data we already
 * store. Pure: `scripts/finance-report.mts` reads Supabase and feeds this.
 *
 * Revenue side: MRR = live subscribers × plan price, shown gross (what the
 * customer pays) and net (after VAT + Stripe fees, via the margin gate's
 * assumptions). One-off top-ups are cash but not recurring, so they are not in
 * MRR; the Stripe connector is the source for cash collected.
 *
 * Cost side: `render_jobs.api_cost_usd` (usage × catalog list prices, NOT
 * provider invoices) for jobs started in the window. Failed jobs still spent
 * money on the steps that ran before the failure, so their cost is waste.
 *
 * Not covered here (no data in the DB, read from vendor dashboards): fixed
 * costs (Vercel, Supabase, ElevenLabs plan, Resend, domain) and per-provider
 * or per-token splits. See FinancePlan.md §4.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import {
  netRevenueUsd,
  REVENUE_ASSUMPTIONS,
  type RevenueAssumptions,
} from '@/features/billing/margin';

export const DAY_MS = 86_400_000;

export interface FinanceJob {
  status: string;
  createdAt: Date;
  modelTier: string;
  apiCostUsd: number;
  /** Credits actually charged to the customer (settled). */
  actualCredits: number;
}

export interface FinanceSubscription {
  userId: string;
  planId: string;
  status: string;
}

export interface FixedCost {
  name: string;
  /** Monthly cost in USD. */
  monthlyUsd: number;
}

export interface FinanceInput {
  now: Date;
  /** Window for variable costs, in days. */
  windowDays: number;
  jobs: readonly FinanceJob[];
  subscriptions: readonly FinanceSubscription[];
  /** Fixed monthly costs, from the owner (see FinancePlan.md §4). */
  fixedCosts?: readonly FixedCost[];
  assumptions?: RevenueAssumptions;
}

export interface TierCost {
  tier: string;
  finished: number;
  failed: number;
  costUsd: number;
  /** Mean cost of a finished video; null with none. */
  costPerFinishedUsd: number | null;
  /** Cost of failed jobs in this tier (spent, nothing delivered). */
  wastedUsd: number;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  subscribersByPlan: Record<PlanId, number>;
  mrrGrossEur: number;
  mrrNetUsd: number;
  variableCostUsd: number;
  wastedCostUsd: number;
  fixedCostUsd: number;
  /** Variable cost scaled to a 30-day month, so it compares with MRR. */
  variableCostMonthlyUsd: number;
  /** Net MRR − monthly variable − fixed. Negative = burning cash. */
  monthlyProfitUsd: number;
  /** Net MRR ÷ (monthly variable + fixed); null when there is no cost. */
  coverage: number | null;
  /** Variable cost ÷ net MRR; null when MRR is 0. */
  costToMrr: number | null;
  tiers: TierCost[];
  creditsBurned: number;
  /** Customer credits per USD of API cost across finished jobs; null with none. */
  creditsPerUsd: number | null;
}

const round = (n: number, dp = 4) => Number(n.toFixed(dp));

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const since = input.now.getTime() - input.windowDays * DAY_MS;

  const byPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  // One live subscription per user counts, so a duplicate row can't inflate MRR.
  const seen = new Set<string>();
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s) || seen.has(s.userId)) continue;
    seen.add(s.userId);
    byPlan[s.planId] += 1;
  }

  let mrrGross = 0;
  let mrrNet = 0;
  for (const id of Object.keys(byPlan) as PlanId[]) {
    mrrGross += (byPlan[id] * PLANS[id].priceCents) / 100;
    mrrNet += byPlan[id] * netRevenueUsd(PLANS[id].priceCents, a);
  }

  const tierMap = new Map<string, TierCost>();
  let variable = 0;
  let wasted = 0;
  let burned = 0;
  let finishedCost = 0;
  let finishedCredits = 0;
  for (const j of input.jobs) {
    if (j.createdAt.getTime() < since) continue;
    const t = tierMap.get(j.modelTier) ?? {
      tier: j.modelTier,
      finished: 0,
      failed: 0,
      costUsd: 0,
      costPerFinishedUsd: null,
      wastedUsd: 0,
    };
    t.costUsd += j.apiCostUsd;
    variable += j.apiCostUsd;
    if (j.status === 'done') {
      t.finished += 1;
      burned += j.actualCredits;
      finishedCost += j.apiCostUsd;
      finishedCredits += j.actualCredits;
    } else if (j.status === 'failed') {
      t.failed += 1;
      t.wastedUsd += j.apiCostUsd;
      wasted += j.apiCostUsd;
    }
    tierMap.set(j.modelTier, t);
  }
  const tiers = [...tierMap.values()]
    .map((t) => ({
      ...t,
      costUsd: round(t.costUsd),
      wastedUsd: round(t.wastedUsd),
      costPerFinishedUsd: t.finished > 0 ? round(t.costUsd / t.finished) : null,
    }))
    .sort((x, y) => y.costUsd - x.costUsd);

  const fixed = (input.fixedCosts ?? []).reduce((s, c) => s + c.monthlyUsd, 0);
  const variableMonthly = (variable / input.windowDays) * 30;
  const totalCost = variableMonthly + fixed;

  return {
    asOf: input.now.toISOString(),
    windowDays: input.windowDays,
    payingSubscribers: seen.size,
    subscribersByPlan: byPlan,
    mrrGrossEur: round(mrrGross, 2),
    mrrNetUsd: round(mrrNet, 2),
    variableCostUsd: round(variable),
    wastedCostUsd: round(wasted),
    fixedCostUsd: round(fixed, 2),
    variableCostMonthlyUsd: round(variableMonthly, 2),
    monthlyProfitUsd: round(mrrNet - totalCost, 2),
    coverage: totalCost > 0 ? round(mrrNet / totalCost, 2) : null,
    costToMrr: mrrNet > 0 ? round(variableMonthly / mrrNet, 3) : null,
    tiers,
    creditsBurned: burned,
    creditsPerUsd: finishedCost > 0 ? Math.round(finishedCredits / finishedCost) : null,
  };
}
