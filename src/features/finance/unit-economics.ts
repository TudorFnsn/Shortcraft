/**
 * Unit economics: MRR, what a finished video really costs us, and how much of
 * the subscription revenue the providers eat. Computed from data we already
 * store (`render_jobs.api_cost_usd`, live subscriptions), so the Finance CEO
 * routine can steer by it without a vendor.
 *
 * Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`.
 *
 * Definitions (window = trailing 30 days, `[now - 30d, now)`, UTC):
 * - **MRR (gross):** sum of the list prices (EUR) of live subscriptions on plans
 *   we sell, as of `now`. **Net MRR** is the same after VAT and Stripe fees, in
 *   USD, using the margin gate's assumptions. Top-up revenue is not in the
 *   database (only the credits are): read it from Stripe.
 * - **API spend:** `api_cost_usd` of every job created in the window, finished
 *   or not. A failed job's cost is real money with no video behind it ("waste").
 * - **COGS ratio:** API spend / net MRR. Gross margin = 1 - COGS ratio. The
 *   margin gate promises <= 1/3 at full burn; real usage should sit far lower.
 * - **Trial burn:** API spend of users who have never paid (acquisition cost).
 * - **Tokens:** not stored per job today, so token counts are reported as
 *   unmeasured rather than guessed (see FinancePlan §5).
 */
import { PLANS, type PlanId } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';

export const FINANCE_WINDOW_DAYS = 30;
const DAY_MS = 86_400_000;

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  targetDurationSec: number;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface FinanceSubscription extends SubscriptionSnapshot {
  userId: string;
}

export interface FinanceInput {
  jobs: readonly FinanceJob[];
  subscriptions: readonly FinanceSubscription[];
  /** Users who have ever paid (any subscription grant or top-up). */
  payerIds: ReadonlySet<string>;
  now: Date;
}

export interface TierEconomics {
  tier: string;
  finished: number;
  failed: number;
  spendUsd: number;
  wasteUsd: number;
  /** Average API cost of a finished video, null when none finished. */
  costPerVideoUsd: number | null;
  /** Average video length (s) of finished videos. */
  avgDurationSec: number | null;
  /** API dollars per finished video-second. */
  costPerVideoSecUsd: number | null;
  /** Credits charged per API dollar spent (higher = more markup). */
  creditsPerUsd: number | null;
}

export interface HeavyUser {
  userId: string;
  planId: PlanId;
  spendUsd: number;
  netRevenueUsd: number;
  /** spend / netRevenue; above 1 the subscriber loses us money this month. */
  costRatio: number;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  payingSubscribers: number;
  subscribersByPlan: Record<PlanId, number>;
  mrrEur: number;
  netMrrUsd: number;
  spendUsd: number;
  wasteUsd: number;
  trialBurnUsd: number;
  /** null when there is no net MRR yet. */
  cogsRatio: number | null;
  grossMargin: number | null;
  /** Net MRR per paying subscriber (ARPU after VAT and fees). */
  netArpuUsd: number | null;
  /** API spend per paying subscriber. */
  spendPerSubscriberUsd: number | null;
  tiers: TierEconomics[];
  /** Subscribers whose spend this window exceeds their net plan revenue. */
  underwater: HeavyUser[];
  topSpenders: HeavyUser[];
  tokens: 'unmeasured';
}

const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);
const ratio = (n: number, d: number) => (d > 0 ? n / d : null);

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now, payerIds } = input;
  const start = now.getTime() - FINANCE_WINDOW_DAYS * DAY_MS;
  const jobs = input.jobs.filter((j) => j.createdAt.getTime() >= start && j.createdAt <= now);

  // One live subscription per user (`subscriptions.user_id` is unique).
  const live = input.subscriptions.flatMap((s) =>
    isLiveSubscription(s) ? [{ userId: s.userId, planId: s.planId }] : [],
  );
  const subscribersByPlan: Record<PlanId, number> = { starter: 0, pro: 0, ultra: 0 };
  for (const s of live) subscribersByPlan[s.planId] += 1;

  const planIds = Object.keys(PLANS) as PlanId[];
  const mrrEur = sum(planIds.map((p) => (subscribersByPlan[p] * PLANS[p].priceCents) / 100));
  const netMrrUsd = sum(
    planIds.map((p) => subscribersByPlan[p] * netRevenueUsd(PLANS[p].priceCents)),
  );

  const spendUsd = sum(jobs.map((j) => j.apiCostUsd));
  const wasteUsd = sum(jobs.filter((j) => j.status === 'failed').map((j) => j.apiCostUsd));
  const trialBurnUsd = sum(jobs.filter((j) => !payerIds.has(j.userId)).map((j) => j.apiCostUsd));

  const tiers = [...new Set(jobs.map((j) => j.modelTier))].sort().map((tier): TierEconomics => {
    const mine = jobs.filter((j) => j.modelTier === tier);
    const done = mine.filter((j) => j.status === 'done');
    const failed = mine.filter((j) => j.status === 'failed');
    const doneCost = sum(done.map((j) => j.apiCostUsd));
    const doneSec = sum(done.map((j) => j.targetDurationSec));
    return {
      tier,
      finished: done.length,
      failed: failed.length,
      spendUsd: sum(mine.map((j) => j.apiCostUsd)),
      wasteUsd: sum(failed.map((j) => j.apiCostUsd)),
      costPerVideoUsd: ratio(doneCost, done.length),
      avgDurationSec: ratio(doneSec, done.length),
      costPerVideoSecUsd: ratio(doneCost, doneSec),
      creditsPerUsd: ratio(sum(done.map((j) => j.actualCredits)), doneCost),
    };
  });

  const spendByUser = new Map<string, number>();
  for (const j of jobs) spendByUser.set(j.userId, (spendByUser.get(j.userId) ?? 0) + j.apiCostUsd);
  const subscribers: HeavyUser[] = live.map((s) => {
    const revenue = netRevenueUsd(PLANS[s.planId].priceCents);
    const spend = spendByUser.get(s.userId) ?? 0;
    return {
      userId: s.userId,
      planId: s.planId,
      spendUsd: spend,
      netRevenueUsd: revenue,
      costRatio: spend / revenue,
    };
  });
  const bySpend = [...subscribers].sort((a, b) => b.spendUsd - a.spendUsd);

  return {
    asOf: now.toISOString(),
    windowDays: FINANCE_WINDOW_DAYS,
    payingSubscribers: live.length,
    subscribersByPlan,
    mrrEur,
    netMrrUsd,
    spendUsd,
    wasteUsd,
    trialBurnUsd,
    cogsRatio: ratio(spendUsd, netMrrUsd),
    grossMargin: netMrrUsd > 0 ? 1 - spendUsd / netMrrUsd : null,
    netArpuUsd: ratio(netMrrUsd, live.length),
    spendPerSubscriberUsd: ratio(spendUsd, live.length),
    tiers,
    underwater: bySpend.filter((u) => u.costRatio > 1),
    topSpenders: bySpend.slice(0, 5),
    tokens: 'unmeasured',
  };
}
