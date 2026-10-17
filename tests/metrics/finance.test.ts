import { describe, expect, it } from 'vitest';
import { computeFinance } from '@/features/metrics/finance';

const now = new Date('2026-10-17T00:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('computeFinance', () => {
  const base = { now, subscriptions: [], jobs: [], topups: [], fixedMonthlyUsd: 0 };

  it('is all zeros with no data', () => {
    const r = computeFinance(base);
    expect(r.payingSubscribers).toBe(0);
    expect(r.mrrNetUsd).toBe(0);
    expect(r.apiMultiple).toBeNull();
    expect(r.breakEvenSubscribers).toBeNull();
  });

  it('counts only live subscriptions on a sold plan', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'starter', status: 'canceled' },
        { planId: 'mystery', status: 'active' },
      ],
    });
    expect(r.subscribersByPlan).toEqual({ starter: 0, pro: 1, ultra: 0 });
    expect(r.mrrGrossEur).toBeCloseTo(29.99);
    expect(r.mrrNetUsd).toBeGreaterThan(0);
    expect(r.mrrNetUsd).toBeLessThan(29.99 * 1.08);
  });

  it('only counts the last 30 days of jobs and top-ups, and totals failed spend', () => {
    const r = computeFinance({
      ...base,
      jobs: [
        { status: 'done', modelTier: 'standard', apiCostUsd: 0.04, createdAt: daysAgo(1) },
        { status: 'done', modelTier: 'standard', apiCostUsd: 0.06, createdAt: daysAgo(2) },
        { status: 'failed', modelTier: 'premium', apiCostUsd: 0.5, createdAt: daysAgo(3) },
        { status: 'done', modelTier: 'premium', apiCostUsd: 9, createdAt: daysAgo(40) },
      ],
      topups: [
        { credits: 20_000, createdAt: daysAgo(5) },
        { credits: 20_000, createdAt: daysAgo(60) },
        { credits: 1, createdAt: daysAgo(1) },
      ],
    });
    expect(r.apiCostUsd30d).toBeCloseTo(0.6);
    expect(r.failedCostUsd30d).toBeCloseTo(0.5);
    expect(r.byTier.standard?.costPerFinished).toBeCloseTo(0.05);
    expect(r.byTier.premium?.costPerFinished).toBeNull();
    expect(r.topupNetUsd30d).toBeGreaterThan(0);
  });

  it('derives profit and break-even from fixed costs', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [{ planId: 'starter', status: 'active' }],
      jobs: [{ status: 'done', modelTier: 'standard', apiCostUsd: 1, createdAt: daysAgo(1) }],
      fixedMonthlyUsd: 40,
    });
    expect(r.profitUsd30d).toBeCloseTo(r.revenueNetUsd30d - 1 - 40);
    expect(r.breakEvenSubscribers).toBeGreaterThan(1);
    expect(r.apiMultiple).toBeCloseTo(r.revenueNetUsd30d);
  });
});
