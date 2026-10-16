/**
 * Unit economics — MRR, API spend and gross margin from rows we already store.
 *
 * Pure: takes plain rows, returns numbers, so the Finance routine's report
 * (`scripts/finance-report.mts`) and the tests share one definition.
 *
 * MRR counts live subscriptions only (same rule as plan gating) at the plan's
 * list price, net of VAT. It ignores top-ups (one-off) and discounts: it is a
 * steady-state estimate, not an accounting figure. Real cash comes from Stripe.
 */
import { PLANS } from '@/config/plans';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';
import { isLiveSubscription } from '@/features/billing/entitlements';

export interface SubscriptionRow {
  userId: string;
  planId: string;
  status: string;
}

export interface JobCostRow {
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  chargedCredits: number;
}

export interface UnitEconomics {
  payingSubscribers: number;
  /** Net MRR in USD (after VAT and Stripe fees). */
  mrrNetUsd: number;
  /** Gross MRR in EUR (what customers pay, VAT included). */
  mrrGrossEur: number;
  /** API spend in the trailing 30 days, USD. */
  apiCost30dUsd: number;
  videos30d: number;
  avgCostPerVideoUsd: number;
  /** Credits metered per API dollar over 30 days (higher = we charge more per cost). */
  creditsPerApiUsd: number;
  /** Net MRR ÷ 30-day API spend; null with no spend. */
  mrrToCostMultiple: number | null;
  /** (net MRR − API spend) ÷ net MRR; null with no MRR. */
  grossMargin: number | null;
  /** API spend by tier over 30 days. */
  costByTier: Record<string, number>;
}

const DAY_MS = 86_400_000;

/** Net USD per month from one EUR-priced subscription, as `margin.ts` assumes. */
export function netMonthlyUsd(priceCents: number): number {
  const a = REVENUE_ASSUMPTIONS;
  const gross = priceCents / 100;
  const afterVat = gross / (1 + a.vatRate);
  const afterFees = afterVat - gross * a.stripePercentFee - a.stripeFixedFeeEur;
  return afterFees * a.usdPerEur;
}

export function computeUnitEconomics(input: {
  now: Date;
  subscriptions: readonly SubscriptionRow[];
  jobs: readonly JobCostRow[];
}): UnitEconomics {
  const live = input.subscriptions.filter(isLiveSubscription);
  let mrrNetUsd = 0;
  let mrrGrossEur = 0;
  for (const s of live) {
    const plan = PLANS[s.planId as keyof typeof PLANS];
    mrrNetUsd += netMonthlyUsd(plan.priceCents);
    mrrGrossEur += plan.priceCents / 100;
  }

  const since = input.now.getTime() - 30 * DAY_MS;
  const recent = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const costByTier: Record<string, number> = {};
  let apiCost30dUsd = 0;
  let credits = 0;
  for (const j of recent) {
    apiCost30dUsd += j.apiCostUsd;
    credits += j.chargedCredits;
    costByTier[j.modelTier] = (costByTier[j.modelTier] ?? 0) + j.apiCostUsd;
  }
  const videos30d = recent.filter((j) => j.status === 'done').length;

  return {
    payingSubscribers: live.length,
    mrrNetUsd,
    mrrGrossEur,
    apiCost30dUsd,
    videos30d,
    avgCostPerVideoUsd: videos30d ? apiCost30dUsd / videos30d : 0,
    creditsPerApiUsd: apiCost30dUsd ? credits / apiCost30dUsd : 0,
    mrrToCostMultiple: apiCost30dUsd ? mrrNetUsd / apiCost30dUsd : null,
    grossMargin: mrrNetUsd ? (mrrNetUsd - apiCost30dUsd) / mrrNetUsd : null,
    costByTier,
  };
}
