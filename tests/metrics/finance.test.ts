import { describe, expect, it } from 'vitest';
import {
  computeFinance,
  DAY_MS,
  netMonthlyUsd,
  type FinanceInput,
} from '@/features/metrics/finance';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

const NOW = new Date('2026-10-19T07:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = { subscriptions: [], jobs: [], now: NOW };

describe('computeFinance', () => {
  it('is all zeros / n/a with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrUsd).toBe(0);
    expect(r.arpuUsd).toBeNull();
    expect(r.mrrToCogs).toBeNull();
    expect(r.cogsShareOfMrr).toBeNull();
    expect(r.byTier).toEqual([]);
  });

  it('counts only live subscriptions on a plan we sell', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'pro', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'canceled' },
        { userId: 'c', planId: 'nope', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(1);
    expect(r.planMix).toEqual({ pro: 1 });
    expect(r.mrrUsd).toBeCloseTo(netMonthlyUsd(2999, REVENUE_ASSUMPTIONS), 2);
    expect(r.mrrNetOfFeesUsd).toBeLessThan(r.mrrUsd);
  });

  it('splits cost by tier, keeps failed spend, and ignores jobs outside the window', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      jobs: [
        {
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 0.07,
          actualCredits: 2000,
          createdAt: daysAgo(1),
        },
        {
          status: 'done',
          modelTier: 'premium',
          apiCostUsd: 1.1,
          actualCredits: 26000,
          createdAt: daysAgo(2),
        },
        {
          status: 'failed',
          modelTier: 'premium',
          apiCostUsd: 0.4,
          actualCredits: 0,
          createdAt: daysAgo(3),
        },
        {
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 9,
          actualCredits: 1,
          createdAt: daysAgo(40),
        },
      ],
    });
    expect(r.jobs).toEqual({ total: 3, done: 2, failed: 1 });
    expect(r.cogsUsd).toBeCloseTo(1.57, 2);
    expect(r.failedCogsUsd).toBeCloseTo(0.4, 2);
    expect(r.byTier.map((t) => [t.tier, t.videos, t.avgCostUsd])).toEqual([
      ['premium', 1, 1.1],
      ['standard', 1, 0.07],
    ]);
    expect(r.mrrToCogs).toBeGreaterThan(1);
  });

  it('scales a short window to a month', () => {
    const r = computeFinance({
      ...empty,
      windowDays: 7,
      jobs: [
        {
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 7,
          actualCredits: 100,
          createdAt: daysAgo(1),
        },
      ],
    });
    expect(r.monthlyCogsUsd).toBe(30);
  });
});
