/**
 * Unit economics: MRR against real spend, from rows the app already stores.
 *
 * MRR counts live subscriptions at their plan price (gross, EUR) and the net
 * figure after VAT + Stripe fees, using the same assumptions as the margin
 * gate. Spend is `render_jobs.api_cost_usd` (metered per job) plus the fixed
 * monthly bills the owner supplies (hosting, database, ElevenLabs plan, ...),
 * which the database cannot know. Pure: no I/O.
 */
import { PLANS } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { netRevenueUsd } from '@/features/billing/margin';

export interface FinanceJob {
  status: string;
  modelTier: string;
  targetDurationSec: number;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface FinanceSub {
  planId: string;
  status: string;
}

export interface FixedCost {
  name: string;
  usdPerMonth: number;
}

export interface TierEconomics {
  tier: string;
  videos: number;
  apiCostUsd: number;
  avgCostUsd: number;
  avgCostPerSecUsd: number | null;
  creditsCharged: number;
  /** Credits charged per USD of API cost; the pricing markup actually realised. */
  creditsPerUsd: number | null;
}

export interface FinanceReport {
  windowDays: number;
  payingSubscribers: number;
  mrrGrossEur: number;
  mrrNetUsd: number;
  videosDone: number;
  videosFailed: number;
  apiCostUsd: number;
  /** API cost of failed jobs: money spent with nothing delivered. */
  wastedApiCostUsd: number;
  fixedCostsUsd: number;
  totalCostUsd: number;
  /** Net MRR minus API and fixed costs for the window. */
  profitUsd: number;
  /** Net MRR / total cost. null when nothing was spent. */
  mrrToCost: number | null;
  /** (net MRR - API cost) / net MRR. null when there is no MRR. */
  grossMargin: number | null;
  apiCostPerVideoUsd: number | null;
  tiers: TierEconomics[];
}

const DAY_MS = 86_400_000;
const round = (n: number, dp = 4) => Number(n.toFixed(dp));

export function computeFinance(input: {
  now: Date;
  windowDays: number;
  jobs: readonly FinanceJob[];
  subscriptions: readonly FinanceSub[];
  fixedCosts?: readonly FixedCost[];
}): FinanceReport {
  const since = input.now.getTime() - input.windowDays * DAY_MS;
  const jobs = input.jobs.filter((j) => j.createdAt.getTime() >= since);

  let mrrGrossEur = 0;
  let mrrNetUsd = 0;
  let paying = 0;
  for (const s of input.subscriptions) {
    if (!isLiveSubscription(s)) continue;
    paying += 1;
    mrrGrossEur += PLANS[s.planId].priceCents / 100;
    mrrNetUsd += netRevenueUsd(PLANS[s.planId].priceCents);
  }

  const done = jobs.filter((j) => j.status === 'done');
  const failed = jobs.filter((j) => j.status === 'failed');
  const apiCostUsd = jobs.reduce((sum, j) => sum + j.apiCostUsd, 0);
  const wasted = failed.reduce((sum, j) => sum + j.apiCostUsd, 0);
  // Fixed bills are monthly; scale them to the window being reported.
  const fixedCostsUsd =
    ((input.fixedCosts ?? []).reduce((sum, c) => sum + c.usdPerMonth, 0) * input.windowDays) / 30;
  // Revenue is monthly too, so compare it with a 30-day cost run rate.
  const scale = 30 / input.windowDays;
  const monthlyCost = (apiCostUsd + fixedCostsUsd) * scale;

  const byTier = new Map<string, FinanceJob[]>();
  for (const j of done) byTier.set(j.modelTier, [...(byTier.get(j.modelTier) ?? []), j]);
  const tiers = [...byTier.entries()].map(([tier, rows]): TierEconomics => {
    const cost = rows.reduce((s, j) => s + j.apiCostUsd, 0);
    const secs = rows.reduce((s, j) => s + j.targetDurationSec, 0);
    const credits = rows.reduce((s, j) => s + j.actualCredits, 0);
    return {
      tier,
      videos: rows.length,
      apiCostUsd: round(cost),
      avgCostUsd: round(cost / rows.length),
      avgCostPerSecUsd: secs > 0 ? round(cost / secs) : null,
      creditsCharged: credits,
      creditsPerUsd: cost > 0 ? Math.round(credits / cost) : null,
    };
  });

  return {
    windowDays: input.windowDays,
    payingSubscribers: paying,
    mrrGrossEur: round(mrrGrossEur, 2),
    mrrNetUsd: round(mrrNetUsd, 2),
    videosDone: done.length,
    videosFailed: failed.length,
    apiCostUsd: round(apiCostUsd),
    wastedApiCostUsd: round(wasted),
    fixedCostsUsd: round(fixedCostsUsd, 2),
    totalCostUsd: round(apiCostUsd + fixedCostsUsd, 2),
    profitUsd: round(mrrNetUsd - monthlyCost, 2),
    mrrToCost: monthlyCost > 0 ? round(mrrNetUsd / monthlyCost, 2) : null,
    grossMargin: mrrNetUsd > 0 ? round((mrrNetUsd - apiCostUsd * scale) / mrrNetUsd, 3) : null,
    apiCostPerVideoUsd: done.length > 0 ? round(apiCostUsd / done.length) : null,
    tiers,
  };
}
