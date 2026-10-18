/**
 * Finance metrics for the Finance CEO routine: MRR, net revenue, API spend and
 * gross margin, from data we already store. Pure: the caller loads rows
 * (Supabase in `scripts/finance-report.mts`, fixtures in tests) and passes `now`.
 *
 * Definitions:
 * - **MRR:** sum of the list price of every live subscription (`isLiveSubscription`),
 *   gross (VAT inclusive) and net (after VAT + Stripe fees, `netRevenueUsd`).
 * - **Top-up revenue (window):** paid `topup` ledger grants matched to a pack by
 *   credit amount; a grant matching no pack is counted in `unmatchedTopUps`.
 * - **API cost (window):** `render_jobs.api_cost_usd` of jobs created in the
 *   window. Failed jobs are included: we pay providers for them too.
 * - **Cost per video:** window API cost ÷ jobs that reached `done`.
 * - **Gross margin:** (net MRR + net top-ups − API cost) ÷ (net MRR + net top-ups).
 *   MRR is a monthly run-rate, so margin uses a 30-day window.
 */
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { netRevenueUsd, REVENUE_ASSUMPTIONS } from '@/features/billing/margin';
import { PLANS, TOPUP_PACKS, type PlanId } from '@/config/plans';
import { DAY_MS } from './north-star';

export const FINANCE_WINDOW_DAYS = 30;

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  actualCredits: number;
}

export interface FinanceTopUp {
  credits: number;
  createdAt: Date;
}

export interface FinanceInput {
  subscriptions: readonly (SubscriptionSnapshot & { userId: string })[];
  jobs: readonly FinanceJob[];
  topUps: readonly FinanceTopUp[];
  now: Date;
}

export interface TierCost {
  jobs: number;
  done: number;
  apiCostUsd: number;
  /** apiCostUsd ÷ done, or null when nothing finished. */
  costPerVideoUsd: number | null;
  credits: number;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  subscribersByPlan: Record<PlanId, number>;
  payingSubscribers: number;
  mrrGrossEur: number;
  mrrNetUsd: number;
  /** Average net revenue per paying subscriber (USD), or null with none. */
  arpuNetUsd: number | null;
  topUpNetUsd: number;
  unmatchedTopUps: number;
  apiCostUsd: number;
  videosDone: number;
  costPerVideoUsd: number | null;
  failedCostUsd: number;
  /** null when there is no revenue in the window. */
  grossMargin: number | null;
  byTier: Record<string, TierCost>;
  /** USD of API cost per 1,000 credits spent: compare with net revenue per 1,000. */
  costPer1kCreditsUsd: number | null;
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now } = input;
  const from = now.getTime() - FINANCE_WINDOW_DAYS * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= from && d.getTime() < now.getTime();

  const subscribersByPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  let mrrGrossEur = 0;
  let mrrNetUsd = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    subscribersByPlan[s.planId] += 1;
    const cents = PLANS[s.planId].priceCents;
    mrrGrossEur += cents / 100;
    mrrNetUsd += netRevenueUsd(cents, REVENUE_ASSUMPTIONS);
  }
  const payingSubscribers = Object.values(subscribersByPlan).reduce((a, b) => a + b, 0);

  let topUpNetUsd = 0;
  let unmatchedTopUps = 0;
  for (const t of input.topUps) {
    if (!inWindow(t.createdAt)) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (pack) topUpNetUsd += netRevenueUsd(pack.priceCents, REVENUE_ASSUMPTIONS);
    else unmatchedTopUps += 1;
  }

  const byTier: Record<string, TierCost> = {};
  let apiCostUsd = 0;
  let videosDone = 0;
  let failedCostUsd = 0;
  let credits = 0;
  for (const j of input.jobs) {
    if (!inWindow(j.createdAt)) continue;
    const t = (byTier[j.modelTier] ??= {
      jobs: 0,
      done: 0,
      apiCostUsd: 0,
      costPerVideoUsd: null,
      credits: 0,
    });
    t.jobs += 1;
    t.apiCostUsd += j.apiCostUsd;
    t.credits += j.actualCredits;
    apiCostUsd += j.apiCostUsd;
    credits += j.actualCredits;
    if (j.status === 'done') {
      t.done += 1;
      videosDone += 1;
    } else if (j.status === 'failed') {
      failedCostUsd += j.apiCostUsd;
    }
  }
  for (const t of Object.values(byTier)) {
    t.apiCostUsd = round(t.apiCostUsd, 4);
    t.costPerVideoUsd = t.done > 0 ? round(t.apiCostUsd / t.done, 4) : null;
  }

  const netRevenue = mrrNetUsd + topUpNetUsd;
  return {
    asOf: now.toISOString(),
    windowDays: FINANCE_WINDOW_DAYS,
    subscribersByPlan,
    payingSubscribers,
    mrrGrossEur: round(mrrGrossEur),
    mrrNetUsd: round(mrrNetUsd),
    arpuNetUsd: payingSubscribers > 0 ? round(mrrNetUsd / payingSubscribers) : null,
    topUpNetUsd: round(topUpNetUsd),
    unmatchedTopUps,
    apiCostUsd: round(apiCostUsd, 4),
    videosDone,
    costPerVideoUsd: videosDone > 0 ? round(apiCostUsd / videosDone, 4) : null,
    failedCostUsd: round(failedCostUsd, 4),
    grossMargin: netRevenue > 0 ? round((netRevenue - apiCostUsd) / netRevenue, 3) : null,
    byTier,
    costPer1kCreditsUsd: credits > 0 ? round((apiCostUsd / credits) * 1000, 4) : null,
  };
}
