/**
 * Unit economics for the Finance routine: MRR, cash revenue vs measured API
 * cost, cost per video, credit utilisation, fixed-cost burn and break-even.
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`.
 *
 * Definitions:
 * - **MRR:** sum of monthly list prices (EUR, VAT inclusive) of live
 *   subscriptions, plus the same converted to net USD (after VAT + Stripe fees,
 *   via the margin gate's assumptions). Top-ups are not recurring: they are in
 *   cash revenue, not MRR.
 * - **Cash revenue (window):** net USD of paid grants in the last 30 days:
 *   `monthly_grant` rows priced by the plan whose credits match, `topup` rows
 *   by the pack whose credits match. Unmatched rows are counted, not priced.
 * - **API cost:** `api_cost_usd` of jobs created in the window (all statuses:
 *   a failed video still burned provider money).
 * - **Credit utilisation:** credits settled on done jobs ÷ credits granted in
 *   the window. Unused credits are pure margin (breakage); the routine must not
 *   treat low utilisation as a problem to "fix" by spending more on users.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { FIXED_COSTS, type FixedCost } from '@/config/finance-costs';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { netRevenueUsd, REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;
export const WINDOW_DAYS = 30;

export interface FinanceSubscription extends SubscriptionSnapshot {
  userId: string;
}

export interface FinanceJob {
  status: string;
  modelTier: string;
  targetDurationSec: number;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface FinanceGrant {
  reason: string;
  delta: number;
  createdAt: Date;
}

export interface FinanceInput {
  now: Date;
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  /** Ledger rows with reason `monthly_grant` or `topup`. */
  paidGrants: readonly FinanceGrant[];
  fixedCosts?: readonly FixedCost[];
}

export interface TierEconomics {
  tier: string;
  jobs: number;
  done: number;
  apiCostUsd: number;
  /** API cost ÷ finished videos (failed jobs' cost is spread over the finished ones). */
  costPerVideoUsd: number | null;
  creditsSettled: number;
  /** USD of API cost per 1,000 credits settled; the number to compare with revenue per 1,000 credits. */
  costPer1kCreditsUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  mrrEur: number;
  mrrNetUsd: number;
  arpuNetUsd: number | null;
  cashRevenueNetUsd: number;
  unmatchedGrants: number;
  apiCostUsd: number;
  fixedCostUsd: number;
  fixedCostUnverified: number;
  /** Net cash revenue − API cost − fixed costs over the window. */
  profitUsd: number;
  /** (revenue − API cost) ÷ revenue, or null with no revenue. */
  grossMargin: number | null;
  /** Net revenue ÷ API cost; the margin gate's 3x target applied to real data. */
  revenueMultiple: number | null;
  creditsGranted: number;
  creditsSettled: number;
  creditUtilisation: number | null;
  failedCostUsd: number;
  failedCostShare: number | null;
  tiers: TierEconomics[];
  /** Subscribers needed so net MRR covers fixed costs plus the average API cost per subscriber. */
  breakEvenSubscribers: number | null;
}

const round = (n: number, dp = 4) => Number(n.toFixed(dp));

