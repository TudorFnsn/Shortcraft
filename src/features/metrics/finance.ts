/**
 * Finance report: MRR against what the app costs to run, from data we already
 * store. Feeds the Finance CEO routine (`FinancePlan.md`).
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`, so every number is reproducible.
 *
 * Definitions (USD unless noted; net = after VAT + Stripe fees, via
 * `netRevenueUsd`):
 * - **MRR:** net monthly price of every live subscription as of `now`. Annual
 *   or discounted subscriptions are priced at the list monthly price (the
 *   subscription table stores no amount), so treat it as an estimate.
 * - **Top-up revenue:** net price of top-up grants in the window, matched to a
 *   pack by credit count (unmatched grants are counted but not priced).
 * - **API cost:** `render_jobs.api_cost_usd` summed over jobs created in the
 *   window, failed jobs included (their spend is real).
 * - **Free-user cost:** API cost of users who never paid (no live subscription,
 *   no paid grant): the true acquisition cost of the trial.
 * - **Fixed costs:** hosting, Supabase, ElevenLabs plan, etc. They are not in
 *   the database, so the caller passes a monthly USD figure.
 * - **MRR / cost ratio:** MRR ÷ (window API cost scaled to 30 days + fixed).
 */
import { TOPUP_PACKS } from '@/config/plans';
import { PLANS } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { netRevenueUsd } from '@/features/billing/margin';

export const FINANCE_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface FinanceInput {
  now: Date;
  jobs: readonly FinanceJob[];
  subscriptions: readonly { userId: string; planId: string; status: string }[];
  /** Paid credit grants (`monthly_grant` and `topup`). */
  paidGrants: readonly { userId: string; reason: string; delta: number; createdAt: Date }[];
  /** Monthly costs the database can't see (hosting, plans, domains), in USD. */
  fixedCostsUsdMonthly?: number;
}

export interface TierCost {
  tier: string;
  videos: number;
  apiCostUsd: number;
  credits: number;
  /** API cost per finished video. */
  costPerVideoUsd: number | null;
  /** API cost per 1,000 credits burned. */
  costPer1kCreditsUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  mrrNetUsd: number;
  mrrGrossEur: number;
  topUpNetUsd: number;
  topUpGrants: number;
  unpricedTopUpGrants: number;
  apiCostUsd: number;
  /** API cost scaled to a 30-day month. */
  apiCostMonthlyUsd: number;
  freeUserCostUsd: number;
  failedJobCostUsd: number;
  fixedCostsUsdMonthly: number;
  /** Net revenue in the window (MRR + top-ups) minus all costs, per month. */
  monthlyProfitUsd: number;
  /** MRR ÷ (monthly API cost + fixed); null when there are no costs. */
  mrrToCostRatio: number | null;
  /** (revenue − API cost) ÷ revenue; null with no revenue. */
  grossMargin: number | null;
  tiers: TierCost[];
}

const div = (a: number, b: number): number | null => (b === 0 ? null : a / b);

export function computeFinance(input: FinanceInput): FinanceReport {
  const now = input.now.getTime();
  const start = now - FINANCE_WINDOW_DAYS * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= start && d.getTime() < now;
  const fixed = input.fixedCostsUsdMonthly ?? 0;

  let mrrNetUsd = 0;
  let mrrGrossEur = 0;
  const payers = new Set<string>();
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const plan = PLANS[s.planId];
    mrrNetUsd += netRevenueUsd(plan.priceCents);
    mrrGrossEur += plan.priceCents / 100;
    payers.add(s.userId);
  }
  for (const g of input.paidGrants) payers.add(g.userId);

  let topUpNetUsd = 0;
  let topUpGrants = 0;
  let unpriced = 0;
  for (const g of input.paidGrants) {
    if (g.reason !== 'topup' || !inWindow(g.createdAt)) continue;
    topUpGrants++;
    const pack = TOPUP_PACKS.find((p) => p.credits === g.delta);
    if (pack) topUpNetUsd += netRevenueUsd(pack.priceCents);
    else unpriced++;
  }

  const byTier = new Map<string, { videos: number; cost: number; credits: number }>();
  let apiCostUsd = 0;
  let freeUserCostUsd = 0;
  let failedJobCostUsd = 0;
  for (const j of input.jobs) {
    if (!inWindow(j.createdAt)) continue;
    apiCostUsd += j.apiCostUsd;
    if (!payers.has(j.userId)) freeUserCostUsd += j.apiCostUsd;
    if (j.status === 'failed') failedJobCostUsd += j.apiCostUsd;
    const t = byTier.get(j.modelTier) ?? { videos: 0, cost: 0, credits: 0 };
    t.cost += j.apiCostUsd;
    t.credits += j.actualCredits;
    if (j.status === 'done') t.videos++;
    byTier.set(j.modelTier, t);
  }

  const scale = 30 / FINANCE_WINDOW_DAYS;
  const apiCostMonthlyUsd = apiCostUsd * scale;
  const revenue = mrrNetUsd + topUpNetUsd * scale;
  return {
    asOf: input.now.toISOString(),
    windowDays: FINANCE_WINDOW_DAYS,
    payingSubscribers: input.subscriptions.filter((s) => isLiveSubscription(s)).length,
    mrrNetUsd,
    mrrGrossEur,
    topUpNetUsd,
    topUpGrants,
    unpricedTopUpGrants: unpriced,
    apiCostUsd,
    apiCostMonthlyUsd,
    freeUserCostUsd,
    failedJobCostUsd,
    fixedCostsUsdMonthly: fixed,
    monthlyProfitUsd: revenue - apiCostMonthlyUsd - fixed,
    mrrToCostRatio: div(mrrNetUsd, apiCostMonthlyUsd + fixed),
    grossMargin: div(revenue - apiCostMonthlyUsd, revenue),
    tiers: [...byTier.entries()].map(([tier, t]) => ({
      tier,
      videos: t.videos,
      apiCostUsd: t.cost,
      credits: t.credits,
      costPerVideoUsd: div(t.cost, t.videos),
      costPer1kCreditsUsd: div(t.cost * 1000, t.credits),
    })),
  };
}
