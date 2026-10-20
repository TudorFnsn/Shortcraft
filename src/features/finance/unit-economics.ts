/**
 * Unit economics: MRR, API spend and gross margin from data we already store
 * (`subscriptions`, `render_jobs.api_cost_usd`), for the Finance CFO routine
 * (`FinancePlan.md`).
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`, so every number is reproducible.
 *
 * Definitions:
 * - **MRR:** sum of the monthly price of live subscriptions (`isLiveSubscription`),
 *   gross (VAT incl.) and net (after VAT + Stripe fees, `netRevenueUsd`), in USD.
 *   Yearly prices are not modelled yet: every sub is read as the monthly price.
 * - **API cost:** `render_jobs.api_cost_usd` (real usage × catalog list price,
 *   not a provider invoice) of jobs created in the window, failed ones included
 *   because the provider already billed us for the steps that ran.
 * - **Gross margin:** (net MRR − API cost scaled to a month) / net MRR. The window
 *   cost is scaled by 30 / windowDays so a 7-day window is comparable to MRR.
 * - **Free burn:** API cost of jobs from users who were not paying subscribers
 *   now (trial users, churned users): money spent on acquisition, not delivery.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { netRevenueUsd, REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;

export interface FinanceSubscription extends SubscriptionSnapshot {
  userId: string;
}

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  targetDurationSec: number;
  apiCostUsd: number;
  chargedCredits: number;
  createdAt: Date;
}

/** A monthly bill that doesn't scale with usage (hosting, ElevenLabs plan, ...). */
export interface FixedCost {
  name: string;
  usdPerMonth: number;
}

export interface FinanceInput {
  now: Date;
  /** Look-back window for job cost, in days. */
  windowDays: number;
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  fixedCosts: readonly FixedCost[];
  /** Net top-up revenue (USD) received in the window, if known. */
  topUpNetUsd?: number;
}

export interface PlanMrr {
  planId: PlanId;
  subscribers: number;
  grossEur: number;
  netUsd: number;
}

export interface TierCost {
  tier: string;
  jobs: number;
  done: number;
  costUsd: number;
  chargedCredits: number;
  /** Cost per finished video; null with none. */
  costPerDoneUsd: number | null;
  /** API cost per 1,000 credits charged; null when nothing was charged. */
  costPer1kCreditsUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  mrrGrossEur: number;
  mrrNetUsd: number;
  byPlan: PlanMrr[];
  jobs: number;
  failedJobs: number;
  apiCostUsd: number;
  /** Window API cost scaled to 30 days. */
  apiCostMonthlyUsd: number;
  byTier: TierCost[];
  /** API cost of jobs from users not paying right now (acquisition spend). */
  freeBurnUsd: number;
  /** API cost spent on jobs that ended `failed`. */
  failedCostUsd: number;
  fixedMonthlyUsd: number;
  /** Net MRR − monthly API cost − fixed costs. Negative = burning cash. */
  monthlyProfitUsd: number;
  /** (net MRR − monthly API cost) / net MRR; null with no MRR. */
  grossMargin: number | null;
  /** Months of fixed costs + API spend one month of net MRR covers; null with no spend. */
  coverage: number | null;
}

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now, windowDays } = input;
  const since = now.getTime() - windowDays * DAY_MS;

  const live = input.subscriptions.filter(isLiveSubscription);
  const payingUsers = new Set(live.map((s) => s.userId));

  const byPlan: PlanMrr[] = (Object.keys(PLANS) as PlanId[]).map((planId) => {
    const subs = live.filter((s) => s.planId === planId);
    const cents = PLANS[planId].priceCents;
    return {
      planId,
      subscribers: subs.length,
      grossEur: round((subs.length * cents) / 100, 2),
      netUsd: round(subs.length * netRevenueUsd(cents, REVENUE_ASSUMPTIONS), 2),
    };
  });
  const mrrGrossEur = round(
    byPlan.reduce((s, p) => s + p.grossEur, 0),
    2,
  );
  const mrrNetUsd = round(
    byPlan.reduce((s, p) => s + p.netUsd, 0) + (input.topUpNetUsd ?? 0) * (30 / windowDays),
    2,
  );

  const jobs = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const tiers = new Map<string, FinanceJob[]>();
  for (const j of jobs) tiers.set(j.modelTier, [...(tiers.get(j.modelTier) ?? []), j]);
  const byTier: TierCost[] = [...tiers.entries()]
    .map(([tier, js]) => {
      const costUsd = js.reduce((s, j) => s + j.apiCostUsd, 0);
      const chargedCredits = js.reduce((s, j) => s + j.chargedCredits, 0);
      const done = js.filter((j) => j.status === 'done').length;
      return {
        tier,
        jobs: js.length,
        done,
        costUsd: round(costUsd),
        chargedCredits,
        costPerDoneUsd: done > 0 ? round(costUsd / done) : null,
        costPer1kCreditsUsd: chargedCredits > 0 ? round((costUsd / chargedCredits) * 1000) : null,
      };
    })
    .sort((a, b) => b.costUsd - a.costUsd);

  const apiCostUsd = round(jobs.reduce((s, j) => s + j.apiCostUsd, 0));
  const apiCostMonthlyUsd = round(apiCostUsd * (30 / windowDays), 2);
  const fixedMonthlyUsd = round(
    input.fixedCosts.reduce((s, c) => s + c.usdPerMonth, 0),
    2,
  );
  const spend = apiCostMonthlyUsd + fixedMonthlyUsd;

  return {
    asOf: now.toISOString(),
    windowDays,
    payingSubscribers: live.length,
    mrrGrossEur,
    mrrNetUsd,
    byPlan,
    jobs: jobs.length,
    failedJobs: jobs.filter((j) => j.status === 'failed').length,
    apiCostUsd,
    apiCostMonthlyUsd,
    byTier,
    freeBurnUsd: round(
      jobs.filter((j) => !payingUsers.has(j.userId)).reduce((s, j) => s + j.apiCostUsd, 0),
    ),
    failedCostUsd: round(
      jobs.filter((j) => j.status === 'failed').reduce((s, j) => s + j.apiCostUsd, 0),
    ),
    fixedMonthlyUsd,
    monthlyProfitUsd: round(mrrNetUsd - spend, 2),
    grossMargin: mrrNetUsd > 0 ? round((mrrNetUsd - apiCostMonthlyUsd) / mrrNetUsd, 4) : null,
    coverage: spend > 0 ? round(mrrNetUsd / spend, 2) : null,
  };
}