/** Net USD price of a grant, by the plan or pack whose credits it matches; null if none. */
export function priceGrantUsd(g: FinanceGrant): number | null {
  const plan = Object.values(PLANS).find((p) => p.monthlyCredits === g.delta);
  if (g.reason === 'monthly_grant' && plan) return netRevenueUsd(plan.priceCents);
  const pack = TOPUP_PACKS.find((p) => p.credits === g.delta);
  if (g.reason === 'topup' && pack) return netRevenueUsd(pack.priceCents);
  return null;
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const since = input.now.getTime() - WINDOW_DAYS * DAY_MS;
  const inWindow = <T extends { createdAt: Date }>(r: T) =>
    r.createdAt.getTime() >= since && r.createdAt.getTime() < input.now.getTime();

  const live = input.subscriptions.flatMap((s) => (isLiveSubscription(s) ? [s] : []));
  const mrrEur = live.reduce((s, sub) => s + PLANS[sub.planId].priceCents / 100, 0);
  const mrrNetUsd = live.reduce((s, sub) => s + netRevenueUsd(PLANS[sub.planId].priceCents), 0);

  const grants = input.paidGrants.filter(inWindow);
  let cashRevenueNetUsd = 0;
  let unmatchedGrants = 0;
  let creditsGranted = 0;
  for (const g of grants) {
    const usd = priceGrantUsd(g);
    if (usd === null) unmatchedGrants++;
    else cashRevenueNetUsd += usd;
    creditsGranted += g.delta;
  }

  const jobs = input.jobs.filter(inWindow);
  const tiers = new Map<string, TierEconomics>();
  let apiCostUsd = 0;
  let failedCostUsd = 0;
  let creditsSettled = 0;
  for (const j of jobs) {
    apiCostUsd += j.apiCostUsd;
    const t = tiers.get(j.modelTier) ?? {
      tier: j.modelTier,
      jobs: 0,
      done: 0,
      apiCostUsd: 0,
      costPerVideoUsd: null,
      creditsSettled: 0,
      costPer1kCreditsUsd: null,
    };
    t.jobs++;
    t.apiCostUsd += j.apiCostUsd;
    if (j.status === 'done') {
      t.done++;
      t.creditsSettled += j.actualCredits;
      creditsSettled += j.actualCredits;
    } else if (j.status === 'failed') {
      failedCostUsd += j.apiCostUsd;
    }
    tiers.set(j.modelTier, t);
  }
  for (const t of tiers.values()) {
    t.costPerVideoUsd = t.done ? round(t.apiCostUsd / t.done) : null;
    t.costPer1kCreditsUsd = t.creditsSettled
      ? round((t.apiCostUsd / t.creditsSettled) * 1000)
      : null;
    t.apiCostUsd = round(t.apiCostUsd);
  }

  const fixed = input.fixedCosts ?? FIXED_COSTS;
  const fixedCostUsd = fixed.reduce((s, c) => s + c.monthlyUsd, 0);
  const arpuNetUsd = live.length ? mrrNetUsd / live.length : null;
  const apiPerSub = live.length ? apiCostUsd / live.length : null;
  const unitMargin = arpuNetUsd !== null && apiPerSub !== null ? arpuNetUsd - apiPerSub : null;

  return {
    asOf: input.now.toISOString(),
    windowDays: WINDOW_DAYS,
    payingSubscribers: live.length,
    mrrEur: round(mrrEur, 2),
    mrrNetUsd: round(mrrNetUsd, 2),
    arpuNetUsd: arpuNetUsd === null ? null : round(arpuNetUsd, 2),
    cashRevenueNetUsd: round(cashRevenueNetUsd, 2),
    unmatchedGrants,
    apiCostUsd: round(apiCostUsd, 2),
    fixedCostUsd: round(fixedCostUsd, 2),
    fixedCostUnverified: fixed.filter((c) => c.source !== 'invoice').length,
    profitUsd: round(cashRevenueNetUsd - apiCostUsd - fixedCostUsd, 2),
    grossMargin: cashRevenueNetUsd
      ? round((cashRevenueNetUsd - apiCostUsd) / cashRevenueNetUsd)
      : null,
    revenueMultiple: apiCostUsd ? round(cashRevenueNetUsd / apiCostUsd, 2) : null,
    creditsGranted,
    creditsSettled,
    creditUtilisation: creditsGranted ? round(creditsSettled / creditsGranted) : null,
    failedCostUsd: round(failedCostUsd, 2),
    failedCostShare: apiCostUsd ? round(failedCostUsd / apiCostUsd) : null,
    tiers: [...tiers.values()].sort((a, b) => a.tier.localeCompare(b.tier)),
    breakEvenSubscribers:
      unitMargin !== null && unitMargin > 0 ? Math.ceil(fixedCostUsd / unitMargin) : null,
  };
}

export { REVENUE_ASSUMPTIONS };
