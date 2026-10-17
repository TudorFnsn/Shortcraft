/**
 * Unit economics: MRR, gross margin and cost per finished video, computed from
 * data we already store (subscriptions, render_jobs.api_cost_usd, paid ledger
 * grants). No vendor, no new tables.
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes the fixed monthly costs, so every number is
 * reproducible.
 *
 * Definitions:
 * - **MRR:** sum of live-subscription plan prices, as net USD after VAT. Gross
 *   MRR (VAT included, EUR) is reported too. Top-ups are one-off and excluded.
 * - **API cost:** `render_jobs.api_cost_usd` summed over jobs created in the
 *   window, including failed ones (we paid the provider even though the user
 *   was refunded).
 * - **Wasted spend:** API cost of jobs that ended `failed`.
 * - **Burn:** window API cost + the monthly fixed costs scaled to the window.
 * - **Contribution:** net MRR - burn. Positive means the app pays for itself.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';

export const DAY_MS = 86_400_000;

/** A recurring cost that is not metered per job (hosting, DB, tools). */
export interface FixedCost {
  name: string;
  /** USD per month. */
  usdPerMonth: number;
}

export interface FinanceJob {
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  actualCredits: number;
}

export interface FinanceInput {
  now: Date;
  /** Window in days for the cost side (default 30). */
  windowDays?: number;
  subscriptions: readonly SubscriptionSnapshot[];
  jobs: readonly FinanceJob[];
  /** Top-up and subscription ledger grants in the window, in EUR cents. */
  oneOffRevenueEurCents: number;
  fixedCosts: readonly FixedCost[];
  assumptions?: RevenueAssumptions;
}

export interface TierCost {
  tier: string;
  finished: number;
  avgCostUsd: number | null;
  avgCredits: number | null;
  usdPerThousandCredits: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  byPlan: Record<PlanId, number>;
  grossMrrEur: number;
  netMrrUsd: number;
  arrNetUsd: number;
  apiCostUsd: number;
  wastedApiCostUsd: number;
  fixedCostUsd: number;
  burnUsd: number;
  /** Net MRR (scaled to the window) minus burn. */
  contributionUsd: number;
  /** Net MRR ÷ burn, null when there is no burn. */
  coverage: number | null;
  /** API cost ÷ net MRR, null when MRR is zero. Lower is better. */
  apiShareOfMrr: number | null;
  finishedVideos: number;
  failedVideos: number;
  costPerFinishedVideoUsd: number | null;
  tiers: TierCost[];
}

const round = (n: number, dp = 4): number => Math.round(n * 10 ** dp) / 10 ** dp;
const ratio = (n: number, d: number): number | null => (d > 0 ? round(n / d) : null);

/** Net USD from one VAT-inclusive EUR charge of `cents` (VAT, then Stripe fee). */
export function netUsdFromEurCents(cents: number, a: RevenueAssumptions): number {
  const gross = cents / 100;
  const exVat = gross / (1 + a.vatRate);
  const fee = gross * a.stripePercentFee + a.stripeFixedFeeEur;
  return Math.max(0, exVat - fee) * a.usdPerEur;
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * DAY_MS;

  const byPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  let grossMrrCents = 0;
  let netMrrUsd = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    const plan = PLANS[sub.planId as PlanId];
    if (!plan) continue;
    byPlan[plan.id] += 1;
    grossMrrCents += plan.priceCents;
    netMrrUsd += netUsdFromEurCents(plan.priceCents, a);
  }
  const payingSubscribers = byPlan.starter + byPlan.pro + byPlan.ultra;

  const jobs = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  let apiCostUsd = 0;
  let wasted = 0;
  const tierAcc = new Map<string, { n: number; cost: number; credits: number }>();
  for (const j of jobs) {
    apiCostUsd += j.apiCostUsd;
    if (j.status === 'failed') wasted += j.apiCostUsd;
    if (j.status === 'done') {
      const t = tierAcc.get(j.modelTier) ?? { n: 0, cost: 0, credits: 0 };
      t.n += 1;
      t.cost += j.apiCostUsd;
      t.credits += j.actualCredits;
      tierAcc.set(j.modelTier, t);
    }
  }
  const finishedVideos = jobs.filter((j) => j.status === 'done').length;
  const failedVideos = jobs.filter((j) => j.status === 'failed').length;
  const finishedCost = [...tierAcc.values()].reduce((s, t) => s + t.cost, 0);

  const fixedMonthly = input.fixedCosts.reduce((s, c) => s + c.usdPerMonth, 0);
  const fixedCostUsd = (fixedMonthly * windowDays) / 30;
  const burnUsd = apiCostUsd + fixedCostUsd;
  const windowRevenueUsd =
    (netMrrUsd * windowDays) / 30 +
    (input.oneOffRevenueEurCents > 0
      ? netUsdFromEurCents(input.oneOffRevenueEurCents, { ...a, stripeFixedFeeEur: 0 })
      : 0);

  return {
    asOf: input.now.toISOString(),
    windowDays,
    payingSubscribers,
    byPlan,
    grossMrrEur: round(grossMrrCents / 100, 2),
    netMrrUsd: round(netMrrUsd, 2),
    arrNetUsd: round(netMrrUsd * 12, 2),
    apiCostUsd: round(apiCostUsd, 2),
    wastedApiCostUsd: round(wasted, 2),
    fixedCostUsd: round(fixedCostUsd, 2),
    burnUsd: round(burnUsd, 2),
    contributionUsd: round(windowRevenueUsd - burnUsd, 2),
    coverage: ratio(windowRevenueUsd, burnUsd),
    apiShareOfMrr: ratio(apiCostUsd, (netMrrUsd * windowDays) / 30),
    finishedVideos,
    failedVideos,
    costPerFinishedVideoUsd: finishedVideos > 0 ? round(finishedCost / finishedVideos) : null,
    tiers: [...tierAcc.entries()].map(([tier, t]) => ({
      tier,
      finished: t.n,
      avgCostUsd: round(t.cost / t.n),
      avgCredits: round(t.credits / t.n, 0),
      usdPerThousandCredits: t.credits > 0 ? round((t.cost / t.credits) * 1000) : null,
    })),
  };
}
