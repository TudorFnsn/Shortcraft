/**
 * Finance metrics: MRR, cash in vs API cost out, and unit economics, computed
 * from data we already store (subscriptions, render jobs, the credit ledger).
 * Same shape as `north-star.ts`: pure, the caller loads rows and passes `now`.
 *
 * Definitions (revenue is NET: after VAT and Stripe fees, in USD, using the
 * same `REVENUE_ASSUMPTIONS` as the margin gate):
 * - **MRR:** live subscriptions (`isLiveSubscription`) × their plan's monthly
 *   price. Gross is the sticker price in EUR; net is what we keep.
 * - **Top-up revenue (30d):** ledger `topup` rows in the last 30 days, priced
 *   by the pack with the same credit amount. Unknown amounts are counted, not
 *   priced, so a new pack shows up as a gap instead of silently as zero.
 * - **API cost (30d):** `render_jobs.api_cost_usd` of jobs created in the last
 *   30 days. Failed jobs are included: their cost is real even when refunded.
 * - **Free-user cost (30d):** API cost of users who have never paid (trial
 *   burn), the acquisition cost we pay for signups.
 * - **Fixed costs** (hosting, ElevenLabs plan, Supabase, Sentry, domain...)
 *   aren't in the database; the caller passes the monthly USD total.
 */
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { PLANS, TOPUP_PACKS, type PlanId } from '@/config/plans';
import { DAY_MS } from './north-star';

export interface FinanceSubscription {
  userId: string;
  planId: string;
  status: string;
}

export interface FinanceJob {
  userId: string;
  status: string;
  createdAt: Date;
  apiCostUsd: number;
  actualCredits: number;
  modelTier: string;
}

export interface FinanceTopUp {
  userId: string;
  credits: number;
  createdAt: Date;
}

export interface FinanceInput {
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  topUps: readonly FinanceTopUp[];
  /** Users who have ever paid (any `PAID_GRANT_REASONS` ledger row). */
  paidUserIds: ReadonlySet<string>;
  /** Monthly costs that aren't per-video (hosting, subscriptions to tools), USD. */
  fixedMonthlyUsd: number;
  now: Date;
  assumptions?: RevenueAssumptions;
}

export interface TierEconomics {
  videos: number;
  apiCostUsd: number;
  costPerVideoUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  payingSubscribers: number;
  mrrGrossEur: number;
  mrrNetUsd: number;
  arpuNetUsd: number | null;
  byPlan: Record<string, { subscribers: number; mrrGrossEur: number }>;
  topUpRevenueNetUsd30d: number;
  unpricedTopUps30d: number;
  cashInNetUsd30d: number;
  apiCostUsd30d: number;
  freeUserApiCostUsd30d: number;
  videosDone30d: number;
  failedJobs30d: number;
  costPerVideoUsd: number | null;
  /** Credits charged per USD of API cost on finished videos (higher = fatter margin). */
  creditsPerApiUsd: number | null;
  byTier: Record<string, TierEconomics>;
  fixedMonthlyUsd: number;
  /** Cash in − API cost − fixed costs, last 30 days. */
  contributionUsd30d: number;
  /** (cash in − API cost) / cash in, or null with no revenue. */
  grossMargin: number | null;
  /** Paying subscribers needed so MRR covers fixed + API cost at today's cost per subscriber; null if ARPU is 0. */
  breakEvenSubscribers: number | null;
}

/** Net USD we keep from one EUR sticker price: minus VAT, Stripe fees, then FX. */
export function netUsdFromEurCents(cents: number, a: RevenueAssumptions): number {
  const gross = cents / 100;
  const ex = gross / (1 + a.vatRate);
  const fee = gross * a.stripePercentFee + a.stripeFixedFeeEur;
  return Math.max(0, ex - fee) * a.usdPerEur;
}

