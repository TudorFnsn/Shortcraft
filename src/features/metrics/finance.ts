/**
 * Unit economics from our own DB: what finished videos actually cost us (the
 * orchestrator records `api_cost_usd` per job) against the credits customers
 * spent on them, plus a break-even against fixed monthly costs. Pure — the
 * script `scripts/finance-report.mts` feeds it rows.
 */
export interface FinanceJob {
  status: string;
  modelTier: string;
  targetDurationSec: number;
  actualCredits: number;
  apiCostUsd: number;
  createdAt: string;
}

export interface TierEconomics {
  tier: string;
  videos: number;
  apiCostUsd: number;
  credits: number;
  avgCostPerVideoUsd: number;
  avgCostPerSecondUsd: number;
  /** USD of API cost per 1,000 credits spent. Compare with 1000 / CREDITS_PER_USD at the plan's price. */
  costPer1kCreditsUsd: number;
}

export interface FixedCosts {
  /** Monthly fixed costs in USD; `null` = not known yet (reported as unknown, never as zero). */
  items: Record<string, number | null>;
}

export interface FinanceReport {
  windowDays: number;
  tiers: TierEconomics[];
  failedJobs: number;
  /** API cost burnt on jobs that did not finish (not billed to the customer). */
  failedCostUsd: number;
  totalApiCostUsd: number;
  knownFixedMonthlyUsd: number;
  unknownFixedItems: string[];
}

const round = (n: number, dp = 4) => Number(n.toFixed(dp));

export function computeFinance(
  jobs: readonly FinanceJob[],
  fixed: FixedCosts,
  now: Date,
  windowDays = 30,
): FinanceReport {
  const since = now.getTime() - windowDays * 86_400_000;
  const inWindow = jobs.filter((j) => Date.parse(j.createdAt) >= since);
  const done = inWindow.filter((j) => j.status === 'done');
  const failed = inWindow.filter((j) => j.status === 'failed');

  const byTier = new Map<string, FinanceJob[]>();
  for (const j of done) byTier.set(j.modelTier, [...(byTier.get(j.modelTier) ?? []), j]);

  const tiers: TierEconomics[] = [...byTier.entries()].map(([tier, js]) => {
    const cost = js.reduce((s, j) => s + j.apiCostUsd, 0);
    const credits = js.reduce((s, j) => s + j.actualCredits, 0);
    const seconds = js.reduce((s, j) => s + j.targetDurationSec, 0);
    return {
      tier,
      videos: js.length,
      apiCostUsd: round(cost),
      credits,
      avgCostPerVideoUsd: round(cost / js.length),
      avgCostPerSecondUsd: seconds ? round(cost / seconds) : 0,
      costPer1kCreditsUsd: credits ? round((cost / credits) * 1000) : 0,
    };
  });

  const entries = Object.entries(fixed.items);
  return {
    windowDays,
    tiers,
    failedJobs: failed.length,
    failedCostUsd: round(failed.reduce((s, j) => s + j.apiCostUsd, 0)),
    totalApiCostUsd: round(inWindow.reduce((s, j) => s + j.apiCostUsd, 0)),
    knownFixedMonthlyUsd: round(
      entries.reduce((s, [, v]) => s + (v ?? 0), 0),
      2,
    ),
    unknownFixedItems: entries.filter(([, v]) => v === null).map(([k]) => k),
  };
}

/** Subscribers needed to cover fixed costs, given average net revenue per subscriber after API cost. */
export function breakEvenSubscribers(
  fixedMonthlyUsd: number,
  netRevenuePerSubUsd: number,
  apiCostPerSubUsd: number,
): number | null {
  const contribution = netRevenuePerSubUsd - apiCostPerSubUsd;
  return contribution > 0 ? Math.ceil(fixedMonthlyUsd / contribution) : null;
}
