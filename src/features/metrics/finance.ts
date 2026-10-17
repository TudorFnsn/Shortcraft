/**
 * Finance metrics for the Finance CFO routine (FinancePlan.md): MRR and what a
 * finished video costs us versus what it earns, from data we already store.
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`.
 *
 * Definitions:
 * - **MRR:** sum of list price (EUR) of live subscriptions on plans we sell
 *   (`active`/`trialing`/`past_due`, same rule as plan gating). Gross of VAT,
 *   Stripe fees and discounts; yearly billing isn't modelled yet.
 * - **Cost per video:** mean `api_cost_usd` of `done` jobs in the window. That
 *   column is the catalog's list-price estimate, not a provider invoice, so
 *   the routine reconciles it against real bills (FinancePlan §4).
 * - **Credit yield:** USD of API cost per 1,000 credits charged, so a model or
 *   plan change shows up as one comparable number.
 */
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { PLANS } from '@/config/plans';

export const DAY_MS = 86_400_000;

export interface FinanceSubscription extends SubscriptionSnapshot {
  userId: string;
}

export interface FinanceJob {
  status: string;
  tier: string;
  createdAt: Date;
  apiCostUsd: number;
  chargedCredits: number;
}

export interface FinanceInput {
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  /** Fixed monthly spend in USD (hosting, database, tools), from FinancePlan §3. */
  fixedMonthlyUsd: number;
  /** EUR → USD, supplied by the caller so the report is reproducible. */
  usdPerEur: number;
  now: Date;
  windowDays?: number;
}

export interface TierEconomics {
  tier: string;
  videos: number;
  apiCostUsd: number;
  chargedCredits: number;
  avgCostUsd: number | null;
  usdPer1kCredits: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  mrrEur: number;
  payingSubscribers: number;
  byPlan: Record<string, { subscribers: number; mrrEur: number }>;
  videos: number;
  failedVideos: number;
  apiCostUsd: number;
  byTier: TierEconomics[];
  fixedMonthlyUsd: number;
  /** Window API cost scaled to 30 days + fixed costs. */
  monthlyBurnUsd: number;
  /** MRR (USD) minus monthly burn; null when there is no revenue to compare. */
  monthlyMarginUsd: number | null;
  /** MRR (USD) ÷ monthly burn; null when burn is 0. */
  coverage: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const ratio = (n: number, d: number) => (d > 0 ? n / d : null);

export function computeFinance(input: FinanceInput): FinanceReport {
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * DAY_MS;

  const byPlan: FinanceReport['byPlan'] = {};
  let mrrCents = 0;
  let payingSubscribers = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    const plan = PLANS[sub.planId];
    payingSubscribers += 1;
    mrrCents += plan.priceCents;
    const row = (byPlan[plan.id] ??= { subscribers: 0, mrrEur: 0 });
    row.subscribers += 1;
    row.mrrEur = round2(row.mrrEur + plan.priceCents / 100);
  }

  const inWindow = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const done = inWindow.filter((j) => j.status === 'done');
  const tiers = new Map<string, TierEconomics>();
  for (const j of done) {
    const t = tiers.get(j.tier) ?? {
      tier: j.tier,
      videos: 0,
      apiCostUsd: 0,
      chargedCredits: 0,
      avgCostUsd: null,
      usdPer1kCredits: null,
    };
    t.videos += 1;
    t.apiCostUsd += j.apiCostUsd;
    t.chargedCredits += j.chargedCredits;
    tiers.set(j.tier, t);
  }
  const byTier = [...tiers.values()].map((t) => ({
    ...t,
    apiCostUsd: round2(t.apiCostUsd),
    avgCostUsd: ratio(t.apiCostUsd, t.videos),
    usdPer1kCredits: ratio(t.apiCostUsd * 1000, t.chargedCredits),
  }));

  // Failed jobs are refunded to the user but the provider calls were still billed.
  const apiCostUsd = round2(inWindow.reduce((sum, j) => sum + j.apiCostUsd, 0));
  const monthlyBurnUsd = round2((apiCostUsd * 30) / windowDays + input.fixedMonthlyUsd);
  const mrrUsd = (mrrCents / 100) * input.usdPerEur;

  return {
    asOf: input.now.toISOString(),
    windowDays,
    mrrEur: round2(mrrCents / 100),
    payingSubscribers,
    byPlan,
    videos: done.length,
    failedVideos: inWindow.filter((j) => j.status === 'failed').length,
    apiCostUsd,
    byTier,
    fixedMonthlyUsd: input.fixedMonthlyUsd,
    monthlyBurnUsd,
    monthlyMarginUsd: mrrCents > 0 ? round2(mrrUsd - monthlyBurnUsd) : null,
    coverage: ratio(mrrUsd, monthlyBurnUsd),
  };
}
