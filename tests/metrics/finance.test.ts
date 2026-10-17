import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceInput } from '@/features/metrics/finance';

const NOW = new Date('2026-10-17T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = {
  subscriptions: [],
  jobs: [],
  fixedMonthlyUsd: 0,
  usdPerEur: 1,
  now: NOW,
};

describe('computeFinance', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.monthlyMarginUsd).toBeNull();
    expect(r.coverage).toBeNull();
    expect(r.byTier).toEqual([]);
  });

  it('sums MRR over live subscriptions on known plans only', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'trialing' },
        { userId: 'c', planId: 'pro', status: 'canceled' },
        { userId: 'd', planId: 'legacy', status: 'active' },
      ],
    });
    expect(r.mrrEur).toBe(44.98);
    expect(r.payingSubscribers).toBe(2);
    expect(r.byPlan.pro).toEqual({ subscribers: 1, mrrEur: 29.99 });
  });

  it('prices cost per video and per 1k credits by tier, inside the window only', () => {
    const job = (status: string, tier: string, d: number, cost: number, credits: number) => ({
      status,
      tier,
      createdAt: daysAgo(d),
      apiCostUsd: cost,
      chargedCredits: credits,
    });
    const r = computeFinance({
      ...empty,
      jobs: [
        job('done', 'standard', 1, 0.07, 2000),
        job('done', 'standard', 2, 0.09, 3000),
        job('done', 'premium', 3, 1.1, 26000),
        job('failed', 'premium', 4, 0.5, 0),
        job('done', 'standard', 45, 9, 9),
      ],
    });
    expect(r.videos).toBe(3);
    expect(r.failedVideos).toBe(1);
    expect(r.apiCostUsd).toBe(1.76);
    const std = r.byTier.find((t) => t.tier === 'standard');
    expect(std?.avgCostUsd).toBeCloseTo(0.08);
    expect(std?.usdPer1kCredits).toBeCloseTo(0.032);
  });

  it('scales window cost to 30 days, adds fixed costs and reports coverage', () => {
    const r = computeFinance({
      ...empty,
      windowDays: 15,
      fixedMonthlyUsd: 20,
      usdPerEur: 1.1,
      subscriptions: [{ userId: 'a', planId: 'ultra', status: 'active' }],
      jobs: [
        {
          status: 'done',
          tier: 'standard',
          createdAt: daysAgo(1),
          apiCostUsd: 5,
          chargedCredits: 1,
        },
      ],
    });
    expect(r.monthlyBurnUsd).toBe(30);
    expect(r.monthlyMarginUsd).toBeCloseTo(58, 0);
    expect(r.coverage).toBeCloseTo(2.93, 1);
  });
});
