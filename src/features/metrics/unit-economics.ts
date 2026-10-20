/**
 * Unit economics: MRR against what the providers actually billed us, from rows
 * we already store (`subscriptions`, `credit_transactions`, `render_jobs`). The
 * Finance CEO routine (FinancePlan.md) reads this every run.
 *
 * Pure: the caller loads rows and passes `now`, so every number is reproducible.
 *
 * Definitions:
 * - **MRR (gross, EUR):** sum of the list price of every live subscription on a
 *   plan we sell. Yearly billing isn't stored, so a yearly plan counts at the
 *   monthly price (an over-count until `billing_interval` exists).
 * - **Net MRR (USD):** the same after VAT and Stripe fees (`netRevenueUsd`).
 * - **Top-up revenue:** top-up ledger rows in the window, priced by the pack
 *   whose credit count matches (rows that match no pack are counted, unpriced).
 * - **API cost:** `render_jobs.api_cost_usd`, which the orchestrator meters per
 *   step (failed jobs keep what they spent). Voice-design and preview spend is
 *   not on a job row, so it is missing here.
 * - **Cost per credit:** window API cost ÷ credits actually charged
 *   (`actual_credits` of finished jobs); compare with revenue per credit.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import {
  netRevenueUsd,
  REVENUE_ASSUMPTIONS,
  type RevenueAssumptions,
} from '@/features/billing/margin';

export const WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export interface EconSubscription {
  planId: string;
  status: string;
}

export interface EconTopUp {
  credits: number;
  createdAt: Date;
}

export interface EconJob {
  status: string;
  modelTier: string;
  actualCredits: number;
  apiCostUsd: number;
  createdAt: Date;
}

export interface FixedCostsUsd {
  /** Label → USD per month (hosting, ElevenLabs plan, Resend, domain …). */
  [label: string]: number;
}

export interface EconInput {
  now: Date;
  subscriptions: EconSubscription[];
  topUps: EconTopUp[];
  jobs: EconJob[];
  fixedCostsUsdPerMonth?: FixedCostsUsd;
  assumptions?: RevenueAssumptions;
}

export interface TierEconomics {
  tier: string;
  jobs: number;
  finished: number;
  failed: number;
  apiCostUsd: number;
  creditsCharged: number;
  /** API dollars per finished video; null with no finished video. */
  costPerFinishedUsd: number | null;
  /** API dollars per 1,000 credits charged; null with no credits charged. */
  costPer1kCreditsUsd: number | null;
}

export interface UnitEconomics {
  asOf: string;
  windowDays: number;
  subscribersByPlan: Record<string, number>;
  mrrEur: number;
  netMrrUsd: number;
  topUpNetUsd: number;
  topUpsUnpriced: number;
  /** Net revenue recognised in the window: net MRR + top-ups. */
  netRevenueUsd: number;
  apiCostUsd: number;
  /** API cost of jobs that failed, as dollars and as a share of all API cost. */
  failedCostUsd: number;
  failedCostShare: number | null;
  fixedCostsUsd: number;
  profitUsd: number;
  /** netRevenue ÷ (apiCost + fixed); null with no cost. */
  coverage: number | null;
  /** Net revenue per credit granted-and-spent proxy: netRevenue ÷ credits charged. */
  revenuePer1kCreditsUsd: number | null;
  tiers: TierEconomics[];
}

const round = (n: number, dp = 4): number => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeUnitEconomics(input: EconInput): UnitEconomics {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const since = input.now.getTime() - WINDOW_DAYS * DAY_MS;
  const inWindow = <T extends { createdAt: Date }>(rows: T[]): T[] =>
    rows.filter(
      (r) => r.createdAt.getTime() >= since && r.createdAt.getTime() < input.now.getTime(),
    );

  const subscribersByPlan: Record<string, number> = {};
  let mrrCents = 0;
  let netMrr = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    subscribersByPlan[s.planId] = (subscribersByPlan[s.planId] ?? 0) + 1;
    const plan = PLANS[s.planId];
    mrrCents += plan.priceCents;
    netMrr += netRevenueUsd(plan.priceCents, a);
  }

  let topUpNet = 0;
  let unpriced = 0;
  for (const t of inWindow(input.topUps)) {
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (pack) topUpNet += netRevenueUsd(pack.priceCents, a);
    else unpriced += 1;
  }

  const jobs = inWindow(input.jobs);
  const byTier = new Map<string, TierEconomics>();
  let apiCost = 0;
  let failedCost = 0;
  let credits = 0;
  for (const j of jobs) {
    const t = byTier.get(j.modelTier) ?? {
      tier: j.modelTier,
      jobs: 0,
      finished: 0,
      failed: 0,
      apiCostUsd: 0,
      creditsCharged: 0,
      costPerFinishedUsd: null,
      costPer1kCreditsUsd: null,
    };
    t.jobs += 1;
    t.apiCostUsd += j.apiCostUsd;
    apiCost += j.apiCostUsd;
    if (j.status === 'done') {
      t.finished += 1;
      t.creditsCharged += j.actualCredits;
      credits += j.actualCredits;
    } else if (j.status === 'failed') {
      t.failed += 1;
      failedCost += j.apiCostUsd;
    }
    byTier.set(j.modelTier, t);
  }
  const tiers = [...byTier.values()]
    .map((t) => ({
      ...t,
      apiCostUsd: round(t.apiCostUsd),
      costPerFinishedUsd: t.finished > 0 ? round(t.apiCostUsd / t.finished) : null,
      costPer1kCreditsUsd:
        t.creditsCharged > 0 ? round((t.apiCostUsd / t.creditsCharged) * 1000) : null,
    }))
    .sort((x, y) => x.tier.localeCompare(y.tier));

  const fixed = Object.values(input.fixedCostsUsdPerMonth ?? {}).reduce((s, n) => s + n, 0);
  const revenue = netMrr + topUpNet;
  const totalCost = apiCost + fixed;

  return {
    asOf: input.now.toISOString(),
    windowDays: WINDOW_DAYS,
    subscribersByPlan,
    mrrEur: round(mrrCents / 100, 2),
    netMrrUsd: round(netMrr, 2),
    topUpNetUsd: round(topUpNet, 2),
    topUpsUnpriced: unpriced,
    netRevenueUsd: round(revenue, 2),
    apiCostUsd: round(apiCost, 2),
    failedCostUsd: round(failedCost, 2),
    failedCostShare: apiCost > 0 ? round(failedCost / apiCost) : null,
    fixedCostsUsd: round(fixed, 2),
    profitUsd: round(revenue - totalCost, 2),
    coverage: totalCost > 0 ? round(revenue / totalCost, 2) : null,
    revenuePer1kCreditsUsd: credits > 0 ? round((revenue / credits) * 1000) : null,
    tiers,
  };
}
