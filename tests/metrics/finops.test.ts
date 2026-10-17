import { describe, expect, it } from 'vitest';
import { computeFinops, DAY_MS, type FinopsInput } from '@/features/metrics/finops';
import { netRevenueUsd } from '@/features/billing/margin';
import { PLANS } from '@/config/plans';

const NOW = new Date('2026-10-17T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinopsInput = { now: NOW, windowDays: 30, jobs: [], subscriptions: [] };

describe('computeFinops', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinops(empty);
    expect(r.mrrUsd).toBe(0);
    expect(r.mrrRatio).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.tiers).toEqual([]);
  });

  it('sums net MRR of live subscriptions only', () => {
    const r = computeFinops({
      ...empty,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'starter', status: 'canceled' },
        { planId: 'nonsense', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(1);
    expect(r.subscribersByPlan.pro).toBe(1);
    expect(r.mrrUsd).toBeCloseTo(netRevenueUsd(PLANS.pro.priceCents), 2);
  });

  it('prices cost per tier inside the window and scales it to 30 days', () => {
    const r = computeFinops({
      ...empty,
      windowDays: 15,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        {
          tier: 'premium',
          status: 'done',
          createdAt: daysAgo(3),
          apiCostUsd: 2,
          actualCredits: 40_000,
        },
        {
          tier: 'standard',
          status: 'done',
          createdAt: daysAgo(1),
          apiCostUsd: 0.2,
          actualCredits: 2_000,
        },
        {
          tier: 'standard',
          status: 'failed',
          createdAt: daysAgo(1),
          apiCostUsd: 0,
          actualCredits: 0,
        },
        {
          tier: 'standard',
          status: 'done',
          createdAt: daysAgo(20),
          apiCostUsd: 9,
          actualCredits: 1,
        },
      ],
    });
    expect(r.apiCostUsd).toBe(2.2);
    expect(r.apiCostMonthlyUsd).toBe(4.4);
    expect(r.tiers[0]).toMatchObject({ tier: 'premium', videos: 1, usdPer1kCredits: 0.05 });
    expect(r.tiers[1]).toMatchObject({ tier: 'standard', videos: 1, failed: 1 });
    expect(r.mrrRatio).toBeCloseTo(4.4 / r.mrrUsd, 3);
  });

  it('counts fixed costs and top-ups in margin and cash', () => {
    const r = computeFinops({
      ...empty,
      subscriptions: [{ planId: 'ultra', status: 'active' }],
      topUpNetUsd: 10,
      fixedMonthlyUsd: 20,
    });
    expect(r.netCashUsd).toBeCloseTo(r.mrrUsd + 10 - 20, 2);
    expect(r.grossMargin).toBeCloseTo((r.mrrUsd + 10 - 20) / (r.mrrUsd + 10), 3);
  });
});
