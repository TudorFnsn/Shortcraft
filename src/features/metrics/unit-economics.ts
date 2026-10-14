/**
 * Unit economics from the render ledger: what videos cost us in API spend versus
 * the recurring revenue behind them. Pure, so scripts/finance-report.mts and the
 * tests share the math. Revenue uses the margin gate's net-of-VAT-and-fees rules.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';

export interface JobRow {
  status: string;
  modelTier: string;
  chargedCredits: number;
  apiCostUsd: number;
  createdAt: Date;
}

export interface SubscriptionRow {
  planId: string;
  status: string;
}

export interface TierEconomics {
  tier: string;
  done: number;
  avgApiCostUsd: number;
  avgCredits: number;
  /** API cost per 1,000 credits burned: compare with net revenue per 1,000 credits. */
  apiCostPer1kCredits: number;
}

export interface UnitEconomics {
  windowDays: number;
  /** Gross recurring revenue from live subscriptions, EUR (VAT included). */
  mrrEur: number;
  /** Same, after VAT and Stripe fees, in USD. */
  netMrrUsd: number;
  payingSubscribers: number;
  arpuNetUsd: number;
  apiSpendUsd: number;
  /** API spend on jobs that never finished: pure waste when not refunded. */
  failedApiSpendUsd: number;
  grossMarginPct: number | null;
  /** Net MRR / API spend over the window, scaled to 30 days. The 3x gate in prod terms. */
  revenueToCostMultiple: number | null;
  tiers: TierEconomics[];
}

const LIVE = new Set(['active', 'trialing', 'past_due']);
const round = (n: number, d = 4) => Math.round(n * 10 ** d) / 10 ** d;

export function netUsdFromEur(grossEur: number, a: RevenueAssumptions = REVENUE_ASSUMPTIONS) {
  const net = grossEur / (1 + a.vatRate) - (grossEur * a.stripePercentFee + a.stripeFixedFeeEur);
  return net * a.usdPerEur;
}

export function computeUnitEconomics(input: {
  now: Date;
  windowDays: number;
  jobs: readonly JobRow[];
  subscriptions: readonly SubscriptionRow[];
}): UnitEconomics {
  const since = input.now.getTime() - input.windowDays * 86_400_000;
  const jobs = input.jobs.filter((j) => j.createdAt.getTime() >= since);

  let mrrEur = 0;
  let netMrrUsd = 0;
  let paying = 0;
  for (const s of input.subscriptions) {
    const plan = PLANS[s.planId as PlanId];
    if (!plan || !LIVE.has(s.status)) continue;
    const eur = plan.priceCents / 100;
    mrrEur += eur;
    netMrrUsd += netUsdFromEur(eur);
    paying += 1;
  }

  const apiSpendUsd = jobs.reduce((n, j) => n + j.apiCostUsd, 0);
  const failedApiSpendUsd = jobs
    .filter((j) => j.status === 'failed')
    .reduce((n, j) => n + j.apiCostUsd, 0);

  const tiers = [...new Set(jobs.map((j) => j.modelTier))].sort().map((tier): TierEconomics => {
    const done = jobs.filter((j) => j.modelTier === tier && j.status === 'done');
    const credits = done.reduce((n, j) => n + j.chargedCredits, 0);
    const cost = done.reduce((n, j) => n + j.apiCostUsd, 0);
    return {
      tier,
      done: done.length,
      avgApiCostUsd: done.length ? round(cost / done.length) : 0,
      avgCredits: done.length ? Math.round(credits / done.length) : 0,
      apiCostPer1kCredits: credits ? round((cost / credits) * 1000) : 0,
    };
  });

  const monthlySpend = apiSpendUsd * (30 / input.windowDays);
  return {
    windowDays: input.windowDays,
    mrrEur: round(mrrEur, 2),
    netMrrUsd: round(netMrrUsd, 2),
    payingSubscribers: paying,
    arpuNetUsd: paying ? round(netMrrUsd / paying, 2) : 0,
    apiSpendUsd: round(apiSpendUsd, 2),
    failedApiSpendUsd: round(failedApiSpendUsd, 2),
    grossMarginPct: netMrrUsd ? round(((netMrrUsd - monthlySpend) / netMrrUsd) * 100, 1) : null,
    revenueToCostMultiple: monthlySpend ? round(netMrrUsd / monthlySpend, 2) : null,
    tiers,
  };
}
