/**
 * Unit economics + MRR, pure. The CFO routine reads these numbers weekly:
 * what we collect, what the APIs cost, and what each video really costs against
 * the credits it burned. No I/O here; `scripts/finance-report.mts` feeds it.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;

export interface FinanceJob {
  status: string;
  modelTier: string;
  targetDurationSec: number;
  actualCredits: number;
  apiCostUsd: number;
  createdAt: Date;
}

export interface FinanceSubscription {
  planId: string;
  status: string;
}

export interface FinanceInput {
  now: Date;
  jobs: FinanceJob[];
  subscriptions: FinanceSubscription[];
  /** Credits ever granted by paid events in the window (monthly_grant + topup), for the burn ratio. */
  paidCreditsGranted: number;
  /** Top-up revenue in the window, gross EUR cents (from Stripe; 0 when unknown). */
  topUpGrossCents: number;
  /** Fixed monthly costs in USD (hosting, Supabase, domain, tools). Owner-supplied. */
  fixedMonthlyCostUsd: number;
  windowDays: number;
}

export interface TierEconomics {
  tier: string;
  videos: number;
  apiCostUsd: number;
  creditsBurned: number;
  avgCostPerVideoUsd: number | null;
  /** USD of API cost per 1,000 credits burned. */
  costPer1kCreditsUsd: number | null;
  avgSeconds: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  /** Gross MRR in EUR cents from live subscriptions at list price. */
  mrrGrossCents: number;
  /** MRR after VAT + Stripe fees, USD. */
  mrrNetUsd: number;
  payingSubscribers: number;
  byPlan: Array<{ plan: string; subscribers: number; mrrGrossCents: number }>;
  apiCostUsd: number;
  /** Cost of finished + failed jobs both: failed work is still spent money. */
  failedCostUsd: number;
  fixedMonthlyCostUsd: number;
  /** Window API cost scaled to 30 days, so it lines up with MRR. */
  apiCostPer30dUsd: number;
  /** MRR net − API cost (30d) − fixed costs. Can be negative pre-launch. */
  monthlyContributionUsd: number;
  /** apiCost30d / mrrNet. null when there is no MRR. */
  apiCostShareOfMrr: number | null;
  breakEvenSubscribers: number | null;
  tiers: TierEconomics[];
}

const LIVE = new Set(['active', 'trialing', 'past_due']);

export function computeFinance(i: FinanceInput): FinanceReport {
  const cutoff = i.now.getTime() - i.windowDays * DAY_MS;
  const jobs = i.jobs.filter((j) => j.createdAt.getTime() >= cutoff);

  const byPlanMap = new Map<string, { subscribers: number; cents: number }>();
  let mrrGrossCents = 0;
  let mrrNetUsd = 0;
  let payingSubscribers = 0;
  for (const s of i.subscriptions) {
    if (!LIVE.has(s.status)) continue;
    const plan = PLANS[s.planId as PlanId];
    if (!plan) continue;
    payingSubscribers += 1;
    mrrGrossCents += plan.priceCents;
    mrrNetUsd += netRevenueUsd(plan.priceCents);
    const row = byPlanMap.get(plan.id) ?? { subscribers: 0, cents: 0 };
    row.subscribers += 1;
    row.cents += plan.priceCents;
    byPlanMap.set(plan.id, row);
  }

  const apiCostUsd = jobs.reduce((n, j) => n + j.apiCostUsd, 0);
  const failedCostUsd = jobs
    .filter((j) => j.status === 'failed')
    .reduce((n, j) => n + j.apiCostUsd, 0);
  const apiCostPer30dUsd = (apiCostUsd / i.windowDays) * 30;

  const tierNames = [...new Set(jobs.map((j) => j.modelTier))].sort();
  const tiers: TierEconomics[] = tierNames.map((tier) => {
    const t = jobs.filter((j) => j.modelTier === tier && j.status === 'done');
    const cost = t.reduce((n, j) => n + j.apiCostUsd, 0);
    const credits = t.reduce((n, j) => n + j.actualCredits, 0);
    const secs = t.reduce((n, j) => n + j.targetDurationSec, 0);
    return {
      tier,
      videos: t.length,
      apiCostUsd: cost,
      creditsBurned: credits,
      avgCostPerVideoUsd: t.length ? cost / t.length : null,
      costPer1kCreditsUsd: credits ? (cost / credits) * 1000 : null,
      avgSeconds: t.length ? secs / t.length : null,
    };
  });

  const monthlyContributionUsd = mrrNetUsd - apiCostPer30dUsd - i.fixedMonthlyCostUsd;
  const avgNetPerSub = payingSubscribers ? mrrNetUsd / payingSubscribers : 0;
  const avgApiPerSub = payingSubscribers ? apiCostPer30dUsd / payingSubscribers : 0;
  const unitMargin = avgNetPerSub - avgApiPerSub;

  return {
    asOf: i.now.toISOString(),
    windowDays: i.windowDays,
    mrrGrossCents,
    mrrNetUsd,
    payingSubscribers,
    byPlan: [...byPlanMap].map(([plan, v]) => ({
      plan,
      subscribers: v.subscribers,
      mrrGrossCents: v.cents,
    })),
    apiCostUsd,
    failedCostUsd,
    fixedMonthlyCostUsd: i.fixedMonthlyCostUsd,
    apiCostPer30dUsd,
    monthlyContributionUsd,
    apiCostShareOfMrr: mrrNetUsd > 0 ? apiCostPer30dUsd / mrrNetUsd : null,
    breakEvenSubscribers: unitMargin > 0 ? Math.ceil(i.fixedMonthlyCostUsd / unitMargin) : null,
    tiers,
  };
}
