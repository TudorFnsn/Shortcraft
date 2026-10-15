/**
 * Finance snapshot: MRR, realised API cost and margin, from data we already
 * store. Pure: the caller loads rows (Supabase in `scripts/finance-report.mts`,
 * fixtures in tests) and passes `now`, so every number is reproducible.
 *
 * Definitions:
 * - **MRR (gross, EUR):** sum of `PLANS[plan].priceCents` over live subscriptions
 *   (same "live" rule as plan gating). Top-ups are one-off and excluded.
 * - **Net MRR (USD):** each plan's price after VAT + Stripe fees (margin gate
 *   assumptions), i.e. what we keep.
 * - **Window:** jobs created in the 30 days before `now`.
 * - **Realised cost:** `render_jobs.api_cost_usd` (what the providers charged
 *   us, recorded per step by the orchestrator), including failed jobs.
 * - **Waste:** cost of jobs that did not end `done` (refunded to the user).
 * - **Subscriber margin:** net plan price / that subscriber's window cost.
 *   Under `TARGET_MARGIN_MULTIPLE` is "thin", under 1 is "underwater".
 * - **Trial burn:** window cost of users with no live subscription, i.e. what
 *   free/lapsed users cost us (acquisition spend).
 */
import { PLANS, type PlanId } from '@/config/plans';
import {
  netRevenueUsd,
  REVENUE_ASSUMPTIONS,
  TARGET_MARGIN_MULTIPLE,
  type RevenueAssumptions,
} from '@/features/billing/margin';
import { isLiveSubscription } from '@/features/billing/entitlements';

export const DAY_MS = 86_400_000;
export const WINDOW_DAYS = 30;

export interface FinanceSubscription {
  userId: string;
  planId: string;
  status: string;
}

export interface FinanceJob {
  userId: string;
  status: string;
  modelTier: string;
  apiCostUsd: number;
  actualCredits: number;
  createdAt: Date;
}

export interface FixedCosts {
  /** Monthly fixed costs in USD by line (Vercel, Supabase, ElevenLabs plan, ...). */
  monthlyUsd: Readonly<Record<string, number>>;
}

export interface FinanceInput {
  now: Date;
  subscriptions: readonly FinanceSubscription[];
  jobs: readonly FinanceJob[];
  fixedCosts?: FixedCosts;
  assumptions?: RevenueAssumptions;
}

export interface TierEconomics {
  tier: string;
  finished: number;
  failed: number;
  costUsd: number;
  /** Mean cost of one finished video, USD (failed-job cost spread over finished ones). */
  costPerFinishedUsd: number | null;
  /** Realised USD cost per 1,000 credits billed on finished jobs. */
  costPer1kCreditsUsd: number | null;
}

export interface PlanEconomics {
  planId: PlanId;
  subscribers: number;
  mrrEur: number;
  netMrrUsd: number;
  costUsd: number;
  /** netMrr / cost; null when cost is 0. */
  multiple: number | null;
  thin: number;
  underwater: number;
}

export interface FinanceReport {
  asOf: string;
  windowDays: number;
  mrrEur: number;
  netMrrUsd: number;
  payingSubscribers: number;
  arpuEur: number | null;
  plans: PlanEconomics[];
  tiers: TierEconomics[];
  apiCostUsd: number;
  wasteUsd: number;
  trialBurnUsd: number;
  /** netMrr / API cost of paying subscribers in the window; null when 0 cost. */
  blendedMultiple: number | null;
  grossProfitUsd: number;
  fixedCostsUsd: number | null;
  /** grossProfit - fixed costs; null when fixed costs are unknown. */
  operatingResultUsd: number | null;
  /** Subscribers needed to cover fixed costs at the current net ARPU and cost; null if unknowable. */
  breakEvenSubscribers: number | null;
}

const round = (n: number, dp = 2) => Math.round(n * 10 ** dp) / 10 ** dp;

