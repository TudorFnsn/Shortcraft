/**
 * Unit economics from the ledger: what a finished video costs us in API spend
 * versus the credits it burned, and what a credit earns. Pure, so it is tested
 * without a database; `scripts/finance-report.mts` feeds it real rows.
 */

export interface JobRow {
  status: string;
  modelTier: string;
  targetDurationSec: number;
  actualCredits: number;
  apiCostUsd: number;
  createdAt: Date;
}

export interface TierEconomics {
  tier: string;
  videos: number;
  creditsBurned: number;
  apiCostUsd: number;
  avgCostPerVideoUsd: number;
  avgCostPerSecondUsd: number;
  /** API dollars per 1,000 credits burned (compare with revenue per 1,000 credits). */
  costPer1kCreditsUsd: number;
}

export interface UnitEconomics {
  windowDays: number;
  finished: number;
  failed: number;
  /** Spend on jobs that ended `failed` (refunded to the user, so pure loss). */
  failedCostUsd: number;
  totalApiCostUsd: number;
  tiers: TierEconomics[];
}

const round = (n: number, dp = 4) => Number(n.toFixed(dp));

export function computeUnitEconomics(
  jobs: readonly JobRow[],
  now: Date,
  days: number,
): UnitEconomics {
  const since = now.getTime() - days * 86_400_000;
  const inWindow = jobs.filter((j) => j.createdAt.getTime() >= since);
  const done = inWindow.filter((j) => j.status === 'done');
  const failed = inWindow.filter((j) => j.status === 'failed');

  const byTier = new Map<string, JobRow[]>();
  for (const j of done) byTier.set(j.modelTier, [...(byTier.get(j.modelTier) ?? []), j]);

  const tiers = [...byTier.entries()].map(([tier, rows]): TierEconomics => {
    const cost = rows.reduce((s, r) => s + r.apiCostUsd, 0);
    const credits = rows.reduce((s, r) => s + r.actualCredits, 0);
    const seconds = rows.reduce((s, r) => s + r.targetDurationSec, 0);
    return {
      tier,
      videos: rows.length,
      creditsBurned: credits,
      apiCostUsd: round(cost),
      avgCostPerVideoUsd: round(cost / rows.length),
      avgCostPerSecondUsd: seconds ? round(cost / seconds) : 0,
      costPer1kCreditsUsd: credits ? round((cost / credits) * 1000) : 0,
    };
  });

  const failedCost = failed.reduce((s, r) => s + r.apiCostUsd, 0);
  return {
    windowDays: days,
    finished: done.length,
    failed: failed.length,
    failedCostUsd: round(failedCost),
    totalApiCostUsd: round(tiers.reduce((s, t) => s + t.apiCostUsd, 0) + failedCost),
    tiers: tiers.sort((a, b) => a.tier.localeCompare(b.tier)),
  };
}
