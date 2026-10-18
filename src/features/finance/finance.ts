/**
 * Finance report: MRR, cash margin and unit cost per video, from data we
 * already store. Pure: the caller loads rows (Supabase in
 * `scripts/finance-report.mts`, fixtures in tests) and passes `now`.
 *
 * Definitions:
 * - **MRR:** sum of the list price of every live subscription (same test as
 *   plan gating), gross of VAT, as shown to customers. **Net MRR** deducts VAT
 *   and Stripe fees with the margin gate's assumptions, so the two stay aligned.
 * - **Top-up revenue (30d):** ledger `topup` grants matched to a pack by credit
 *   count, net of VAT and fees. Unmatched grants are counted and reported, not
 *   guessed.
 * - **API spend (30d):** sum of `render_jobs.api_cost_usd` for jobs created in
 *   the window, split by status. This is usage × the catalog's list prices, not
 *   a provider invoice: reconcile it against the invoices monthly.
 * - **Cash margin:** (net MRR + net top-ups − API spend − known fixed costs) ÷
 *   net revenue. `null` while there is no revenue.
 */
import { PLANS, TOPUP_PACKS, type PlanId } from '@/config/plans';
import { FIXED_COSTS, type FixedCost } from '@/config/fixed-costs';
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
  /** `standard` or `premium`. */
  modelTier: string;
  targetDurationSec: number;
  apiCostUsd: number;
  chargedCredits: number;
  createdAt: Date;
}

export interface FinanceTopUp {
  /** Credits granted by one `topup` ledger row. */
  credits: number;
  createdAt: Date;
}

export interface FinanceInput {
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  topUps: readonly FinanceTopUp[];
  fixedCosts?: readonly FixedCost[];
  now: Date;
}

export interface TierCost {
  tier: string;
  videos: number;
  apiCostUsd: number;
  avgCostPerVideoUsd: number | null;
  avgCreditsPerVideo: number | null;
  /** Credits charged per API dollar: the realised markup of the credit scale. */
  creditsPerApiUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  subscribersByPlan: Record<PlanId, number>;
  /** Gross MRR in EUR, as customers see prices. */
  mrrEur: number;
  /** Net of VAT and Stripe fees, in USD. */
  netMrrUsd: number;
  arrEur: number;
  topUpRevenueNetUsd: number;
  topUpsMatched: number;
  topUpsUnmatched: number;
  apiSpendUsd: number;
  /** Spend on jobs that did not finish (a refund, so pure loss). */
  wastedSpendUsd: number;
  doneVideos: number;
  failedVideos: number;
  byTier: TierCost[];
  fixedKnownUsd: number;
  fixedUnknown: string[];
  cashProfitUsd: number;
  cashMarginPct: number | null;
  /** Net revenue ÷ API spend; the margin gate asks for ≥ 3. */
  revenueToApiSpend: number | null;
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;
const ratio = (a: number, b: number) => (b > 0 ? a / b : null);

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now } = input;
  const since = now.getTime() - WINDOW_DAYS * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= since && d.getTime() < now.getTime();

  const subscribersByPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  let mrrCents = 0;
  let netMrrUsd = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    const plan = PLANS[sub.planId];
    subscribersByPlan[plan.id] += 1;
    mrrCents += plan.priceCents;
    netMrrUsd += netRevenueUsd(plan.priceCents, REVENUE_ASSUMPTIONS);
  }

  let topUpRevenueNetUsd = 0;
  let topUpsMatched = 0;
  let topUpsUnmatched = 0;
  for (const t of input.topUps) {
    if (!inWindow(t.createdAt)) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (!pack) {
      topUpsUnmatched += 1;
      continue;
    }
    topUpsMatched += 1;
    topUpRevenueNetUsd += netRevenueUsd(pack.priceCents, REVENUE_ASSUMPTIONS);
  }

  const jobs = input.jobs.filter((j) => inWindow(j.createdAt));
  const apiSpendUsd = jobs.reduce((s, j) => s + j.apiCostUsd, 0);
  const wastedSpendUsd = jobs
    .filter((j) => j.status === 'failed')
    .reduce((s, j) => s + j.apiCostUsd, 0);
  const done = jobs.filter((j) => j.status === 'done');

  const byTier: TierCost[] = [...new Set(done.map((j) => j.modelTier))].sort().map((tier) => {
    const rows = done.filter((j) => j.modelTier === tier);
    const cost = rows.reduce((s, j) => s + j.apiCostUsd, 0);
    const credits = rows.reduce((s, j) => s + j.chargedCredits, 0);
    return {
      tier,
      videos: rows.length,
      apiCostUsd: round(cost, 4),
      avgCostPerVideoUsd: rows.length ? round(cost / rows.length, 4) : null,
      avgCreditsPerVideo: rows.length ? Math.round(credits / rows.length) : null,
      creditsPerApiUsd: cost > 0 ? Math.round(credits / cost) : null,
    };
  });

  const fixed = input.fixedCosts ?? FIXED_COSTS;
  const fixedKnownUsd = fixed.reduce((s, c) => s + (c.monthlyUsd ?? 0), 0);
  const fixedUnknown = fixed.filter((c) => c.monthlyUsd === null).map((c) => c.id);

  const netRevenue = netMrrUsd + topUpRevenueNetUsd;
  const cashProfitUsd = netRevenue - apiSpendUsd - fixedKnownUsd;

  return {
    asOf: now.toISOString(),
    windowDays: WINDOW_DAYS,
    payingSubscribers: Object.values(subscribersByPlan).reduce((a, b) => a + b, 0),
    subscribersByPlan,
    mrrEur: round(mrrCents / 100),
    netMrrUsd: round(netMrrUsd),
    arrEur: round((mrrCents / 100) * 12),
    topUpRevenueNetUsd: round(topUpRevenueNetUsd),
    topUpsMatched,
    topUpsUnmatched,
    apiSpendUsd: round(apiSpendUsd, 4),
    wastedSpendUsd: round(wastedSpendUsd, 4),
    doneVideos: done.length,
    failedVideos: jobs.filter((j) => j.status === 'failed').length,
    byTier,
    fixedKnownUsd: round(fixedKnownUsd),
    fixedUnknown,
    cashProfitUsd: round(cashProfitUsd),
    cashMarginPct: netRevenue > 0 ? round((cashProfitUsd / netRevenue) * 100, 1) : null,
    revenueToApiSpend: (() => {
      const r = ratio(netRevenue, apiSpendUsd);
      return r === null ? null : round(r);
    })(),
  };
}
