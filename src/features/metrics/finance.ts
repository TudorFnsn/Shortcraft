/**
 * Finance metrics for the Finance CEO routine: MRR, what a video actually
 * costs us, and how much cash is left after COGS. Same shape as `north-star.ts`:
 * pure, the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`.
 *
 * Definitions:
 * - **MRR:** sum of the monthly list price of every live subscription on a plan
 *   we sell, converted to USD and net of VAT. Yearly billing isn't sold yet; when
 *   it is, divide the yearly price by 12 here.
 * - **COGS:** `render_jobs.api_cost_usd` of jobs created in the window (failed
 *   jobs included: we paid the provider even when the user was refunded).
 * - **Cost per video:** COGS of `done` jobs ÷ number of `done` jobs, split by tier.
 * - **Cash actually collected** (charges, refunds, disputes) comes from Stripe via
 *   the connector; this module only has what the database stores.
 */
import { REVENUE_ASSUMPTIONS, type RevenueAssumptions } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { PLANS } from '@/config/plans';

export const DAY_MS = 86_400_000;

export interface FinanceSubscription extends SubscriptionSnapshot {
  userId: string;
}

export interface FinanceJob {
  status: string;
  modelTier: string;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface FinanceInput {
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  now: Date;
  /** Days of jobs to include in the cost side. Default 30. */
  windowDays?: number;
  assumptions?: RevenueAssumptions;
}

export interface TierCost {
  tier: string;
  videos: number;
  avgCostUsd: number | null;
  avgCredits: number | null;
  /** API cost per 1,000 credits charged (null when no credits were charged). */
  costUsdPer1kCredits: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  /** Subscribers per plan id. */
  planMix: Record<string, number>;
  mrrUsd: number;
  /** MRR after Stripe fees, the cash we actually keep before COGS. */
  mrrNetOfFeesUsd: number;
  arpuUsd: number | null;
  cogsUsd: number;
  /** COGS spent on jobs that ended `failed` (paid to providers, refunded to users). */
  failedCogsUsd: number;
  jobs: { total: number; done: number; failed: number };
  byTier: TierCost[];
  /**
   * Window COGS scaled to a month, and the share of MRR it eats. Null when
   * there is no MRR to compare against.
   */
  monthlyCogsUsd: number;
  cogsShareOfMrr: number | null;
  /** MRR ÷ monthly COGS (the "MRR ratio"); null when COGS is zero. */
  mrrToCogs: number | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Monthly consumer price (EUR cents, VAT included) → USD net of VAT. */
export function netMonthlyUsd(priceCents: number, a: RevenueAssumptions): number {
  return (priceCents / 100 / (1 + a.vatRate)) * a.usdPerEur;
}

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const windowDays = input.windowDays ?? 30;
  const since = input.now.getTime() - windowDays * DAY_MS;

  const planMix: Record<string, number> = {};
  let mrr = 0;
  let fees = 0;
  let subscribers = 0;
  for (const sub of input.subscriptions) {
    const plan = Object.values(PLANS).find((p) => p.id === sub.planId);
    if (!plan || !isLiveSubscription(sub)) continue;
    subscribers += 1;
    planMix[plan.id] = (planMix[plan.id] ?? 0) + 1;
    mrr += netMonthlyUsd(plan.priceCents, a);
    fees +=
      (plan.priceCents / 100) * a.stripePercentFee * a.usdPerEur +
      a.stripeFixedFeeEur * a.usdPerEur;
  }

  const jobs = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const done = jobs.filter((j) => j.status === 'done');
  const failed = jobs.filter((j) => j.status === 'failed');
  const cogs = jobs.reduce((s, j) => s + j.apiCostUsd, 0);
  const failedCogs = failed.reduce((s, j) => s + j.apiCostUsd, 0);

  const tiers = [...new Set(done.map((j) => j.modelTier))].sort();
  const byTier: TierCost[] = tiers.map((tier) => {
    const rows = done.filter((j) => j.modelTier === tier);
    const cost = rows.reduce((s, j) => s + j.apiCostUsd, 0);
    const credits = rows.reduce((s, j) => s + j.actualCredits, 0);
    return {
      tier,
      videos: rows.length,
      avgCostUsd: rows.length ? round4(cost / rows.length) : null,
      avgCredits: rows.length ? Math.round(credits / rows.length) : null,
      costUsdPer1kCredits: credits ? round4((cost / credits) * 1000) : null,
    };
  });

  const monthlyCogs = (cogs / windowDays) * 30;
  const mrrNet = mrr - fees;
  return {
    asOf: input.now.toISOString(),
    windowDays,
    payingSubscribers: subscribers,
    planMix,
    mrrUsd: round2(mrr),
    mrrNetOfFeesUsd: round2(mrrNet),
    arpuUsd: subscribers ? round2(mrr / subscribers) : null,
    cogsUsd: round2(cogs),
    failedCogsUsd: round2(failedCogs),
    jobs: { total: jobs.length, done: done.length, failed: failed.length },
    byTier,
    monthlyCogsUsd: round2(monthlyCogs),
    cogsShareOfMrr: mrr > 0 ? round4(monthlyCogs / mrr) : null,
    mrrToCogs: monthlyCogs > 0 ? round2(mrr / monthlyCogs) : null,
  };
}
