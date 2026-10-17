/**
 * FinOps metrics: MRR, 30-day API spend and cash margin, from data we already
 * store. Companion to `north-star.ts` (growth) for the FinOps routine
 * (`docs/routines/finops.md`).
 *
 * Pure: the caller loads rows (Supabase in `scripts/finops-report.mts`, fixtures
 * in tests) and passes `now`, so every number is reproducible.
 *
 * Definitions:
 * - **MRR:** live subscriptions on plans we sell, at list price. `net` is after
 *   VAT and Stripe fees (the same assumptions as the margin gate). Discounts and
 *   yearly prices aren't stored, so this is an upper-bound approximation.
 * - **Top-up revenue (window):** `topup` credit grants matched to a pack by size.
 * - **API cost (window):** `render_jobs.api_cost_usd` for jobs created in the
 *   window. Failed jobs still cost money (their spend is reported as waste).
 * - **Cash margin:** net revenue (MRR net + top-ups net) − API cost − fixed costs.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { TARGET_MARGIN_MULTIPLE } from '@/features/billing/margin';
import { DAY_MS } from './north-star';

export interface FinopsJob {
  status: string;
  modelTier: string;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface FinopsTopUp {
  credits: number;
  createdAt: Date;
}

export interface FinopsInput {
  subscriptions: SubscriptionSnapshot[];
  topUps: FinopsTopUp[];
  jobs: FinopsJob[];
  /** Monthly fixed costs in USD by line item (hosting, DB, email, ...). */
  fixedCostsUsd: Record<string, number>;
  now: Date;
  windowDays?: number;
}

export interface FinopsReport {
  asOf: string;
  windowDays: number;
  mrr: {
    subscribers: number;
    byPlan: Record<string, number>;
    grossEur: number;
    netUsd: number;
  };
  topUps: { count: number; netUsd: number; unmatched: number };
  revenueNetUsd: number;
  apiCostUsd: { total: number; byTier: Record<string, number>; wastedOnFailed: number };
  videos: { done: number; failed: number; avgCostPerDoneUsd: number | null };
  /** USD of API cost per 1,000 credits users actually spent (jobs in window). */
  costPer1kCreditsUsd: number | null;
  fixedCostsUsd: number;
  cashMarginUsd: number;
  /** Net revenue ÷ API cost; compared with the 3x gate. Null with no spend. */
  revenueToApiCost: number | null;
  alerts: string[];
}

const round = (n: number, dp = 4) => Number(n.toFixed(dp));

export function computeFinops(input: FinopsInput): FinopsReport {
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * DAY_MS;
  const inWindow = (d: Date) => d.getTime() >= since && d.getTime() <= input.now.getTime();

  const byPlan: Record<string, number> = {};
  let grossCents = 0;
  let mrrNet = 0;
  for (const sub of input.subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    byPlan[sub.planId] = (byPlan[sub.planId] ?? 0) + 1;
    grossCents += PLANS[sub.planId].priceCents;
    mrrNet += netRevenueUsd(PLANS[sub.planId].priceCents);
  }
  const subscribers = Object.values(byPlan).reduce((a, b) => a + b, 0);

  let topUpNet = 0;
  let topUpCount = 0;
  let unmatched = 0;
  for (const t of input.topUps.filter((x) => inWindow(x.createdAt))) {
    const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
    if (!pack) {
      unmatched += 1;
      continue;
    }
    topUpCount += 1;
    topUpNet += netRevenueUsd(pack.priceCents);
  }

  const jobs = input.jobs.filter((j) => inWindow(j.createdAt));
  const byTier: Record<string, number> = {};
  let total = 0;
  let wasted = 0;
  let done = 0;
  let failed = 0;
  let doneCost = 0;
  let credits = 0;
  for (const j of jobs) {
    total += j.apiCostUsd;
    byTier[j.modelTier] = (byTier[j.modelTier] ?? 0) + j.apiCostUsd;
    credits += j.actualCredits;
    if (j.status === 'done') {
      done += 1;
      doneCost += j.apiCostUsd;
    } else if (j.status === 'failed') {
      failed += 1;
      wasted += j.apiCostUsd;
    }
  }

  const fixed = Object.values(input.fixedCostsUsd).reduce((a, b) => a + b, 0);
  const revenueNet = mrrNet + topUpNet;
  const cashMargin = revenueNet - total - fixed;
  const ratio = total > 0 ? revenueNet / total : null;

  const alerts: string[] = [];
  if (ratio !== null && ratio < TARGET_MARGIN_MULTIPLE)
    alerts.push(
      `revenue/API cost is ${ratio.toFixed(2)}x, below the ${TARGET_MARGIN_MULTIPLE}x gate`,
    );
  if (cashMargin < 0) alerts.push(`cash margin is negative ($${cashMargin.toFixed(2)})`);
  if (total > 0 && wasted / total > 0.1)
    alerts.push(`${Math.round((wasted / total) * 100)}% of API spend went to failed jobs`);
  if (unmatched > 0) alerts.push(`${unmatched} top-up grant(s) match no pack in TOPUP_PACKS`);

  return {
    asOf: input.now.toISOString(),
    windowDays,
    mrr: { subscribers, byPlan, grossEur: round(grossCents / 100, 2), netUsd: round(mrrNet, 2) },
    topUps: { count: topUpCount, netUsd: round(topUpNet, 2), unmatched },
    revenueNetUsd: round(revenueNet, 2),
    apiCostUsd: {
      total: round(total),
      byTier: Object.fromEntries(Object.entries(byTier).map(([k, v]) => [k, round(v)])),
      wastedOnFailed: round(wasted),
    },
    videos: { done, failed, avgCostPerDoneUsd: done > 0 ? round(doneCost / done) : null },
    costPer1kCreditsUsd: credits > 0 ? round((total / credits) * 1000) : null,
    fixedCostsUsd: round(fixed, 2),
    cashMarginUsd: round(cashMargin, 2),
    revenueToApiCost: ratio === null ? null : round(ratio, 2),
    alerts,
  };
}
