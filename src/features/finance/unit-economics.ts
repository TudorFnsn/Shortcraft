/**
 * Unit economics from data we already store: MRR, realised API cost per
 * finished video, gross margin and credit breakage. Read by the Finance CFO
 * routine (`FinancePlan.md`) through `scripts/finance-report.mts`.
 *
 * Pure: the caller loads rows and passes `now`, so every number is reproducible.
 * Money is USD, net of VAT and Stripe's fee (same `REVENUE_ASSUMPTIONS` as the
 * margin gate), so "margin" here is comparable with the gate's multiples.
 *
 * Known gaps (the routine reports them, it does not guess): `api_cost_usd` is a
 * per-job total with no per-provider split or token counts, hosting/SaaS bills
 * are not in the DB, and annual plans are not modelled.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';

export const DAY_MS = 86_400_000;

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  estimatedCredits: number;
  actualCredits: number;
  targetDurationSec: number;
}

export interface FinanceSub extends SubscriptionSnapshot {
  userId: string;
}

export interface FinanceInput {
  now: Date;
  jobs: readonly FinanceJob[];
  subscriptions: readonly FinanceSub[];
  /** Credits ever granted by paid sources (monthly_grant + topup) in the window, by user. */
  paidGrantCredits: number;
  /** Net top-up revenue is unknown without Stripe; callers pass what the ledger shows. */
  topUpRevenueUsd?: number;
  /** Fixed monthly bills we know about (hosting, DB, email, monitoring), USD. */
  fixedMonthlyCostsUsd?: number;
  windowDays?: number;
  assumptions?: RevenueAssumptions;
}

/** Net USD we keep from one monthly charge of `priceCents` (EUR, VAT-inclusive). */
export function netMonthlyUsd(priceCents: number, a: RevenueAssumptions): number {
  const gross = priceCents / 100;
  const exVat = gross / (1 + a.vatRate);
  const fee = gross * a.stripePercentFee + a.stripeFixedFeeEur;
  return Math.max(0, (exVat - fee) * a.usdPerEur);
}

export interface TierEconomics {
  tier: string;
  finished: number;
  failed: number;
  apiCostUsd: number;
  avgCostPerFinishedUsd: number;
  /** Cost of failed jobs: money spent on videos nobody received. */
  wastedCostUsd: number;
  creditsCharged: number;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  mrrNetUsd: number;
  arrNetUsd: number;
  payingSubscribers: number;
  subscribersByPlan: Record<PlanId, number>;
  arpuNetUsd: number;
  apiCostUsd: number;
  topUpRevenueUsd: number;
  /** MRR scaled to the window + top-ups, minus API and fixed costs. */
  grossMarginUsd: number;
  grossMarginPct: number | null;
  /** Net revenue ÷ API cost over the window; the margin gate's 3x, measured. */
  realisedMultiple: number | null;
  /** Share of API spend that went to non-paying users (trial burn + free tier). */
  freeUserCostShare: number | null;
  /** Credits charged on finished jobs ÷ credits granted by paid sources. */
  creditUtilisation: number | null;
  tiers: TierEconomics[];
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * DAY_MS;

  const subsByPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  const payingUsers = new Set<string>();
  let mrr = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    subsByPlan[s.planId] += 1;
    payingUsers.add(s.userId);
    mrr += netMonthlyUsd(PLANS[s.planId].priceCents, a);
  }

  const jobs = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const byTier = new Map<string, TierEconomics>();
  let apiCost = 0;
  let freeCost = 0;
  let creditsOnDone = 0;
  for (const j of jobs) {
    const t =
      byTier.get(j.modelTier) ??
      ({
        tier: j.modelTier,
        finished: 0,
        failed: 0,
        apiCostUsd: 0,
        avgCostPerFinishedUsd: 0,
        wastedCostUsd: 0,
        creditsCharged: 0,
      } satisfies TierEconomics);
    t.apiCostUsd += j.apiCostUsd;
    if (j.status === 'done') {
      t.finished += 1;
      t.creditsCharged += j.actualCredits;
      creditsOnDone += j.actualCredits;
    } else if (j.status === 'failed') {
      t.failed += 1;
      t.wastedCostUsd += j.apiCostUsd;
    }
    byTier.set(j.modelTier, t);
    apiCost += j.apiCostUsd;
    if (!payingUsers.has(j.userId)) freeCost += j.apiCostUsd;
  }
  const tiers = [...byTier.values()].map((t) => ({
    ...t,
    avgCostPerFinishedUsd: t.finished ? t.apiCostUsd / t.finished : 0,
  }));

  const revenue = (mrr * windowDays) / 30 + (input.topUpRevenueUsd ?? 0);
  const fixed = ((input.fixedMonthlyCostsUsd ?? 0) * windowDays) / 30;
  const margin = revenue - apiCost - fixed;

  return {
    asOf: input.now.toISOString(),
    windowDays,
    mrrNetUsd: mrr,
    arrNetUsd: mrr * 12,
    payingSubscribers: payingUsers.size,
    subscribersByPlan: subsByPlan,
    arpuNetUsd: payingUsers.size ? mrr / payingUsers.size : 0,
    apiCostUsd: apiCost,
    topUpRevenueUsd: input.topUpRevenueUsd ?? 0,
    grossMarginUsd: margin,
    grossMarginPct: revenue > 0 ? margin / revenue : null,
    realisedMultiple: apiCost > 0 ? revenue / apiCost : null,
    freeUserCostShare: apiCost > 0 ? freeCost / apiCost : null,
    creditUtilisation: input.paidGrantCredits > 0 ? creditsOnDone / input.paidGrantCredits : null,
    tiers,
  };
}
