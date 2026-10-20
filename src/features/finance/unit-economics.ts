/**
 * Finance snapshot: MRR, realised revenue and what the pipeline actually cost.
 *
 * Pure — `scripts/finance-report.mts` feeds it rows read from Supabase. MRR
 * counts live subscriptions at list price (EUR, VAT inclusive) and is turned
 * into net USD with the same assumptions as the margin gate. Costs come from
 * `render_jobs.api_cost_usd` (what each finished render actually metered), so
 * this is the measured counterpart to the gate's worst-case estimate.
 */
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { isLiveSubscription } from '@/features/billing/entitlements';
import { netRevenueUsd } from '@/features/billing/margin';

export const WINDOW_DAYS = 30;

export interface FinanceInput {
  now: Date;
  subscriptions: ReadonlyArray<{ planId: string; status: string }>;
  jobs: ReadonlyArray<{
    status: string;
    modelTier: string;
    targetDurationSec: number;
    apiCostUsd: number;
    actualCredits: number;
    createdAt: Date;
  }>;
  /** `topup` ledger rows (credits bought), any age. */
  topups: ReadonlyArray<{ credits: number; createdAt: Date }>;
  /** Fixed monthly costs in USD (hosting, ElevenLabs plan, ...), from the owner. */
  fixedCostsUsd?: Readonly<Record<string, number>>;
}

export interface TierCost {
  tier: string;
  videos: number;
  apiCostUsd: number;
  avgCostPerVideoUsd: number;
  avgCreditsPerVideo: number;
  /** API cost per 1,000 credits charged: the real cost of the credit scale. */
  costPer1kCreditsUsd: number;
}

export interface FinanceReport {
  asOf: string;
  /** Live subscribers and list-price MRR in EUR (VAT inclusive). */
  payingSubscribers: number;
  mrrEur: number;
  mrrNetUsd: number;
  mrrByPlan: Record<string, { subscribers: number; mrrEur: number }>;
  arpuEur: number;
  /** Top-up purchases in the window, net USD (matched to packs by credits). */
  topupNetUsd30d: number;
  videos30d: number;
  failed30d: number;
  apiCostUsd30d: number;
  byTier: TierCost[];
  fixedCostsUsd: number;
  /** Net recurring revenue over API + fixed costs; null when nothing is spent. */
  mrrCoverage: number | null;
  /** Net USD left after API and fixed costs (MRR + top-ups - costs). */
  contributionUsd30d: number;
  /** Cash-return flags for the routine to act on. */
  flags: string[];
}

const round = (n: number, d = 2) => Number(n.toFixed(d));

export function computeFinance(input: FinanceInput): FinanceReport {
  const { now } = input;
  const since = now.getTime() - WINDOW_DAYS * 86_400_000;
  const live = input.subscriptions.filter(isLiveSubscription);

  const mrrByPlan: FinanceReport['mrrByPlan'] = {};
  let mrrEur = 0;
  let mrrNetUsd = 0;
  for (const s of live) {
    const eur = PLANS[s.planId].priceCents / 100;
    const row = (mrrByPlan[s.planId] ??= { subscribers: 0, mrrEur: 0 });
    row.subscribers += 1;
    row.mrrEur = round(row.mrrEur + eur);
    mrrEur += eur;
    mrrNetUsd += netRevenueUsd(PLANS[s.planId].priceCents);
  }

  const topupNetUsd30d = input.topups
    .filter((t) => t.createdAt.getTime() >= since)
    .reduce((sum, t) => {
      const pack = TOPUP_PACKS.find((p) => p.credits === t.credits);
      return pack ? sum + netRevenueUsd(pack.priceCents) : sum;
    }, 0);

  const recent = input.jobs.filter((j) => j.createdAt.getTime() >= since);
  const done = recent.filter((j) => j.status === 'done');
  const tiers = [...new Set(done.map((j) => j.modelTier))].sort();
  const byTier: TierCost[] = tiers.map((tier) => {
    const rows = done.filter((j) => j.modelTier === tier);
    const cost = rows.reduce((s, j) => s + j.apiCostUsd, 0);
    const credits = rows.reduce((s, j) => s + j.actualCredits, 0);
    return {
      tier,
      videos: rows.length,
      apiCostUsd: round(cost, 4),
      avgCostPerVideoUsd: round(cost / rows.length, 4),
      avgCreditsPerVideo: Math.round(credits / rows.length),
      costPer1kCreditsUsd: credits > 0 ? round((cost / credits) * 1000, 4) : 0,
    };
  });

  // Failed renders can still meter spend (script, images already paid for).
  const apiCostUsd30d = recent.reduce((s, j) => s + j.apiCostUsd, 0);
  const fixedCostsUsd = Object.values(input.fixedCostsUsd ?? {}).reduce((a, b) => a + b, 0);
  const spend = apiCostUsd30d + fixedCostsUsd;
  const failed30d = recent.filter((j) => j.status === 'failed').length;

  const flags: string[] = [];
  if (live.length === 0) flags.push('No paying subscribers: MRR is 0, every video is cost.');
  if (spend > mrrNetUsd + topupNetUsd30d && spend > 0)
    flags.push('Spend exceeds net revenue in the last 30 days.');
  if (recent.length > 0 && failed30d / recent.length > 0.1)
    flags.push('Over 10% of renders failed: failed jobs still meter provider spend.');
  for (const t of byTier)
    if (t.tier === 'premium' && t.avgCostPerVideoUsd > 1.5)
      flags.push(`Premium averages $${t.avgCostPerVideoUsd}/video: look at a cheaper video model.`);

  return {
    asOf: now.toISOString(),
    payingSubscribers: live.length,
    mrrEur: round(mrrEur),
    mrrNetUsd: round(mrrNetUsd),
    mrrByPlan,
    arpuEur: live.length ? round(mrrEur / live.length) : 0,
    topupNetUsd30d: round(topupNetUsd30d),
    videos30d: done.length,
    failed30d,
    apiCostUsd30d: round(apiCostUsd30d, 4),
    byTier,
    fixedCostsUsd: round(fixedCostsUsd),
    mrrCoverage: spend > 0 ? round(mrrNetUsd / spend) : null,
    contributionUsd30d: round(mrrNetUsd + topupNetUsd30d - spend),
    flags,
  };
}
