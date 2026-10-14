/**
 * Finance report math: MRR, realized variable cost and contribution margin.
 * Pure (data in, numbers out) so it is tested; `scripts/finance-report.mts`
 * feeds it read-only rows from Supabase. Revenue is what we keep after VAT and
 * Stripe fees (`netRevenueUsd`), the same basis as the margin gate.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { netRevenueUsd, TARGET_MARGIN_MULTIPLE } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;
export const WINDOW_DAYS = 30;

export interface FinanceInput {
  now: Date;
  subscriptions: { planId: string; status: string }[];
  /** Top-up grants in the ledger (`credit_transactions` reason `topup`). */
  topups: { credits: number; createdAt: Date }[];
  jobs: { status: string; createdAt: Date; chargedCredits: number; apiCostUsd: number }[];
  /** Hosting, Supabase, ElevenLabs plan, Resend, Sentry... per month, in USD. */
  fixedCostsUsdMonthly: number;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  /** Live subscribers by plan id. */
  subscribers: Record<string, number>;
  mrrGrossEur: number;
  mrrNetUsd: number;
  topupNetUsd: number;
  revenueNetUsd: number;
  apiCostUsd: number;
  fixedCostsUsd: number;
  contributionUsd: number;
  profitUsd: number;
  /** Net revenue / API cost; the margin gate wants >= TARGET_MARGIN_MULTIPLE. */
  revenueToApiCost: number | null;
  /** Net revenue / (API + fixed); below 1 = losing money. */
  revenueToTotalCost: number | null;
  finishedVideos: number;
  failedJobs: number;
  apiCostPerFinishedVideoUsd: number | null;
  /** API cost that produced no video (failed jobs): pure waste. */
  failedJobApiCostUsd: number;
  creditsCharged: number;
  apiCostPerCreditUsd: number | null;
  /** Fixed cost each live subscriber must cover before any profit. */
  fixedCostPerSubscriberUsd: number | null;
  meetsTarget: boolean;
}

const LIVE = new Set(['active', 'trialing', 'past_due']);
const ratio = (n: number, d: number) => (d > 0 ? n / d : null);

export function computeFinance(input: FinanceInput): FinanceReport {
  const since = input.now.getTime() - WINDOW_DAYS * DAY_MS;
  const subscribers: Record<string, number> = {};
  let mrrGrossEur = 0;
  let mrrNetUsd = 0;
  for (const s of input.subscriptions) {
    const plan = PLANS[s.planId as keyof typeof PLANS];
    if (!plan || !LIVE.has(s.status)) continue;
    subscribers[plan.id] = (subscribers[plan.id] ?? 0) + 1;
    mrrGrossEur += plan.priceCents / 100;
    mrrNetUsd += netRevenueUsd(plan.priceCents);
  }

  let topupNetUsd = 0;
  for (const t of input.topups) {
    if (t.createdAt.getTime() < since) continue;
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (pack) topupNetUsd += netRevenueUsd(pack.priceCents);
  }

  let apiCostUsd = 0;
  let failedJobApiCostUsd = 0;
  let finishedVideos = 0;
  let failedJobs = 0;
  let creditsCharged = 0;
  for (const j of input.jobs) {
    if (j.createdAt.getTime() < since) continue;
    apiCostUsd += j.apiCostUsd;
    creditsCharged += j.chargedCredits;
    if (j.status === 'done') finishedVideos += 1;
    if (j.status === 'failed') {
      failedJobs += 1;
      failedJobApiCostUsd += j.apiCostUsd;
    }
  }

  const revenueNetUsd = mrrNetUsd + topupNetUsd;
  const fixedCostsUsd = input.fixedCostsUsdMonthly;
  const subscriberCount = Object.values(subscribers).reduce((a, b) => a + b, 0);
  const revenueToApiCost = ratio(revenueNetUsd, apiCostUsd);
  return {
    asOf: input.now.toISOString(),
    windowDays: WINDOW_DAYS,
    subscribers,
    mrrGrossEur,
    mrrNetUsd,
    topupNetUsd,
    revenueNetUsd,
    apiCostUsd,
    fixedCostsUsd,
    contributionUsd: revenueNetUsd - apiCostUsd,
    profitUsd: revenueNetUsd - apiCostUsd - fixedCostsUsd,
    revenueToApiCost,
    revenueToTotalCost: ratio(revenueNetUsd, apiCostUsd + fixedCostsUsd),
    finishedVideos,
    failedJobs,
    apiCostPerFinishedVideoUsd: ratio(apiCostUsd, finishedVideos),
    failedJobApiCostUsd,
    creditsCharged,
    apiCostPerCreditUsd: ratio(apiCostUsd, creditsCharged),
    fixedCostPerSubscriberUsd: ratio(fixedCostsUsd, subscriberCount),
    meetsTarget: revenueToApiCost === null || revenueToApiCost >= TARGET_MARGIN_MULTIPLE,
  };
}
