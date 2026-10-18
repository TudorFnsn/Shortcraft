/**
 * Finance math — MRR, realized API cost vs credits, and the cash picture.
 * Pure: `scripts/finance-report.mts` reads the rows and calls this.
 *
 * - **MRR** is the sum of live subscribers' plan prices (EUR, VAT inclusive as
 *   sold) and, net of VAT + Stripe fees, what we actually keep of it.
 * - **Realized cost** comes from `render_jobs.api_cost_usd` (what the
 *   orchestrator measured per call), not the catalog's list prices. The gap
 *   between the two is the first thing to look at when the margin moves.
 * - **Fixed costs** (hosting, Supabase, ElevenLabs plan, domain...) are not in
 *   the database; the owner keeps them in `docs/finance/costs.json`.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { REVENUE_ASSUMPTIONS, TARGET_MARGIN_MULTIPLE } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';

export interface FinanceSubscription extends SubscriptionSnapshot {
  userId: string;
}

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  actualCredits: number;
  estimatedCredits: number;
  apiCostUsd: number;
  createdAt: Date;
}

/** A positive ledger row that sold credits (`monthly_grant` or `topup`) or gave them away. */
export interface FinanceGrant {
  userId: string;
  reason: string;
  delta: number;
  createdAt: Date;
}

/** Monthly fixed costs in USD; `null` = the owner hasn't filled it in yet. */
export interface FixedCosts {
  items: Record<string, number | null>;
}

export interface FinanceInput {
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  grants: readonly FinanceGrant[];
  fixedCosts: FixedCosts;
  now: Date;
  /** Trailing window for the cost and top-up numbers, in days. */
  windowDays?: number;
}

export interface TierCost {
  tier: string;
  jobs: number;
  creditsBilled: number;
  apiCostUsd: number;
  /** USD of API cost per 1,000 credits billed; lower is better. */
  costPer1kCreditsUsd: number | null;
  avgCostPerJobUsd: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  mrrEur: number;
  /** MRR after VAT, Stripe percent + fixed fee per charge, in EUR. */
  netMrrEur: number;
  payingSubscribers: number;
  byPlan: { planId: string; subscribers: number; mrrEur: number }[];
  arpuEur: number | null;
  /** Top-up revenue in the window, EUR gross. */
  topUpRevenueEur: number;
  topUpPacksSold: number;
  /** Realized API cost over the window, USD. */
  apiCostUsd: number;
  byTier: TierCost[];
  /** Credits granted free (trial) in the window; they are the acquisition cost. */
  trialCreditsGranted: number;
  /** Net monthly revenue (subs + window top-ups) in USD over realized API cost; null if no cost yet. */
  realizedMarginMultiple: number | null;
  marginTargetMultiple: number;
  fixedCostsUsd: number;
  /** Fixed-cost lines the owner hasn't filled in, so the total is a lower bound. */
  missingFixedCosts: string[];
  /** Net revenue minus API cost minus fixed costs, USD per month. */
  monthlyContributionUsd: number;
  /** Paying subscribers needed (at the current mix) to cover fixed costs; null with no subscribers. */
  breakEvenSubscribers: number | null;
}

const round = (n: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
};

const cents = (c: number): number => c / 100;

