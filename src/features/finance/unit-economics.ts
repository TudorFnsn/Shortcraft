import { PLANS, type PlanId } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { isLiveSubscription } from '@/features/billing/entitlements';

export interface SubRow {
  planId: string;
  status: string;
}

export interface JobCostRow {
  status: string;
  modelTier: string;
  targetDurationSec: number;
  apiCostUsd: number;
  createdAt: Date;
}

export interface FinanceInput {
  now: Date;
  subscriptions: SubRow[];
  jobs: JobCostRow[];
  /** Fixed monthly costs in USD (hosting, DB, email, monitoring), owner-supplied. */
  fixedMonthlyUsd: number;
  /** Count of signups in the window, for trial burn per signup. */
  signupsInWindow: number;
  windowDays: number;
  trialBurnUsd: number;
}

export interface FinanceReport {
  windowDays: number;
  payingSubscribers: number;
  /** Sum of plan list prices (EUR, VAT included) of live subscriptions. */
  grossMrrEur: number;
  /** Same, after VAT + Stripe fees, in USD. */
  netMrrUsd: number;
  arrNetUsd: number;
  jobsFinished: number;
  jobsFailed: number;
  /** API spend in the window, split by outcome. */
  apiSpendUsd: number;
  wastedOnFailedUsd: number;
  costPerFinishedVideoUsd: number | null;
  costByTier: Record<string, { jobs: number; usd: number; perJobUsd: number }>;
  /** API spend scaled to 30 days, compared with net MRR. */
  apiSpend30dUsd: number;
  trialBurn30dUsd: number;
  fixedMonthlyUsd: number;
  /** (net MRR − API − trial − fixed) / net MRR, null with no revenue. */
  grossMargin: number | null;
  /** Monthly profit in USD (can be negative). */
  profit30dUsd: number;
  /** Net MRR ÷ (API + trial burn), the "MRR ratio"; null with no spend. */
  mrrToVariableCost: number | null;
}

const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

export function computeFinance(input: FinanceInput): FinanceReport {
  const live = input.subscriptions.filter((s) => isLiveSubscription(s));
  const grossMrrEur = live.reduce((t, s) => t + PLANS[s.planId as PlanId].priceCents / 100, 0);
  const netMrrUsd = live.reduce(
    (t, s) => t + netRevenueUsd(PLANS[s.planId as PlanId].priceCents),
    0,
  );

  const since = input.now.getTime() - input.windowDays * 86_400_000;
  const jobs = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const finished = jobs.filter((j) => j.status === 'done' || j.status === 'completed');
  const failed = jobs.filter((j) => j.status === 'failed');
  const spend = (js: JobCostRow[]) => js.reduce((t, j) => t + j.apiCostUsd, 0);

  const costByTier: FinanceReport['costByTier'] = {};
  for (const j of jobs) {
    const b = (costByTier[j.modelTier] ??= { jobs: 0, usd: 0, perJobUsd: 0 });
    b.jobs += 1;
    b.usd += j.apiCostUsd;
  }
  for (const b of Object.values(costByTier)) {
    b.perJobUsd = round(b.jobs ? b.usd / b.jobs : 0, 4);
    b.usd = round(b.usd, 4);
  }

  const scale = 30 / input.windowDays;
  const apiSpend30dUsd = spend(jobs) * scale;
  const trialBurn30dUsd = input.signupsInWindow * input.trialBurnUsd * scale;
  const variable = apiSpend30dUsd + trialBurn30dUsd;
  const profit = netMrrUsd - variable - input.fixedMonthlyUsd;

  return {
    windowDays: input.windowDays,
    payingSubscribers: live.length,
    grossMrrEur: round(grossMrrEur),
    netMrrUsd: round(netMrrUsd),
    arrNetUsd: round(netMrrUsd * 12),
    jobsFinished: finished.length,
    jobsFailed: failed.length,
    apiSpendUsd: round(spend(jobs), 4),
    wastedOnFailedUsd: round(spend(failed), 4),
    costPerFinishedVideoUsd: finished.length ? round(spend(jobs) / finished.length, 4) : null,
    costByTier,
    apiSpend30dUsd: round(apiSpend30dUsd),
    trialBurn30dUsd: round(trialBurn30dUsd),
    fixedMonthlyUsd: input.fixedMonthlyUsd,
    grossMargin: netMrrUsd > 0 ? round(profit / netMrrUsd, 3) : null,
    profit30dUsd: round(profit),
    mrrToVariableCost: variable > 0 ? round(netMrrUsd / variable) : null,
  };
}
