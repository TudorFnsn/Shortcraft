/**
 * Finance report math: MRR, cash collected, API spend and gross margin.
 * Pure: takes plain rows, returns numbers. `scripts/finance-report.mts` feeds it
 * from Supabase; the CFO routine reads the result. Revenue is net of VAT and
 * Stripe fees using the same assumptions as the margin gate.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;

export interface FinanceInput {
  now: Date;
  /** Window for cash and spend, in days (default 30). */
  windowDays?: number;
  subscriptions: ReadonlyArray<{ planId: string; status: string }>;
  /** Paid top-ups: credits granted and when. */
  topups: ReadonlyArray<{ credits: number; createdAt: Date }>;
  /** Paid subscription grants (monthly_grant ledger rows). */
  monthlyGrants: ReadonlyArray<{ credits: number; createdAt: Date }>;
  jobs: ReadonlyArray<{
    status: string;
    createdAt: Date;
    apiCostUsd: number;
    actualCredits: number;
    modelTier: string;
  }>;
  assumptions?: RevenueAssumptions;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  /** Net monthly recurring revenue, USD (live subscriptions only). */
  mrrNetUsd: number;
  mrrGrossEur: number;
  payingSubscribers: number;
  arpuNetUsd: number | null;
  subscribersByPlan: Record<string, number>;
  /** Net top-up revenue inside the window, USD. */
  topupNetUsd: number;
  apiSpendUsd: number;
  videosDone: number;
  videosFailed: number;
  /** API spend ÷ finished videos (failed jobs' spend included: it is real cost). */
  costPerVideoUsd: number | null;
  /** Credits metered per finished video. */
  creditsPerVideo: number | null;
  /** API USD per 1,000 credits metered: compare with the revenue per 1,000 credits. */
  costPer1kCreditsUsd: number | null;
  /** Net revenue per 1,000 credits sold (subscription + top-ups, window). */
  revenuePer1kCreditsUsd: number | null;
  grossMarginPct: number | null;
  /** Credits granted but not yet metered in the window ("breakage" = free margin, a liability if refunded). */
  creditsGranted: number;
  creditsMetered: number;
}

const round = (n: number, d = 2) => Number(n.toFixed(d));

/** One EUR (VAT-inclusive) charge → net USD after VAT and Stripe's fee. */
export function netUsd(grossEur: number, a: RevenueAssumptions = REVENUE_ASSUMPTIONS): number {
  const exVat = grossEur / (1 + a.vatRate);
  const afterFee = grossEur * a.stripePercentFee + a.stripeFixedFeeEur;
  return Math.max(0, (exVat - afterFee) * a.usdPerEur);
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= since;

  const subscribersByPlan: Record<string, number> = {};
  let mrrGrossEur = 0;
  let mrrNetUsd = 0;
  let payingSubscribers = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    const plan = PLANS[s.planId];
    payingSubscribers += 1;
    subscribersByPlan[s.planId] = (subscribersByPlan[s.planId] ?? 0) + 1;
    mrrGrossEur += plan.priceCents / 100;
    mrrNetUsd += netUsd(plan.priceCents / 100, a);
  }

  let topupNetUsd = 0;
  let creditsGranted = 0;
  for (const t of input.topups.filter((x) => inWindow(x.createdAt))) {
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (pack) topupNetUsd += netUsd(pack.priceCents / 100, a);
    creditsGranted += t.credits;
  }
  for (const g of input.monthlyGrants.filter((x) => inWindow(x.createdAt))) {
    creditsGranted += g.credits;
  }

  const jobs = input.jobs.filter((j) => inWindow(j.createdAt));
  const done = jobs.filter((j) => j.status === 'done');
  const apiSpendUsd = jobs.reduce((s, j) => s + j.apiCostUsd, 0);
  const creditsMetered = jobs.reduce((s, j) => s + j.actualCredits, 0);

  const revenue = mrrNetUsd + topupNetUsd;
  return {
    asOf: input.now.toISOString(),
    windowDays,
    mrrNetUsd: round(mrrNetUsd),
    mrrGrossEur: round(mrrGrossEur),
    payingSubscribers,
    arpuNetUsd: payingSubscribers ? round(mrrNetUsd / payingSubscribers) : null,
    subscribersByPlan,
    topupNetUsd: round(topupNetUsd),
    apiSpendUsd: round(apiSpendUsd, 4),
    videosDone: done.length,
    videosFailed: jobs.filter((j) => j.status === 'failed').length,
    costPerVideoUsd: done.length ? round(apiSpendUsd / done.length, 4) : null,
    creditsPerVideo: done.length ? Math.round(creditsMetered / done.length) : null,
    costPer1kCreditsUsd: creditsMetered ? round((apiSpendUsd / creditsMetered) * 1000, 4) : null,
    revenuePer1kCreditsUsd: creditsGranted ? round((revenue / creditsGranted) * 1000, 4) : null,
    grossMarginPct: revenue > 0 ? round(((revenue - apiSpendUsd) / revenue) * 100, 1) : null,
    creditsGranted,
    creditsMetered,
  };
}
