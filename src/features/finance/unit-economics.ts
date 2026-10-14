/**
 * Unit economics from live data: MRR, realised API cost per finished video and
 * per tier, and the realised margin multiple. Pure: the script feeds it rows.
 * The margin gate (`billing/margin.ts`) is the *planned* worst case; this is
 * what the money actually did.
 */
import { PLANS, type PlanId } from '@/config/plans';
import { REVENUE_ASSUMPTIONS, netRevenueUsd } from '@/features/billing/margin';

export const DAY_MS = 86_400_000;

export interface FinanceJob {
  status: string;
  modelTier: string;
  createdAt: Date;
  /** `render_jobs.api_cost_usd`: what the providers billed us. */
  apiCostUsd: number;
  /** `render_jobs.charged_credits`: what the creator paid in credits. */
  chargedCredits: number;
}

export interface FinanceInput {
  now: Date;
  /** Plan ids of live (paying) subscriptions, one entry per subscriber. */
  livePlans: readonly PlanId[];
  jobs: readonly FinanceJob[];
  /** Fixed monthly costs in USD (hosting, ElevenLabs plan, domain...). Owner-supplied. */
  fixedMonthlyUsd?: number;
}

export interface TierCost {
  tier: string;
  videos: number;
  apiCostUsd: number;
  avgCostUsd: number | null;
  avgCredits: number | null;
}

export interface FinanceReport {
  asOf: string;
  payingSubscribers: number;
  /** Gross MRR in EUR cents (list price, before VAT and fees). */
  mrrCents: number;
  /** MRR after VAT and Stripe fees, in USD. */
  netMrrUsd: number;
  /** Realised API cost over the trailing 30 days, in USD. */
  apiCost30dUsd: number;
  fixedMonthlyUsd: number;
  /** netMrr − api cost − fixed costs (trailing-30d usage against current MRR). */
  grossProfit30dUsd: number;
  /** netMrr ÷ api cost; null when nothing was spent. */
  marginMultiple: number | null;
  failedCost30dUsd: number;
  byTier: TierCost[];
}

const round = (n: number, dp = 4) => Number(n.toFixed(dp));

export function computeFinance(input: FinanceInput): FinanceReport {
  const since = input.now.getTime() - 30 * DAY_MS;
  const recent = input.jobs.filter((j) => j.createdAt.getTime() >= since);

  const mrrCents = input.livePlans.reduce((sum, p) => sum + PLANS[p].priceCents, 0);
  const netMrrUsd = input.livePlans.reduce(
    (sum, p) => sum + netRevenueUsd(PLANS[p].priceCents, REVENUE_ASSUMPTIONS),
    0,
  );
  const apiCost30dUsd = recent.reduce((s, j) => s + j.apiCostUsd, 0);
  const fixedMonthlyUsd = input.fixedMonthlyUsd ?? 0;

  const tiers = new Map<string, FinanceJob[]>();
  for (const j of recent.filter((j) => j.status === 'done')) {
    tiers.set(j.modelTier, [...(tiers.get(j.modelTier) ?? []), j]);
  }
  const byTier = [...tiers].map(([tier, js]) => {
    const cost = js.reduce((s, j) => s + j.apiCostUsd, 0);
    const credits = js.reduce((s, j) => s + j.chargedCredits, 0);
    return {
      tier,
      videos: js.length,
      apiCostUsd: round(cost),
      avgCostUsd: js.length ? round(cost / js.length) : null,
      avgCredits: js.length ? Math.round(credits / js.length) : null,
    };
  });

  return {
    asOf: input.now.toISOString(),
    payingSubscribers: input.livePlans.length,
    mrrCents,
    netMrrUsd: round(netMrrUsd, 2),
    apiCost30dUsd: round(apiCost30dUsd, 2),
    fixedMonthlyUsd,
    grossProfit30dUsd: round(netMrrUsd - apiCost30dUsd - fixedMonthlyUsd, 2),
    marginMultiple: apiCost30dUsd > 0 ? round(netMrrUsd / apiCost30dUsd, 2) : null,
    failedCost30dUsd: round(
      recent.filter((j) => j.status === 'failed').reduce((s, j) => s + j.apiCostUsd, 0),
      2,
    ),
    byTier,
  };
}
