import { describe, expect, it } from 'vitest';
import { PLANS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { computeMrr, computeProfit, computeTierEconomics } from '@/features/finance/unit-economics';

describe('computeMrr', () => {
  it('counts live subscriptions only and prices them from the plan catalog', () => {
    const mrr = computeMrr([
      { planId: 'pro', status: 'active' },
      { planId: 'pro', status: 'past_due' },
      { planId: 'starter', status: 'trialing' },
      { planId: 'ultra', status: 'canceled' },
      { planId: 'legacy', status: 'active' },
    ]);
    expect(mrr.subscribers).toEqual({ starter: 1, pro: 2, ultra: 0 });
    expect(mrr.grossEurCents).toBe(PLANS.starter.priceCents + 2 * PLANS.pro.priceCents);
    expect(mrr.netUsd).toBeCloseTo(
      netRevenueUsd(PLANS.starter.priceCents) + 2 * netRevenueUsd(PLANS.pro.priceCents),
    );
  });

  it('is zero with no subscribers', () => {
    expect(computeMrr([]).netUsd).toBe(0);
  });
});

describe('computeTierEconomics', () => {
  it('separates finished cost from the cost wasted on failed jobs', () => {
    const rows = computeTierEconomics([
      { status: 'done', modelTier: 'standard', apiCostUsd: 0.04, credits: 2000 },
      { status: 'done', modelTier: 'standard', apiCostUsd: 0.06, credits: 3000 },
      { status: 'failed', modelTier: 'standard', apiCostUsd: 0.02, credits: 0 },
      { status: 'done', modelTier: 'premium', apiCostUsd: 2, credits: 40_000 },
    ]);
    const standard = rows.find((r) => r.tier === 'standard');
    const premium = rows.find((r) => r.tier === 'premium');
    expect(standard).toMatchObject({ finished: 2, failed: 1, wastedUsd: 0.02 });
    expect(standard?.avgCostPerVideoUsd).toBeCloseTo(0.05);
    expect(standard?.costPer1kCreditsUsd).toBeCloseTo(0.02);
    expect(premium?.costPer1kCreditsUsd).toBeCloseTo(0.05);
  });

  it('reports null averages for a tier with no finished jobs', () => {
    const [t] = computeTierEconomics([
      { status: 'failed', modelTier: 'premium', apiCostUsd: 1, credits: 0 },
    ]);
    expect(t?.avgCostPerVideoUsd).toBeNull();
    expect(t?.costPer1kCreditsUsd).toBeNull();
  });
});

describe('computeProfit', () => {
  it('derives margin, net profit and break-even, and flags unreported costs', () => {
    const p = computeProfit({
      netRevenueUsd: 100,
      apiCostUsd: 25,
      fixedCosts: [
        { name: 'Vercel', monthlyUsd: 0 },
        { name: 'Supabase', monthlyUsd: 25 },
        { name: 'ElevenLabs plan', monthlyUsd: null },
      ],
    });
    expect(p.grossMargin).toBeCloseTo(0.75);
    expect(p.netProfitUsd).toBe(50);
    expect(p.breakEvenNetRevenueUsd).toBeCloseTo(25 / 0.75);
    expect(p.unknownFixedCosts).toEqual(['ElevenLabs plan']);
  });

  it('has no margin or break-even without revenue', () => {
    const p = computeProfit({ netRevenueUsd: 0, apiCostUsd: 3, fixedCosts: [] });
    expect(p.grossMargin).toBeNull();
    expect(p.breakEvenNetRevenueUsd).toBeNull();
    expect(p.netProfitUsd).toBe(-3);
  });
});
