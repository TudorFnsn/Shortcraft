/**
 * Finance metrics: MRR, revenue vs API spend, unit cost per video and break-even,
 * from data we already store. Same shape as `north-star.ts`: pure, the caller
 * loads rows (Supabase in `scripts/finance-report.mts`, fixtures in tests) and
 * passes `now`.
 *
 * Definitions (all money in USD; plan prices are EUR consumer prices, VAT
 * inclusive, converted with the margin gate's assumptions):
 * - **MRR (gross):** sum of plan list prices over live subscriptions, EUR.
 * - **MRR (net):** the same after VAT and Stripe fees, USD. This is what we keep.
 * - **Window:** the last 30 days `[now-30d, now)`. Top-up revenue and API spend
 *   use the window; MRR is a snapshot as of `now`.
 * - **Revenue multiple:** (net MRR + net top-ups in window) / API spend in
 *   window. The margin gate's 3x rule applied to real numbers instead of the
 *   worst case. Null when nothing was spent.
 * - **API spend:** `render_jobs.api_cost_usd` for jobs created in the window,
 *   including failed ones (money spent on videos nobody got).
 * - **Break-even:** fixed monthly costs (hosting, tools; passed in) plus API
 *   spend, against net revenue.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { DAY_MS } from './north-star';

export const FINANCE_WINDOW_DAYS = 30;

export interface FinanceSubscription extends SubscriptionSnapshot {
  userId: string;
}

/** A ledger row with reason `topup`; `credits` is its positive delta. */
export interface FinanceTopUp {
  credits: number;
  createdAt: Date;
}

export interface FinanceJob {
  status: string;
  modelTier: string;
  targetDurationSec: number;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface FinanceInput {
  subscriptions: readonly FinanceSubscription[];
  topUps: readonly FinanceTopUp[];
  jobs: readonly FinanceJob[];
  /** Hosting, ElevenLabs/Resend/Sentry plans etc., USD per month. */
  fixedCostsUsdPerMonth: number;
  now: Date;
}

export interface TierCost {
  tier: string;
  jobs: number;
  doneJobs: number;
  apiCostUsd: number;
  /** API spend / finished videos, null when none finished. */
  costPerDoneVideoUsd: number | null;
  avgDurationSec: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  subscribersByPlan: Record<string, number>;
  mrrGrossEur: number;
  mrrNetUsd: number;
  arrNetUsd: number;
  /** Net MRR / paying subscribers, null with none. */
  arpuNetUsd: number | null;
  topUpNetUsd: number;
  /** Top-up rows whose credit amount matches no pack (not counted). */
  unmatchedTopUps: number;
  apiSpendUsd: number;
  /** Spend on jobs that ended `failed` (refunded to the user, still paid to providers). */
  failedSpendUsd: number;
  netRevenueUsd: number;
  revenueMultiple: number | null;
  /** (revenue - API spend) / revenue, null without revenue. */
  grossMargin: number | null;
  /** API spend per 1,000 credits settled on finished jobs, null without any. */
  apiCostPer1kCredits: number | null;
  tiers: TierCost[];
  fixedCostsUsdPerMonth: number;
  /** Net revenue - API spend - fixed costs, per month. */
  monthlyProfitUsd: number;
  /** Subscribers needed to cover fixed costs at the current ARPU and API ratio; null when not computable. */
  breakEvenSubscribers: number | null;
}

const inWindow = (d: Date, start: number, end: number) => {
  const t = d.getTime();
  return t >= start && t < end;
};

const ratio = (n: number, d: number) => (d > 0 ? n / d : null);

export function computeFinance(input: FinanceInput): FinanceReport {
  const end = input.now.getTime();
  const start = end - FINANCE_WINDOW_DAYS * DAY_MS;

  const subscribersByPlan: Record<string, number> = {};
  let mrrGrossEur = 0;
  let mrrNetUsd = 0;
  let payingSubscribers = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    const plan = PLANS[sub.planId];
    payingSubscribers += 1;
    subscribersByPlan[plan.id] = (subscribersByPlan[plan.id] ?? 0) + 1;
    mrrGrossEur += plan.priceCents / 100;
    mrrNetUsd += netRevenueUsd(plan.priceCents);
  }

  let topUpNetUsd = 0;
  let unmatchedTopUps = 0;
  for (const t of input.topUps) {
    if (!inWindow(t.createdAt, start, end)) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (pack) topUpNetUsd += netRevenueUsd(pack.priceCents);
    else unmatchedTopUps += 1;
  }

  let apiSpendUsd = 0;
  let failedSpendUsd = 0;
  let doneCredits = 0;
  let doneCost = 0;
  const byTier = new Map<string, { jobs: number; done: number; cost: number; doneSec: number }>();
  for (const j of input.jobs) {
    if (!inWindow(j.createdAt, start, end)) continue;
    apiSpendUsd += j.apiCostUsd;
    if (j.status === 'failed') failedSpendUsd += j.apiCostUsd;
    const t = byTier.get(j.modelTier) ?? { jobs: 0, done: 0, cost: 0, doneSec: 0 };
    t.jobs += 1;
    t.cost += j.apiCostUsd;
    if (j.status === 'done') {
      t.done += 1;
      t.doneSec += j.targetDurationSec;
      doneCredits += j.actualCredits;
      doneCost += j.apiCostUsd;
    }
    byTier.set(j.modelTier, t);
  }

  const tiers: TierCost[] = [...byTier.entries()]
    .map(([tier, t]) => ({
      tier,
      jobs: t.jobs,
      doneJobs: t.done,
      apiCostUsd: t.cost,
      costPerDoneVideoUsd: ratio(t.cost, t.done),
      avgDurationSec: ratio(t.doneSec, t.done),
    }))
    .sort((a, b) => a.tier.localeCompare(b.tier));

  const revenue = mrrNetUsd + topUpNetUsd;
  const monthlyProfitUsd = revenue - apiSpendUsd - input.fixedCostsUsdPerMonth;

  // Break-even: each subscriber nets ARPU and brings API spend in proportion to
  // the current spend/revenue ratio; fixed costs must be covered by what is left.
  const arpu = ratio(mrrNetUsd, payingSubscribers);
  const spendShare = ratio(apiSpendUsd, revenue);
  const contribution = arpu !== null && spendShare !== null ? arpu * (1 - spendShare) : null;
  const breakEvenSubscribers =
    contribution !== null && contribution > 0
      ? Math.ceil(input.fixedCostsUsdPerMonth / contribution)
      : null;

  return {
    asOf: input.now.toISOString(),
    windowDays: FINANCE_WINDOW_DAYS,
    payingSubscribers,
    subscribersByPlan,
    mrrGrossEur,
    mrrNetUsd,
    arrNetUsd: mrrNetUsd * 12,
    arpuNetUsd: arpu,
    topUpNetUsd,
    unmatchedTopUps,
    apiSpendUsd,
    failedSpendUsd,
    netRevenueUsd: revenue,
    revenueMultiple: ratio(revenue, apiSpendUsd),
    grossMargin: revenue > 0 ? (revenue - apiSpendUsd) / revenue : null,
    apiCostPer1kCredits: doneCredits > 0 ? (doneCost / doneCredits) * 1000 : null,
    tiers,
    fixedCostsUsdPerMonth: input.fixedCostsUsdPerMonth,
    monthlyProfitUsd,
    breakEvenSubscribers,
  };
}
