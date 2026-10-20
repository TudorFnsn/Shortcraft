/**
 * Unit economics: MRR and what the last 30 days of videos cost us, from data we
 * already store (`subscriptions`, `render_jobs.api_cost_usd`, top-up ledger rows).
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`, fixtures
 * in tests) and passes `now`.
 *
 * Definitions:
 * - **MRR:** list price of every live subscription (`isLiveSubscription`), EUR,
 *   VAT included. Subscriptions don't store the billing interval, so a yearly
 *   plan counts at its monthly price. `mrrNetUsd` applies the margin gate's VAT +
 *   Stripe fee assumptions, so it is what we keep.
 * - **API cost (30d):** `api_cost_usd` of jobs created in the last 30 days, any
 *   status. Failed jobs still cost money (the refund returns credits, not cash).
 * - **Top-up revenue (30d):** ledger `topup` rows priced by the pack with the
 *   same credits; rows matching no pack are counted in credits only.
 * - **Cost to revenue:** 30d API cost ÷ (net MRR + net 30d top-ups). Below
 *   1 / TARGET_MARGIN_MULTIPLE (0.33) is healthy. Hosting and SaaS fees are
 *   NOT included; the routine adds them from Vercel/Supabase billing.
 */
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { netRevenueUsd, TARGET_MARGIN_MULTIPLE } from '@/features/billing/margin';
import { PLANS, TOPUP_PACKS } from '@/config/plans';

const DAY_MS = 86_400_000;

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  apiCostUsd: number;
  createdAt: Date;
}

export interface FinanceSubscription extends SubscriptionSnapshot {
  userId: string;
}

/** A `topup` ledger row. */
export interface FinanceTopUp {
  credits: number;
  createdAt: Date;
}

export interface FinanceInput {
  jobs: readonly FinanceJob[];
  subscriptions: readonly FinanceSubscription[];
  topUps: readonly FinanceTopUp[];
  now: Date;
}

export interface TierCost {
  jobs: number;
  done: number;
  apiCostUsd: number;
  /** Cost of the tier ÷ finished videos in it, or null with none. */
  costPerDoneVideoUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  payingSubscribers: number;
  subscribersByPlan: Record<string, number>;
  mrrGrossEur: number;
  mrrNetUsd: number;
  arrNetUsd: number;
  /** Net MRR ÷ paying subscribers. */
  arpuNetUsd: number | null;
  topUpNetUsd30d: number;
  topUpCreditsUnpriced30d: number;
  apiCostUsd30d: number;
  apiCostByTier: Record<string, TierCost>;
  /** API cost of jobs by users with no live subscription (trial / top-up only). */
  freeUserApiCostUsd30d: number;
  freeUserShareOfCost: number | null;
  costToRevenue: number | null;
  /** True when costToRevenue is at or under 1 / TARGET_MARGIN_MULTIPLE. */
  healthy: boolean | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);

export function computeFinance(input: FinanceInput): FinanceReport {
  const since = input.now.getTime() - 30 * DAY_MS;

  const subscribersByPlan: Record<string, number> = {};
  const payingIds = new Set<string>();
  let mrrCents = 0;
  let mrrNetUsd = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    const plan = PLANS[sub.planId];
    payingIds.add(sub.userId);
    subscribersByPlan[plan.id] = (subscribersByPlan[plan.id] ?? 0) + 1;
    mrrCents += plan.priceCents;
    mrrNetUsd += netRevenueUsd(plan.priceCents);
  }

  let topUpNetUsd = 0;
  let unpriced = 0;
  for (const t of input.topUps) {
    if (t.createdAt.getTime() < since) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (pack) topUpNetUsd += netRevenueUsd(pack.priceCents);
    else unpriced += t.credits;
  }

  const apiCostByTier: Record<string, TierCost> = {};
  let apiCost = 0;
  let freeCost = 0;
  for (const job of input.jobs) {
    if (job.createdAt.getTime() < since) continue;
    const tier = (apiCostByTier[job.modelTier] ??= {
      jobs: 0,
      done: 0,
      apiCostUsd: 0,
      costPerDoneVideoUsd: null,
    });
    tier.jobs += 1;
    if (job.status === 'done') tier.done += 1;
    tier.apiCostUsd += job.apiCostUsd;
    apiCost += job.apiCostUsd;
    if (!payingIds.has(job.userId)) freeCost += job.apiCostUsd;
  }
  for (const tier of Object.values(apiCostByTier)) {
    tier.costPerDoneVideoUsd = tier.done > 0 ? round2(tier.apiCostUsd / tier.done) : null;
    tier.apiCostUsd = round2(tier.apiCostUsd);
  }

  const revenue = mrrNetUsd + topUpNetUsd;
  const costToRevenue = ratio(apiCost, revenue);
  return {
    asOf: input.now.toISOString(),
    payingSubscribers: payingIds.size,
    subscribersByPlan,
    mrrGrossEur: mrrCents / 100,
    mrrNetUsd: round2(mrrNetUsd),
    arrNetUsd: round2(mrrNetUsd * 12),
    arpuNetUsd: payingIds.size > 0 ? round2(mrrNetUsd / payingIds.size) : null,
    topUpNetUsd30d: round2(topUpNetUsd),
    topUpCreditsUnpriced30d: unpriced,
    apiCostUsd30d: round2(apiCost),
    apiCostByTier,
    freeUserApiCostUsd30d: round2(freeCost),
    freeUserShareOfCost: ratio(freeCost, apiCost),
    costToRevenue: costToRevenue === null ? null : Math.round(costToRevenue * 1000) / 1000,
    healthy: costToRevenue === null ? null : costToRevenue <= 1 / TARGET_MARGIN_MULTIPLE,
  };
}
