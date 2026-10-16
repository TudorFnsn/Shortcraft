/**
 * Finance metrics: MRR, API spend per video, gross margin and cash position,
 * computed from data we already store (subscriptions, render jobs, the credit
 * ledger) plus the owner-maintained vendor ledger (`docs/finance/vendors.json`).
 *
 * Pure, like `north-star.ts`: the caller loads rows and passes `now`, so every
 * number is reproducible. Money is USD unless a name says otherwise.
 *
 * Definitions:
 * - **MRR:** net monthly revenue of live subscriptions (`active`/`trialing`/
 *   `past_due`) on a plan we sell, after VAT + Stripe fees (same assumptions
 *   as the margin gate). Billing interval isn't stored, so a yearly plan is
 *   counted at its monthly price; Stripe is the source of truth for MRR.
 * - **Top-up revenue (30d):** ledger `topup` grants in the window, priced by the
 *   pack that grants exactly that many credits (unknown sizes are skipped).
 * - **API spend (30d):** `render_jobs.api_cost_usd` of jobs created in the
 *   window, finished or failed (a failed job still burned provider money).
 * - **Gross margin:** (MRR + top-up revenue − API spend) / (MRR + top-up revenue).
 *   Left null with no revenue.
 */
import { TOPUP_PACKS, PLANS, type PlanId } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { netRevenueUsd, REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;
export const WINDOW_DAYS = 30;

export interface FinanceSubscription {
  planId: string;
  status: string;
}

export interface FinanceJob {
  status: string;
  modelTier: string;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface FinanceTopUp {
  credits: number;
  createdAt: Date;
}

export interface VendorCost {
  vendor: string;
  kind: 'fixed' | 'variable';
  /** Monthly USD for fixed costs; null = owner hasn't supplied it yet. */
  monthlyUsd: number | null;
  note?: string;
}

export interface FinanceInput {
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  topUps: readonly FinanceTopUp[];
  vendors: readonly VendorCost[];
  now: Date;
}

export interface TierCost {
  tier: string;
  jobs: number;
  doneJobs: number;
  apiSpendUsd: number;
  avgCostPerDoneVideoUsd: number | null;
  /** Revenue-equivalent USD per credit actually spent is not knowable per tier; credits shown instead. */
  creditsSpent: number;
}

export interface FinanceReport {
  asOf: string;
  mrrUsd: number;
  arrUsd: number;
  payingSubscribers: number;
  arpuUsd: number | null;
  subscribersByPlan: Record<string, number>;
  topUpRevenue30dUsd: number;
  revenue30dUsd: number;
  apiSpend30dUsd: number;
  failedSpend30dUsd: number;
  fixedCostsMonthlyUsd: number;
  /** Vendors whose monthly cost the owner hasn't filled in. */
  unknownVendors: string[];
  grossMargin: number | null;
  /** Revenue − API spend − known fixed costs, over the window. */
  cashContribution30dUsd: number;
  /** Months of fixed costs one month of gross profit covers; null with no fixed costs. */
  fixedCostCover: number | null;
  tiers: TierCost[];
}

const round = (n: number, dp = 4) => Number(n.toFixed(dp));

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now } = input;
  const since = now.getTime() - WINDOW_DAYS * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= since && d.getTime() < now.getTime();

  const subscribersByPlan: Record<string, number> = {};
  let mrr = 0;
  let payers = 0;
  for (const s of input.subscriptions) {
    const plan = PLANS[s.planId as PlanId];
    if (!plan || !isLiveSubscription({ planId: s.planId, status: s.status })) continue;
    payers += 1;
    subscribersByPlan[plan.id] = (subscribersByPlan[plan.id] ?? 0) + 1;
    mrr += netRevenueUsd(plan.priceCents, REVENUE_ASSUMPTIONS);
  }

  let topUpRevenue = 0;
  for (const t of input.topUps) {
    if (!inWindow(t.createdAt)) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (pack) topUpRevenue += netRevenueUsd(pack.priceCents, REVENUE_ASSUMPTIONS);
  }

  const byTier = new Map<string, TierCost>();
  let apiSpend = 0;
  let failedSpend = 0;
  for (const j of input.jobs) {
    if (!inWindow(j.createdAt)) continue;
    apiSpend += j.apiCostUsd;
    if (j.status === 'failed') failedSpend += j.apiCostUsd;
    const t = byTier.get(j.modelTier) ?? {
      tier: j.modelTier,
      jobs: 0,
      doneJobs: 0,
      apiSpendUsd: 0,
      avgCostPerDoneVideoUsd: null,
      creditsSpent: 0,
    };
    t.jobs += 1;
    t.apiSpendUsd += j.apiCostUsd;
    if (j.status === 'done') {
      t.doneJobs += 1;
      t.creditsSpent += j.actualCredits;
    }
    byTier.set(j.modelTier, t);
  }
  const tiers = [...byTier.values()]
    .map((t) => ({
      ...t,
      apiSpendUsd: round(t.apiSpendUsd),
      // Spend over finished videos: failed attempts are a cost of the ones that shipped.
      avgCostPerDoneVideoUsd: t.doneJobs > 0 ? round(t.apiSpendUsd / t.doneJobs) : null,
    }))
    .sort((a, b) => a.tier.localeCompare(b.tier));

  const fixed = input.vendors.filter((v) => v.kind === 'fixed');
  const fixedMonthly = fixed.reduce((sum, v) => sum + (v.monthlyUsd ?? 0), 0);
  const unknownVendors = fixed.filter((v) => v.monthlyUsd === null).map((v) => v.vendor);

  const revenue = mrr + topUpRevenue;
  const grossProfit = revenue - apiSpend;
  return {
    asOf: now.toISOString(),
    mrrUsd: round(mrr, 2),
    arrUsd: round(mrr * 12, 2),
    payingSubscribers: payers,
    arpuUsd: payers > 0 ? round(mrr / payers, 2) : null,
    subscribersByPlan,
    topUpRevenue30dUsd: round(topUpRevenue, 2),
    revenue30dUsd: round(revenue, 2),
    apiSpend30dUsd: round(apiSpend, 2),
    failedSpend30dUsd: round(failedSpend, 2),
    fixedCostsMonthlyUsd: round(fixedMonthly, 2),
    unknownVendors,
    grossMargin: revenue > 0 ? round(grossProfit / revenue) : null,
    cashContribution30dUsd: round(grossProfit - fixedMonthly, 2),
    fixedCostCover: fixedMonthly > 0 ? round(grossProfit / fixedMonthly, 2) : null,
    tiers,
  };
}
