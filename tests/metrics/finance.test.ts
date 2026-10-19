import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceInput } from '@/features/metrics/finance';

const NOW = new Date('2026-10-19T06:00:00Z');
const ago = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = { now: NOW, jobs: [], subscriptions: [], grants: [] };

describe('computeFinance', () => {
  it('is all zeros / nulls with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrUsd).toBe(0);
    expect(r.payingSubscribers).toBe(0);
    expect(r.grossMarginMultiple).toBeNull();
    expect(r.wastedSpendShare).toBeNull();
    expect(r.byTier).toEqual([]);
  });

  it('sums MRR over live subscriptions of sold plans only', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'bogus', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(1);
    expect(r.subscribersByPlan).toEqual({ pro: 1 });
    expect(r.mrrUsd).toBeGreaterThan(20);
    expect(r.mrrUsd).toBeLessThan(35);
  });

  it('splits spend by outcome and ignores jobs outside the window', () => {
    const r = computeFinance({
      ...empty,
      grants: [{ reason: 'monthly_grant', delta: 100_000, createdAt: ago(3) }],
      jobs: [
        {
          status: 'done',
          modelTier: 'standard',
          createdAt: ago(1),
          apiCostUsd: 0.07,
          chargedCredits: 2024,
        },
        {
          status: 'done',
          modelTier: 'premium',
          createdAt: ago(2),
          apiCostUsd: 1.1,
          chargedCredits: 26504,
        },
        {
          status: 'failed',
          modelTier: 'premium',
          createdAt: ago(2),
          apiCostUsd: 0.35,
          chargedCredits: 0,
        },
        {
          status: 'done',
          modelTier: 'standard',
          createdAt: ago(60),
          apiCostUsd: 9,
          chargedCredits: 1,
        },
      ],
    });
    expect(r.apiCostDoneUsd).toBeCloseTo(1.17, 4);
    expect(r.apiCostFailedUsd).toBeCloseTo(0.35, 4);
    expect(r.byTier.map((t) => t.tier)).toEqual(['premium', 'standard']);
    expect(r.wastedSpendShare).toBeCloseTo(0.35 / 1.52, 3);
    expect(r.grossMarginMultiple).toBeGreaterThan(1);
    expect(r.netRevenuePerCreditUsd).not.toBeNull();
  });
});
