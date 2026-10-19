/**
 * Unit economics: MRR, trailing-30-day cash in vs cash out, cost per video and
 * the break-even subscriber count, from data we already store. No vendor.
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`, so every number is reproducible.
 *
 * Definitions:
 * - **MRR:** sum of plan prices of live subscriptions (`isLiveSubscription`) as
 *   of `now`, in EUR (VAT inclusive, as sold). **Net MRR** converts to USD and
 *   removes VAT and Stripe fees with the margin gate's `REVENUE_ASSUMPTIONS`.
 * - **Top-up revenue (30d):** top-up ledger grants in the window, priced by the
 *   pack with the same credit count. A grant matching no pack is reported, not
 *   guessed.
 * - **API cost (30d):** `render_jobs.api_cost_usd` for jobs created in the
 *   window. It is real usage × the catalog's list prices, not a provider
 *   invoice; reconcile against invoices when the owner supplies them.
 * - **Acquisition burn:** API cost of users who never paid (the free trial).
 * - **Wasted cost:** API cost of `failed` jobs (spent, refunded to the user).
 * - **Break-even:** subscribers needed for net MRR to cover fixed costs, given
 *   the observed API cost per paying subscriber.
 */
import { PLANS, TOPUP_PACKS, type PlanId } from '@/config/plans';
import type { FixedCost } from '@/config/fixed-costs';
import { REVENUE_ASSUMPTIONS, TARGET_MARGIN_MULTIPLE } from '@/features/billing/margin';
import { isLiveSubscription } from '@/features/billing/entitlements';

export const DAY_MS = 86_400_000;
export const WINDOW_DAYS = 30;

export interface FinanceSubscription {
  userId: string;
  planId: string;
  status: string;
}

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  chargedCredits: number;
}

/** A ledger grant with reason `topup` or `monthly_grant`. */
export interface FinanceGrant {
  userId: string;
  reason: string;
  delta: number;
  createdAt: Date;
}

export interface FinanceInput {
  now: Date;
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  paidGrants: readonly FinanceGrant[];
  fixedCosts: readonly FixedCost[];
  /** Overridable for tests; defaults to the margin gate's assumptions. */
  assumptions?: typeof REVENUE_ASSUMPTIONS;
}

export interface CostSlice {
  jobs: number;
  costUsd: number;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  mrr: {
    payingSubscribers: number;
    byPlan: Record<PlanId, number>;
    grossEur: number;
    netUsd: number;
    arpuNetUsd: number | null;
  };
  topUps30d: { grossEur: number; netUsd: number; packs: number; unmatchedGrants: number };
  apiCost30d: {
    totalUsd: number;
    done: CostSlice;
    failed: CostSlice;
    other: CostSlice;
    byTier: Record<string, CostSlice>;
    /** Cost of users who never paid (free trial). */
    acquisitionBurnUsd: number;
    /** USD per finished video, null with no finished videos. */
    perDoneVideoUsd: number | null;
    /** Share of cost spent on failed jobs, null with no cost. */
    wastedShare: number | null;
    /** USD of API cost per 1,000 credits charged, null with none charged. */
    costPer1kCreditsUsd: number | null;
  };
  fixed: { monthlyUsd: number; missing: string[] };
  /** Net cash in (net MRR + net top-ups) minus API cost minus known fixed costs. */
  monthly: {
    netRevenueUsd: number;
    variableCostUsd: number;
    fixedCostUsd: number;
    contributionUsd: number;
    profitUsd: number;
    /** Net revenue ÷ API cost; compare with TARGET_MARGIN_MULTIPLE. null with no cost. */
    revenueMultiple: number | null;
  };
  breakEven: {
    /** Net contribution per paying subscriber per month, null with none. */
    contributionPerSubscriberUsd: number | null;
    subscribersNeeded: number | null;
  };
  flags: string[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Consumer EUR amount (VAT inclusive) → USD we keep after VAT + Stripe fees. */
export function netUsdOf(
  grossEur: number,
  charges: number,
  a: typeof REVENUE_ASSUMPTIONS = REVENUE_ASSUMPTIONS,
): number {
  const afterVat = grossEur / (1 + a.vatRate);
  const afterFees = afterVat - grossEur * a.stripePercentFee - charges * a.stripeFixedFeeEur;
  return Math.max(0, afterFees) * a.usdPerEur;
}

const emptySlice = (): CostSlice => ({ jobs: 0, costUsd: 0 });

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const since = input.now.getTime() - WINDOW_DAYS * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= since && d.getTime() <= input.now.getTime();

  // MRR
  const byPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  let mrrGrossEur = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    byPlan[sub.planId] += 1;
    mrrGrossEur += PLANS[sub.planId].priceCents / 100;
  }
  const payingSubscribers = byPlan.starter + byPlan.pro + byPlan.ultra;
  let mrrNetUsd = 0;
  for (const id of Object.keys(byPlan) as PlanId[]) {
    mrrNetUsd += byPlan[id] * netUsdOf(PLANS[id].priceCents / 100, 1, a);
  }

