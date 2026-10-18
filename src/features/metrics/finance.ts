/**
 * Finance metrics: MRR and what the AI actually cost us, from data we already
 * store (`subscriptions`, `render_jobs.api_cost_usd`, the credit ledger). No
 * Stripe call: MRR is the list price of each live subscription, which matches
 * Stripe until discounts, coupons or annual billing exist (then cross-check
 * with Stripe; see FinancePlan §4).
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`, so every number is reproducible.
 *
 * Definitions (window = the 30 days before `now`, half-open `[start, now)`):
 * - **MRR (gross):** sum of `PLANS[plan].priceCents` over live subscriptions, EUR.
 * - **MRR (net):** each price after VAT and Stripe fees, as the margin gate sees it.
 * - **API cost:** `render_jobs.api_cost_usd`, summed. Failed jobs count: we paid
 *   the provider even though the credits were refunded (**waste**).
 * - **Trial burn:** API cost of jobs by users who have never paid.
 * - **Cost-to-MRR:** window API cost ÷ net MRR in USD. The lower the better;
 *   above ~0.33 the 3x margin target is broken in practice.
 */
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';
import { netRevenueUsd, REVENUE_ASSUMPTIONS } from '@/features/billing/margin';
import { PLANS, type PlanId } from '@/config/plans';

export const DAY_MS = 86_400_000;
export const WINDOW_DAYS = 30;

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  createdAt: Date;
  apiCostUsd: number;
  /** Credits actually billed (`actual_credits`). */
  chargedCredits: number;
}

export interface FinanceInput {
  now: Date;
  jobs: FinanceJob[];
  subscriptions: Array<SubscriptionSnapshot & { userId: string }>;
  /** Users with at least one paid grant (subscription or top-up). */
  payerIds: ReadonlySet<string>;
}

export interface TierCost {
  tier: string;
  videos: number;
  apiCostUsd: number;
  avgCostPerVideoUsd: number | null;
  avgCreditsPerVideo: number | null;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  subscribersByPlan: Record<PlanId, number>;
  mrrEur: number;
  netMrrUsd: number;
  apiCostUsd: number;
  wasteUsd: number;
  trialBurnUsd: number;
  /** API cost ÷ net MRR (USD); null when there is no MRR yet. */
  costToMrr: number | null;
  /** Net MRR minus window API cost, USD (before hosting and fixed fees). */
  grossProfitUsd: number;
  byTier: TierCost[];
}

const round = (n: number, dp = 4) => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now, jobs, subscriptions, payerIds } = input;
  const start = now.getTime() - WINDOW_DAYS * DAY_MS;

  const subscribersByPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  let mrrEur = 0;
  let netMrrUsd = 0;
  for (const sub of subscriptions) {
    if (!isLiveSubscription(sub)) continue;
    subscribersByPlan[sub.planId] += 1;
    mrrEur += PLANS[sub.planId].priceCents / 100;
    netMrrUsd += netRevenueUsd(PLANS[sub.planId].priceCents, REVENUE_ASSUMPTIONS);
  }

  let apiCostUsd = 0;
  let wasteUsd = 0;
  let trialBurnUsd = 0;
  const tiers = new Map<string, { videos: number; cost: number; credits: number }>();
  for (const job of jobs) {
    const t = job.createdAt.getTime();
    if (t < start || t >= now.getTime()) continue;
    apiCostUsd += job.apiCostUsd;
    if (job.status === 'failed') wasteUsd += job.apiCostUsd;
    if (!payerIds.has(job.userId)) trialBurnUsd += job.apiCostUsd;
    if (job.status === 'done') {
      const row = tiers.get(job.modelTier) ?? { videos: 0, cost: 0, credits: 0 };
      row.videos += 1;
      row.cost += job.apiCostUsd;
      row.credits += job.chargedCredits;
      tiers.set(job.modelTier, row);
    }
  }

  return {
    asOf: now.toISOString(),
    windowDays: WINDOW_DAYS,
    payingSubscribers: Object.values(subscribersByPlan).reduce((a, b) => a + b, 0),
    subscribersByPlan,
    mrrEur: round(mrrEur, 2),
    netMrrUsd: round(netMrrUsd, 2),
    apiCostUsd: round(apiCostUsd),
    wasteUsd: round(wasteUsd),
    trialBurnUsd: round(trialBurnUsd),
    costToMrr: netMrrUsd > 0 ? round(apiCostUsd / netMrrUsd) : null,
    grossProfitUsd: round(netMrrUsd - apiCostUsd, 2),
    byTier: [...tiers.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([tier, r]) => ({
        tier,
        videos: r.videos,
        apiCostUsd: round(r.cost),
        avgCostPerVideoUsd: r.videos ? round(r.cost / r.videos) : null,
        avgCreditsPerVideo: r.videos ? Math.round(r.credits / r.videos) : null,
      })),
  };
}
