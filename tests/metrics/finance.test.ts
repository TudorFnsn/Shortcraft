import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceInput } from '@/features/metrics/finance';
import { netRevenueUsd } from '@/features/billing/margin';

const NOW = new Date('2026-10-19T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);

const empty: FinanceInput = {
  now: NOW,
  windowDays: 30,
  subscriptions: [],
  jobs: [],
  topUps: [],
  paidUserIds: new Set(),
};

const job = (over: Partial<FinanceInput['jobs'][number]> = {}) => ({
  userId: 'u1',
  status: 'done',
  modelTier: 'standard',
  createdAt: daysAgo(1),
  apiCostUsd: 0.1,
  actualCredits: 2000,
  ...over,
});

describe('computeFinance', () => {
  it('returns zeros and a null multiple with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrGrossEur).toBe(0);
    expect(r.apiCostUsd).toBe(0);
    expect(r.marginMultiple).toBeNull();
    expect(r.tiers).toEqual([]);
  });

  it('sums MRR over live subscriptions on sold plans only', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'trialing' },
        { userId: 'c', planId: 'pro', status: 'canceled' },
        { userId: 'd', planId: 'legacy', status: 'active' },
      ],
    });
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1 });
    expect(r.mrrGrossEur).toBe(44.98);
    expect(r.mrrNetUsd).toBeCloseTo(netRevenueUsd(1499) + netRevenueUsd(2999), 2);
  });

  it('prices top-ups by pack and ignores ones outside the window or off-pack', () => {
    const r = computeFinance({
      ...empty,
      topUps: [
        { userId: 'a', credits: 20_000, createdAt: daysAgo(2) },
        { userId: 'a', credits: 20_000, createdAt: daysAgo(40) },
        { userId: 'a', credits: 777, createdAt: daysAgo(2) },
      ],
    });
    expect(r.topUpNetUsd).toBeCloseTo(netRevenueUsd(1200), 2);
  });

  it('splits API cost by tier, free users and failures, and keeps failed spend', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'u1', planId: 'pro', status: 'active' }],
      paidUserIds: new Set(['u1']),
      jobs: [
        job({ modelTier: 'premium', apiCostUsd: 1.1, actualCredits: 26_000 }),
        job({ userId: 'free', apiCostUsd: 0.07 }),
        job({ status: 'failed', apiCostUsd: 0.5 }),
        job({ createdAt: daysAgo(45), apiCostUsd: 9 }),
      ],
    });
    expect(r.apiCostUsd).toBeCloseTo(1.67, 4);
    expect(r.freeApiCostUsd).toBeCloseTo(0.07, 4);
    expect(r.failedApiCostUsd).toBeCloseTo(0.5, 4);
    expect(r.tiers[0]).toMatchObject({ tier: 'premium', jobs: 1, done: 1 });
    expect(r.tiers[0]?.costPer1kCreditsUsd).toBeCloseTo((1.1 / 26_000) * 1000, 4);
    expect(r.marginMultiple).toBeCloseTo(r.revenueNetUsd / 1.67, 1);
    expect(r.grossProfitUsd).toBeCloseTo(r.revenueNetUsd - 1.67, 1);
  });

  it('scales subscription revenue to a shorter window', () => {
    const r = computeFinance({
      ...empty,
      windowDays: 7,
      subscriptions: [{ userId: 'a', planId: 'ultra', status: 'active' }],
    });
    expect(r.revenueNetUsd).toBeCloseTo(netRevenueUsd(7999) * (7 / 30), 2);
  });
});