export function computeFinance(input: FinanceInput): FinanceReport {
  const a = input.assumptions ?? REVENUE_ASSUMPTIONS;
  const since = input.now.getTime() - WINDOW_DAYS * DAY_MS;
  const jobs = input.jobs.filter(
    (j) => j.createdAt.getTime() >= since && j.createdAt.getTime() <= input.now.getTime(),
  );

  const planOf = new Map<string, PlanId>();
  for (const s of input.subscriptions) {
    if (isLiveSubscription(s)) planOf.set(s.userId, s.planId);
  }

  const costByUser = new Map<string, number>();
  for (const j of jobs) costByUser.set(j.userId, (costByUser.get(j.userId) ?? 0) + j.apiCostUsd);

  const plans: PlanEconomics[] = (Object.keys(PLANS) as PlanId[]).map((planId) => {
    const net = netRevenueUsd(PLANS[planId].priceCents, a);
    const members = [...planOf].filter(([, p]) => p === planId).map(([u]) => u);
    let cost = 0;
    let thin = 0;
    let underwater = 0;
    for (const u of members) {
      const c = costByUser.get(u) ?? 0;
      cost += c;
      if (c > 0 && net / c < 1) underwater++;
      else if (c > 0 && net / c < TARGET_MARGIN_MULTIPLE) thin++;
    }
    return {
      planId,
      subscribers: members.length,
      mrrEur: round((members.length * PLANS[planId].priceCents) / 100),
      netMrrUsd: round(members.length * net),
      costUsd: round(cost, 4),
      multiple: cost > 0 ? round((members.length * net) / cost) : null,
      thin,
      underwater,
    };
  });

  const tierNames = [...new Set(jobs.map((j) => j.modelTier))].sort();
  const tiers: TierEconomics[] = tierNames.map((tier) => {
    const t = jobs.filter((j) => j.modelTier === tier);
    const done = t.filter((j) => j.status === 'done');
    const cost = t.reduce((s, j) => s + j.apiCostUsd, 0);
    const doneCredits = done.reduce((s, j) => s + j.actualCredits, 0);
    const doneCost = done.reduce((s, j) => s + j.apiCostUsd, 0);
    return {
      tier,
      finished: done.length,
      failed: t.filter((j) => j.status === 'failed').length,
      costUsd: round(cost, 4),
      costPerFinishedUsd: done.length ? round(cost / done.length, 4) : null,
      costPer1kCreditsUsd: doneCredits ? round((doneCost / doneCredits) * 1000, 5) : null,
    };
  });

  const apiCostUsd = jobs.reduce((s, j) => s + j.apiCostUsd, 0);
  const wasteUsd = jobs.filter((j) => j.status !== 'done').reduce((s, j) => s + j.apiCostUsd, 0);
  const trialBurnUsd = jobs
    .filter((j) => !planOf.has(j.userId))
    .reduce((s, j) => s + j.apiCostUsd, 0);
  const payerCost = apiCostUsd - trialBurnUsd;

  const payingSubscribers = planOf.size;
  const mrrEur = plans.reduce((s, p) => s + p.mrrEur, 0);
  const netMrrUsd = plans.reduce((s, p) => s + p.netMrrUsd, 0);
  const grossProfitUsd = netMrrUsd - apiCostUsd;
  const fixed = input.fixedCosts
    ? Object.values(input.fixedCosts.monthlyUsd).reduce((s, v) => s + v, 0)
    : null;

  let breakEven: number | null = null;
  if (fixed !== null && payingSubscribers > 0) {
    const perSubProfit = (netMrrUsd - apiCostUsd) / payingSubscribers;
    breakEven = perSubProfit > 0 ? Math.ceil(fixed / perSubProfit) : null;
  }

  return {
    asOf: input.now.toISOString(),
    windowDays: WINDOW_DAYS,
    mrrEur: round(mrrEur),
    netMrrUsd: round(netMrrUsd),
    payingSubscribers,
    arpuEur: payingSubscribers ? round(mrrEur / payingSubscribers) : null,
    plans,
    tiers,
    apiCostUsd: round(apiCostUsd, 4),
    wasteUsd: round(wasteUsd, 4),
    trialBurnUsd: round(trialBurnUsd, 4),
    blendedMultiple: payerCost > 0 ? round(netMrrUsd / payerCost) : null,
    grossProfitUsd: round(grossProfitUsd),
    fixedCostsUsd: fixed === null ? null : round(fixed),
    operatingResultUsd: fixed === null ? null : round(grossProfitUsd - fixed),
    breakEvenSubscribers: breakEven,
  };
}
