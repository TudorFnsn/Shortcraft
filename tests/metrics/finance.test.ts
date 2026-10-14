import { describe, expect, it } from 'vitest';
import { computeFinance } from '@/features/metrics/finance';

const now = new Date('2026-10-14T00:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('computeFinance', () => {
  const base = {
    now,
    eurToUsd: 1.1,
    fixedMonthlyUsd: 50,
    subscriptions: [
      { userId: 'a', planId: 'starter', status: 'active' },
      { userId: 'b', planId: 'pro', status: 'trialing' },
      { userId: 'c', planId: 'pro', status: 'canceled' },
    ],
    jobs: [
      { tier: 'standard', status: 'done', apiCostUsd: 0.1, createdAt: day(1) },
      { tier: 'standard', status: 'done', apiCostUsd: 0.2, createdAt: day(2) },
      { tier: 'premium', status: 'failed', apiCostUsd: 0.5, createdAt: day(3) },
      { tier: 'standard', status: 'done', apiCostUsd: 9, createdAt: day(40) },
    ],
  };

  it('sums MRR over live subscriptions only', () => {
    const r = computeFinance(base);
    expect(r.mrrEur).toBe(44.98);
    expect(r.payingSubscribers).toBe(2);
    expect(r.byPlan.pro?.subscribers).toBe(1);
    expect(r.arpuEur).toBe(22.49);
  });

  it('counts only the last 30 days of API spend and tracks failed spend', () => {
    const r = computeFinance(base);
    expect(r.apiCost30dUsd).toBe(0.8);
    expect(r.failedCost30dUsd).toBe(0.5);
    expect(r.videosDone30d).toBe(2);
    expect(r.tiers.find((t) => t.tier === 'standard')?.avgCostUsdPerDone).toBe(0.15);
  });

  it('reports cash margin after fees, API and fixed cost', () => {
    const r = computeFinance(base);
    // 44.98 EUR * 1.1 * 0.97 = 47.99 USD net; minus 0.8 + 50 = -2.81
    expect(r.monthlyCashMarginUsd).toBe(-2.81);
    expect(r.revenueToCostRatio).toBe(0.94);
  });

  it('handles an empty business', () => {
    const r = computeFinance({ ...base, subscriptions: [], jobs: [], fixedMonthlyUsd: 0 });
    expect(r.mrrEur).toBe(0);
    expect(r.revenueToCostRatio).toBeNull();
    expect(r.breakEvenSubscribers).toBeNull();
  });
});