  // Top-ups in the window
  let topUpGrossEur = 0;
  let topUpNetUsd = 0;
  let packs = 0;
  let unmatchedGrants = 0;
  for (const g of input.paidGrants) {
    if (g.reason !== 'topup' || !inWindow(g.createdAt)) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === g.delta);
    if (!pack) {
      unmatchedGrants += 1;
      continue;
    }
    packs += 1;
    topUpGrossEur += pack.priceCents / 100;
    topUpNetUsd += netUsdOf(pack.priceCents / 100, 1, a);
  }

  // API cost in the window
  const payers = new Set(input.paidGrants.map((g) => g.userId));
  for (const s of input.subscriptions) if (isLiveSubscription(s)) payers.add(s.userId);
  const done = emptySlice();
  const failed = emptySlice();
  const other = emptySlice();
  const byTier: Record<string, CostSlice> = {};
  let totalUsd = 0;
  let burnUsd = 0;
  let charged = 0;
  for (const j of input.jobs) {
    if (!inWindow(j.createdAt)) continue;
    const slice = j.status === 'done' ? done : j.status === 'failed' ? failed : other;
    slice.jobs += 1;
    slice.costUsd += j.apiCostUsd;
    const tier = (byTier[j.modelTier] ??= emptySlice());
    tier.jobs += 1;
    tier.costUsd += j.apiCostUsd;
    totalUsd += j.apiCostUsd;
    charged += j.chargedCredits;
    if (!payers.has(j.userId)) burnUsd += j.apiCostUsd;
  }

  // Fixed costs (null = missing, never zero)
  const missing = input.fixedCosts.filter((c) => c.usdPerMonth === null).map((c) => c.id);
  const fixedUsd = input.fixedCosts.reduce((sum, c) => sum + (c.usdPerMonth ?? 0), 0);

  const netRevenueUsd = mrrNetUsd + topUpNetUsd;
  const contributionUsd = netRevenueUsd - totalUsd;
  const profitUsd = contributionUsd - fixedUsd;
  const revenueMultiple = totalUsd > 0 ? netRevenueUsd / totalUsd : null;

  const payingCost = totalUsd - burnUsd;
  const perSubNet = payingSubscribers > 0 ? mrrNetUsd / payingSubscribers : null;
  const perSubCost = payingSubscribers > 0 ? payingCost / payingSubscribers : null;
  const contributionPerSub =
    perSubNet !== null && perSubCost !== null ? perSubNet - perSubCost : null;
  const subscribersNeeded =
    contributionPerSub !== null && contributionPerSub > 0
      ? Math.ceil(fixedUsd / contributionPerSub)
      : null;

  const flags: string[] = [];
  if (revenueMultiple !== null && revenueMultiple < TARGET_MARGIN_MULTIPLE) {
    flags.push(
      `Revenue is ${revenueMultiple.toFixed(2)}x API cost, below the ${TARGET_MARGIN_MULTIPLE}x target.`,
    );
  }
  if (totalUsd > 0 && failed.costUsd / totalUsd > 0.1) {
    flags.push(
      `${Math.round((failed.costUsd / totalUsd) * 100)}% of API cost went to failed jobs (spent, refunded).`,
    );
  }
  if (totalUsd > 0 && burnUsd / totalUsd > 0.5) {
    flags.push(
      `${Math.round((burnUsd / totalUsd) * 100)}% of API cost is free-trial users who never paid.`,
    );
  }
  if (payingSubscribers === 0) flags.push('No paying subscribers: MRR is zero.');
  if (unmatchedGrants > 0) {
    flags.push(`${unmatchedGrants} top-up grant(s) match no pack: revenue is understated.`);
  }
  if (missing.length > 0) flags.push(`Fixed costs not supplied: ${missing.join(', ')}.`);

  return {
    asOf: input.now.toISOString(),
    windowDays: WINDOW_DAYS,
    mrr: {
      payingSubscribers,
      byPlan,
      grossEur: round2(mrrGrossEur),
      netUsd: round2(mrrNetUsd),
      arpuNetUsd: perSubNet === null ? null : round2(perSubNet),
    },
    topUps30d: {
      grossEur: round2(topUpGrossEur),
      netUsd: round2(topUpNetUsd),
      packs,
      unmatchedGrants,
    },
    apiCost30d: {
      totalUsd: round2(totalUsd),
      done,
      failed,
      other,
      byTier,
      acquisitionBurnUsd: round2(burnUsd),
      perDoneVideoUsd: done.jobs > 0 ? round2(done.costUsd / done.jobs) : null,
      wastedShare: totalUsd > 0 ? failed.costUsd / totalUsd : null,
      costPer1kCreditsUsd: charged > 0 ? (totalUsd / charged) * 1000 : null,
    },
    fixed: { monthlyUsd: round2(fixedUsd), missing },
    monthly: {
      netRevenueUsd: round2(netRevenueUsd),
      variableCostUsd: round2(totalUsd),
      fixedCostUsd: round2(fixedUsd),
      contributionUsd: round2(contributionUsd),
      profitUsd: round2(profitUsd),
      revenueMultiple,
    },
    breakEven: {
      contributionPerSubscriberUsd: contributionPerSub === null ? null : round2(contributionPerSub),
      subscribersNeeded,
    },
    flags,
  };
}