/** What we keep of one EUR charge: minus VAT, then Stripe's percent + fixed fee. */
export function netOfCharge(grossEur: number): number {
  const { vatRate, stripePercentFee, stripeFixedFeeEur } = REVENUE_ASSUMPTIONS;
  const exVat = grossEur / (1 + vatRate);
  return exVat - grossEur * stripePercentFee - stripeFixedFeeEur;
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * 86_400_000;
  const inWindow = (d: Date) => d.getTime() >= since;
  const { usdPerEur } = REVENUE_ASSUMPTIONS;

  const plans = new Map<string, { subscribers: number; mrrEur: number }>();
  let netMrrEur = 0;
  let payingSubscribers = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    const priceEur = cents(PLANS[sub.planId].priceCents);
    const row = plans.get(sub.planId) ?? { subscribers: 0, mrrEur: 0 };
    row.subscribers += 1;
    row.mrrEur += priceEur;
    plans.set(sub.planId, row);
    netMrrEur += netOfCharge(priceEur);
    payingSubscribers += 1;
  }
  const mrrEur = [...plans.values()].reduce((s, p) => s + p.mrrEur, 0);

  // Top-ups: a grant row's credits identify the pack (credits are unique per pack).
  let topUpRevenueEur = 0;
  let netTopUpEur = 0;
  let topUpPacksSold = 0;
  let trialCreditsGranted = 0;
  for (const g of input.grants) {
    if (!inWindow(g.createdAt)) continue;
    if (g.reason === 'trial_grant') trialCreditsGranted += g.delta;
    if (g.reason !== 'topup') continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === g.delta);
    if (!pack) continue;
    topUpPacksSold += 1;
    topUpRevenueEur += cents(pack.priceCents);
    netTopUpEur += netOfCharge(cents(pack.priceCents));
  }

  const tiers = new Map<string, { jobs: number; credits: number; cost: number }>();
  let apiCostUsd = 0;
  for (const j of input.jobs) {
    if (!inWindow(j.createdAt)) continue;
    // Failed jobs are refunded, but the provider calls that ran were still paid for.
    apiCostUsd += j.apiCostUsd;
    if (j.status !== 'done') continue;
    const t = tiers.get(j.modelTier) ?? { jobs: 0, credits: 0, cost: 0 };
    t.jobs += 1;
    t.credits += j.actualCredits;
    t.cost += j.apiCostUsd;
    tiers.set(j.modelTier, t);
  }
  const byTier: TierCost[] = [...tiers.entries()].map(([tier, t]) => ({
    tier,
    jobs: t.jobs,
    creditsBilled: t.credits,
    apiCostUsd: round(t.cost, 4),
    costPer1kCreditsUsd: t.credits > 0 ? round((t.cost / t.credits) * 1000, 4) : null,
    avgCostPerJobUsd: t.jobs > 0 ? round(t.cost / t.jobs, 4) : null,
  }));

  const netRevenueUsd = (netMrrEur + netTopUpEur) * usdPerEur;
  const missingFixedCosts = Object.entries(input.fixedCosts.items)
    .filter(([, v]) => v === null)
    .map(([k]) => k);
  const fixedCostsUsd = Object.values(input.fixedCosts.items).reduce<number>(
    (s, v) => s + (v ?? 0),
    0,
  );
  const monthlyContributionUsd = netRevenueUsd - apiCostUsd - fixedCostsUsd;

  // Contribution per subscriber at the current mix = net sub revenue - API cost, per head.
  const perSubUsd =
    payingSubscribers > 0 ? (netMrrEur * usdPerEur - apiCostUsd) / payingSubscribers : null;

  return {
    asOf: input.now.toISOString(),
    windowDays,
    mrrEur: round(mrrEur),
    netMrrEur: round(netMrrEur),
    payingSubscribers,
    byPlan: [...plans.entries()].map(([planId, p]) => ({
      planId,
      subscribers: p.subscribers,
      mrrEur: round(p.mrrEur),
    })),
    arpuEur: payingSubscribers > 0 ? round(mrrEur / payingSubscribers) : null,
    topUpRevenueEur: round(topUpRevenueEur),
    topUpPacksSold,
    apiCostUsd: round(apiCostUsd, 4),
    byTier,
    trialCreditsGranted,
    realizedMarginMultiple: apiCostUsd > 0 ? round(netRevenueUsd / apiCostUsd) : null,
    marginTargetMultiple: TARGET_MARGIN_MULTIPLE,
    fixedCostsUsd: round(fixedCostsUsd),
    missingFixedCosts,
    monthlyContributionUsd: round(monthlyContributionUsd),
    breakEvenSubscribers:
      perSubUsd !== null && perSubUsd > 0 ? Math.ceil(fixedCostsUsd / perSubUsd) : null,
  };
}
