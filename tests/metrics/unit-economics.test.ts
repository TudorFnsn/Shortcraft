import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceInput } from '@/features/metrics/unit-economics';

const NOW = new Date('2026-10-13T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = { jobs: [], subscriptions: [], fixedMonthlyUsd: 0, now: NOW };

describe('computeFinance', () => {
  it('returns zeros and a null margin with no revenue', () => {
    const r = computeFinance(empty);
    expect(r.mrrGrossEur).toBe(0);
    expect(r.grossMargin).toBeNull();
    expect(r.byTier).toEqual([]);
  });

  it('sums MRR over live subscriptions only', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'active' },
        { planId: 'ultra', status: 'canceled' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrGrossEur).toBeCloseTo(14.99 + 29.99);
    expect(r.mrrNetUsd).toBeGreaterThan(0);
    expect(r.mrrNetUsd).toBeLessThan(r.mrrGrossEur * 1.08);
  });

  it('averages cost per finished video per tier and counts failed spend', () => {
    const job = (status: string, cost: number, age: number, tier = 'standard') => ({
      status,
      modelTier: tier,
      apiCostUsd: cost,
      actualCredits: 1000,
      createdAt: daysAgo(age),
    });
    const r = computeFinance({
      ...empty,
      jobs: [job('done', 0.1, 1), job('done', 0.3, 2), job('failed', 0.05, 3), job('done', 9, 40)],
    });
    expect(r.byTier).toHaveLength(1);
    expect(r.byTier[0]?.finished).toBe(2);
    expect(r.byTier[0]?.avgCostUsd).toBeCloseTo(0.2);
    expect(r.failedCostUsd).toBeCloseTo(0.05);
    expect(r.variableCostUsd).toBeCloseTo(0.45);
  });

  it('subtracts fixed and variable cost from net MRR', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      fixedMonthlyUsd: 10,
    });
    expect(r.monthlyProfitUsd).toBeCloseTo(r.mrrNetUsd - 10);
    expect(r.grossMargin).toBeCloseTo(r.monthlyProfitUsd / r.mrrNetUsd);
  });
});