const round = (n: number, dp = 2): number => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const since = input.now.getTime() - 30 * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= since && d.getTime() < input.now.getTime();

  const byPlan: FinanceReport['byPlan'] = {};
  let mrrGrossEur = 0;
  let mrrNetUsd = 0;
  let payingSubscribers = 0;
  for (const s of input.subscriptions) {
    const plan = PLANS[s.planId as PlanId];
    if (!plan || !isLiveSubscription(s)) continue;
    payingSubscribers += 1;
    mrrGrossEur += plan.priceCents / 100;
    mrrNetUsd += netUsdFromEurCents(plan.priceCents, a);
    const row = (byPlan[plan.id] ??= { subscribers: 0, mrrGrossEur: 0 });
    row.subscribers += 1;
    row.mrrGrossEur = round(row.mrrGrossEur + plan.priceCents / 100);
  }

  let topUpRevenueNetUsd30d = 0;
  let unpricedTopUps30d = 0;
  for (const t of input.topUps) {
    if (!inWindow(t.createdAt)) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (!pack) unpricedTopUps30d += 1;
    else topUpRevenueNetUsd30d += netUsdFromEurCents(pack.priceCents, a);
  }

  let apiCostUsd30d = 0;
  let freeUserApiCostUsd30d = 0;
  let videosDone30d = 0;
  let failedJobs30d = 0;
  let doneCost = 0;
  let doneCredits = 0;
  const byTier: FinanceReport['byTier'] = {};
  for (const j of input.jobs) {
    if (!inWindow(j.createdAt)) continue;
    apiCostUsd30d += j.apiCostUsd;
    if (!input.paidUserIds.has(j.userId)) freeUserApiCostUsd30d += j.apiCostUsd;
    if (j.status === 'failed') failedJobs30d += 1;
    if (j.status !== 'done') continue;
    videosDone30d += 1;
    doneCost += j.apiCostUsd;
    doneCredits += j.actualCredits;
    const t = (byTier[j.modelTier] ??= { videos: 0, apiCostUsd: 0, costPerVideoUsd: null });
    t.videos += 1;
    t.apiCostUsd += j.apiCostUsd;
  }
  for (const t of Object.values(byTier)) {
    t.costPerVideoUsd = t.videos ? round(t.apiCostUsd / t.videos, 4) : null;
    t.apiCostUsd = round(t.apiCostUsd, 4);
  }

  // Cash in over 30 days = this month's subscription MRR + top-ups. MRR is a
  // snapshot, so a sub that joined mid-month is counted whole: a slight over-count.
  const cashIn = mrrNetUsd + topUpRevenueNetUsd30d;
  const arpu = payingSubscribers ? mrrNetUsd / payingSubscribers : null;
  const costPerSub = payingSubscribers ? apiCostUsd30d / payingSubscribers : null;
  const margin = arpu !== null && costPerSub !== null ? arpu - costPerSub : null;

  return {
    asOf: input.now.toISOString(),
    payingSubscribers,
    mrrGrossEur: round(mrrGrossEur),
    mrrNetUsd: round(mrrNetUsd),
    arpuNetUsd: arpu === null ? null : round(arpu),
    byPlan,
    topUpRevenueNetUsd30d: round(topUpRevenueNetUsd30d),
    unpricedTopUps30d,
    cashInNetUsd30d: round(cashIn),
    apiCostUsd30d: round(apiCostUsd30d, 4),
    freeUserApiCostUsd30d: round(freeUserApiCostUsd30d, 4),
    videosDone30d,
    failedJobs30d,
    costPerVideoUsd: videosDone30d ? round(doneCost / videosDone30d, 4) : null,
    creditsPerApiUsd: doneCost > 0 ? Math.round(doneCredits / doneCost) : null,
    byTier,
    fixedMonthlyUsd: input.fixedMonthlyUsd,
    contributionUsd30d: round(cashIn - apiCostUsd30d - input.fixedMonthlyUsd),
    grossMargin: cashIn > 0 ? round((cashIn - apiCostUsd30d) / cashIn, 3) : null,
    breakEvenSubscribers:
      margin !== null && margin > 0 ? Math.ceil(input.fixedMonthlyUsd / margin) : null,
  };
}
