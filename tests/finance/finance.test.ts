import { describe, expect, it } from 'vitest';
import { computeFinance, netUsd } from '@/features/finance/finance';

const now = new Date('2026-10-19T00:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('computeFinance', () => {
  it('counts only live subscriptions on known plans toward MRR', () => {
    const r = computeFinance({
      now,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'nope', status: 'active' },
      ],
      grants: [],
      jobs: [],
    });
    expect(r.payingSubscribers).toBe(1);
    expect(r.subscribersByPlan).toEqual({ pro: 1 });
    expect(r.mrrNetUsd).toBeCloseTo(netUsd(29.99), 6);
    expect(r.grossMargin30d).toBe(1);
  });

  it('prices top-ups by pack, flags unknown amounts, and windows to 30 days', () => {
    const r = computeFinance({
      now,
      subscriptions: [],
      grants: [
        { reason: 'topup', delta: 20_000, createdAt: daysAgo(3) },
        { reason: 'topup', delta: 12_345, createdAt: daysAgo(3) },
        { reason: 'topup', delta: 20_000, createdAt: daysAgo(40) },
        { reason: 'monthly_grant', delta: 20_000, createdAt: daysAgo(1) },
      ],
      jobs: [],
    });
    expect(r.topUpRevenueNetUsd30d).toBeCloseTo(netUsd(12), 6);
    expect(r.topUpGrantsUnpriced30d).toBe(1);
  });

  it('counts failed-job spend as cost and reports per-tier unit cost', () => {
    const r = computeFinance({
      now,
      subscriptions: [{ planId: 'starter', status: 'active' }],
      grants: [],
      jobs: [
        {
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 0.1,
          actualCredits: 2000,
          createdAt: daysAgo(1),
        },
        {
          status: 'failed',
          modelTier: 'premium',
          apiCostUsd: 0.5,
          actualCredits: 0,
          createdAt: daysAgo(2),
        },
        {
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 9,
          actualCredits: 1,
          createdAt: daysAgo(60),
        },
      ],
    });
    expect(r.apiCostUsd30d).toBeCloseTo(0.6, 6);
    expect(r.failedJobCostUsd30d).toBeCloseTo(0.5, 6);
    expect(r.doneVideos30d).toBe(1);
    expect(r.costPerDoneVideoUsd).toBeCloseTo(0.6, 6);
    expect(r.byTier.standard?.usdPer1kCredits).toBeCloseTo(0.05, 6);
    expect(r.byTier.premium).toBeUndefined();
  });

  it('has no ratios when there is no revenue', () => {
    const r = computeFinance({ now, subscriptions: [], grants: [], jobs: [] });
    expect(r.grossMargin30d).toBeNull();
    expect(r.costPerDoneVideoUsd).toBeNull();
  });
});
