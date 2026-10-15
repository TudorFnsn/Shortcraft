import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceInput } from '@/features/metrics/finance';
import { netRevenueUsd } from '@/features/billing/margin';

const NOW = new Date('2026-10-15T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const empty: FinanceInput = { now: NOW, jobs: [], subscriptions: [], paidGrants: [] };
const job = (over: Partial<FinanceInput['jobs'][number]> = {}) => ({
  userId: 'u1',
  status: 'done',
  modelTier: 'standard',
  apiCostUsd: 0.1,
  actualCredits: 2000,
  createdAt: daysAgo(1),
  ...over,
});

describe('computeFinance', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrNetUsd).toBe(0);
    expect(r.mrrToCostRatio).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.tiers).toEqual([]);
  });

  it('prices MRR from live subscriptions on list price and ignores canceled ones', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'pro', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'canceled' },
      ],
    });
    expect(r.payingSubscribers).toBe(1);
    expect(r.mrrNetUsd).toBeCloseTo(netRevenueUsd(2999));
    expect(r.mrrGrossEur).toBeCloseTo(29.99);
  });

  it('counts top-ups in the window by pack and flags unmatched ones', () => {
    const r = computeFinance({
      ...empty,
      paidGrants: [
        { userId: 'a', reason: 'topup', delta: 20_000, createdAt: daysAgo(2) },
        { userId: 'a', reason: 'topup', delta: 777, createdAt: daysAgo(3) },
        { userId: 'a', reason: 'topup', delta: 20_000, createdAt: daysAgo(60) },
      ],
    });
    expect(r.topUpGrants).toBe(2);
    expect(r.unpricedTopUpGrants).toBe(1);
    expect(r.topUpNetUsd).toBeCloseTo(netRevenueUsd(1200));
  });

  it('splits cost by tier, failed jobs and users who never paid', () => {
    const r = computeFinance({
      ...empty,
      fixedCostsUsdMonthly: 10,
      subscriptions: [{ userId: 'u1', planId: 'starter', status: 'active' }],
      jobs: [
        job(),
        job({ status: 'failed', apiCostUsd: 0.5 }),
        job({ userId: 'free', modelTier: 'premium', apiCostUsd: 2, actualCredits: 26_000 }),
        job({ createdAt: daysAgo(45), apiCostUsd: 99 }),
      ],
    });
    expect(r.apiCostUsd).toBeCloseTo(2.6);
    expect(r.failedJobCostUsd).toBeCloseTo(0.5);
    expect(r.freeUserCostUsd).toBeCloseTo(2);
    const std = r.tiers.find((t) => t.tier === 'standard');
    expect(std?.videos).toBe(1);
    expect(std?.costPerVideoUsd).toBeCloseTo(0.6);
    expect(r.mrrToCostRatio).toBeCloseTo(r.mrrNetUsd / (2.6 + 10));
    expect(r.monthlyProfitUsd).toBeCloseTo(r.mrrNetUsd - 2.6 - 10);
  });
});
