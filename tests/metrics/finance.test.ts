import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceJob } from '@/features/metrics/finance';
import { netRevenueUsd } from '@/features/billing/margin';
import { PLANS } from '@/config/plans';

const NOW = new Date('2026-10-20T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

const job = (over: Partial<FinanceJob>): FinanceJob => ({
  userId: 'u1',
  status: 'done',
  modelTier: 'standard',
  apiCostUsd: 0.07,
  actualCredits: 2024,
  createdAt: daysAgo(1),
  ...over,
});

describe('computeFinance', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinance({ now: NOW, subscriptions: [], jobs: [] });
    expect(r.mrrNetUsd).toBe(0);
    expect(r.apiSpendUsd).toBe(0);
    expect(r.costToMrr).toBeNull();
    expect(r.grossMarginRate).toBeNull();
  });

  it('sums net MRR over live subscriptions only', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'active' },
        { userId: 'c', planId: 'pro', status: 'canceled' },
      ],
      jobs: [],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1 });
    expect(r.mrrGrossEur).toBeCloseTo(14.99 + 29.99, 2);
    expect(r.mrrNetUsd).toBeCloseTo(
      netRevenueUsd(PLANS.starter.priceCents) + netRevenueUsd(PLANS.pro.priceCents),
      1,
    );
  });

  it('splits spend by tier, counts failed and non-paying spend, ignores old jobs', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [{ userId: 'u1', planId: 'pro', status: 'active' }],
      jobs: [
        job({}),
        job({ modelTier: 'premium', apiCostUsd: 1.1, status: 'failed' }),
        job({ userId: 'free', apiCostUsd: 0.25 }),
        job({ apiCostUsd: 9, createdAt: daysAgo(45) }),
      ],
    });
    expect(r.apiSpendUsd).toBeCloseTo(1.42, 4);
    expect(r.failedSpendUsd).toBeCloseTo(1.1, 4);
    expect(r.nonPayingSpendUsd).toBeCloseTo(0.25, 4);
    expect(r.byTier[0]?.tier).toBe('premium');
    expect(r.byTier[0]?.costPerDoneVideoUsd).toBeNull();
    expect(r.byTier[1]?.costPerDoneVideoUsd).toBeCloseTo(0.16, 4);
    expect(r.costToMrr).toBeGreaterThan(0);
  });
});
