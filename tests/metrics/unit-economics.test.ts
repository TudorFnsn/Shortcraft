import { describe, expect, it } from 'vitest';
import { netRevenueUsd } from '@/features/billing/margin';
import { PLANS } from '@/config/plans';
import { computeUnitEconomics, type EconInput } from '@/features/metrics/unit-economics';

const NOW = new Date('2026-10-20T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const empty: EconInput = { now: NOW, subscriptions: [], topUps: [], jobs: [] };

describe('computeUnitEconomics', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeUnitEconomics(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.profitUsd).toBe(0);
    expect(r.coverage).toBeNull();
    expect(r.failedCostShare).toBeNull();
    expect(r.revenuePer1kCreditsUsd).toBeNull();
    expect(r.tiers).toEqual([]);
  });

  it('counts only live subscriptions on plans we sell', () => {
    const r = computeUnitEconomics({
      ...empty,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'legacy', status: 'active' },
        { planId: 'starter', status: 'trialing' },
      ],
    });
    expect(r.subscribersByPlan).toEqual({ pro: 1, starter: 1 });
    expect(r.mrrEur).toBe((PLANS.pro.priceCents + PLANS.starter.priceCents) / 100);
    expect(r.netMrrUsd).toBeCloseTo(
      netRevenueUsd(PLANS.pro.priceCents) + netRevenueUsd(PLANS.starter.priceCents),
      2,
    );
  });

  it('prices top-ups by pack inside the window and flags unknown amounts', () => {
    const r = computeUnitEconomics({
      ...empty,
      topUps: [
        { credits: 20_000, createdAt: daysAgo(3) },
        { credits: 20_000, createdAt: daysAgo(45) },
        { credits: 7, createdAt: daysAgo(1) },
      ],
    });
    expect(r.topUpNetUsd).toBeCloseTo(netRevenueUsd(1200), 2);
    expect(r.topUpsUnpriced).toBe(1);
  });

  it('splits API cost by tier and keeps what failed jobs burned', () => {
    const r = computeUnitEconomics({
      ...empty,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      fixedCostsUsdPerMonth: { hosting: 5 },
      jobs: [
        {
          status: 'done',
          modelTier: 'standard',
          actualCredits: 2000,
          apiCostUsd: 0.07,
          createdAt: daysAgo(2),
        },
        {
          status: 'done',
          modelTier: 'standard',
          actualCredits: 2000,
          apiCostUsd: 0.09,
          createdAt: daysAgo(3),
        },
        {
          status: 'failed',
          modelTier: 'premium',
          actualCredits: 0,
          apiCostUsd: 1.1,
          createdAt: daysAgo(4),
        },
        {
          status: 'done',
          modelTier: 'standard',
          actualCredits: 2000,
          apiCostUsd: 9,
          createdAt: daysAgo(40),
        },
      ],
    });
    expect(r.apiCostUsd).toBeCloseTo(1.26, 2);
    expect(r.failedCostUsd).toBeCloseTo(1.1, 2);
    expect(r.failedCostShare).toBeCloseTo(0.873, 2);
    const standard = r.tiers.find((t) => t.tier === 'standard');
    expect(standard).toMatchObject({
      finished: 2,
      costPerFinishedUsd: 0.08,
      costPer1kCreditsUsd: 0.04,
    });
    expect(r.tiers.find((t) => t.tier === 'premium')?.costPerFinishedUsd).toBeNull();
    expect(r.profitUsd).toBeCloseTo(r.netRevenueUsd - 1.26 - 5, 1);
    expect(r.coverage).toBeGreaterThan(1);
  });
});
