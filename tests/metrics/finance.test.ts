import { describe, expect, it } from 'vitest';
import { PLANS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { computeFinance, type FinanceInput } from '@/features/metrics/finance';

const NOW = new Date('2026-10-16T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const empty: FinanceInput = {
  now: NOW,
  subscriptions: [],
  jobs: [],
  topUps: [],
  fixedMonthlyUsd: 0,
};

describe('computeFinance', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.grossMargin).toBeNull();
    expect(r.revenueToCostRatio).toBeNull();
    expect(r.breakEvenSubscribers).toBeNull();
    expect(r.byTier).toEqual([]);
  });

  it('counts only live subscriptions on sold plans toward MRR', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'starter', status: 'past_due' },
        { planId: 'ultra', status: 'canceled' },
        { planId: 'ghost', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBeCloseTo((PLANS.pro.priceCents + PLANS.starter.priceCents) / 100, 2);
    expect(r.netMrrUsd).toBeCloseTo(
      netRevenueUsd(PLANS.pro.priceCents) + netRevenueUsd(PLANS.starter.priceCents),
      1,
    );
  });

  it('measures variable cost in the 30-day window, failed jobs included', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        {
          status: 'done',
          modelTier: 'standard',
          createdAt: daysAgo(2),
          apiCostUsd: 0.1,
          chargedCredits: 2000,
        },
        {
          status: 'done',
          modelTier: 'standard',
          createdAt: daysAgo(3),
          apiCostUsd: 0.1,
          chargedCredits: 2000,
        },
        {
          status: 'failed',
          modelTier: 'premium',
          createdAt: daysAgo(4),
          apiCostUsd: 0.5,
          chargedCredits: 0,
        },
        {
          status: 'done',
          modelTier: 'standard',
          createdAt: daysAgo(40),
          apiCostUsd: 9,
          chargedCredits: 1,
        },
      ],
    });
    expect(r.variableCostUsd30d).toBe(0.7);
    expect(r.failedJobCostUsd30d).toBe(0.5);
    const std = r.byTier.find((t) => t.tier === 'standard');
    expect(std).toMatchObject({ doneVideos: 2, avgCostPerVideoUsd: 0.1, creditsPerUsd: 20000 });
    expect(r.grossMargin).toBeGreaterThan(0.9);
  });

  it('prices top-ups by pack and computes break-even subscribers', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      topUps: [
        { credits: 20_000, createdAt: daysAgo(1) },
        { credits: 20_000, createdAt: daysAgo(90) },
        { credits: 12_345, createdAt: daysAgo(1) },
      ],
      fixedMonthlyUsd: 100,
    });
    expect(r.topUpNetUsd30d).toBeGreaterThan(0);
    expect(r.breakEvenSubscribers).toBe(Math.ceil(100 / r.netMrrUsd));
    expect(r.netProfitUsd30d).toBeCloseTo(r.netMrrUsd + r.topUpNetUsd30d - 100, 1);
  });
});
