import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceInput } from '@/features/finance/unit-economics';

const NOW = new Date('2026-10-18T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);

const base: FinanceInput = {
  now: NOW,
  planPriceCents: { starter: 1499, pro: 2999 },
  assumptions: { vatRate: 0.2, stripePercentFee: 0.015, stripeFixedFeeEur: 0.25, usdPerEur: 1 },
  subscriptions: [],
  jobs: [],
  fixedCosts: [],
};

describe('computeFinance', () => {
  it('returns zeros and n/a with no data', () => {
    const r = computeFinance(base);
    expect(r.mrrEur).toBe(0);
    expect(r.arpuEur).toBeNull();
    expect(r.costPerDoneVideoUsd).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.breakEvenSubscribers).toBeNull();
  });

  it('sums list-price MRR over live subscriptions only', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'past_due' },
        { userId: 'c', planId: 'pro', status: 'canceled' },
        { userId: 'd', planId: 'nope', status: 'active' },
      ],
    });
    expect(r.mrrEur).toBe(44.98);
    expect(r.payingSubscribers).toBe(2);
    expect(r.arpuEur).toBe(22.49);
    expect(r.byPlan[0]?.planId).toBe('pro');
  });

  it('charges failed-job cost to finished videos and ignores jobs outside the window', () => {
    const r = computeFinance({
      ...base,
      jobs: [
        {
          userId: 'a',
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 0.1,
          createdAt: daysAgo(1),
        },
        {
          userId: 'a',
          status: 'failed',
          modelTier: 'standard',
          apiCostUsd: 0.3,
          createdAt: daysAgo(2),
        },
        {
          userId: 'a',
          status: 'done',
          modelTier: 'premium',
          apiCostUsd: 1.1,
          createdAt: daysAgo(3),
        },
        {
          userId: 'a',
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 9,
          createdAt: daysAgo(40),
        },
      ],
    });
    expect(r.jobs).toBe(3);
    expect(r.variableCostUsd).toBe(1.5);
    expect(r.costPerDoneVideoUsd).toBe(0.75);
    expect(r.byTier[0]).toMatchObject({ tier: 'premium', costPerDoneUsd: 1.1 });
  });

  it('reports margin, profit, break-even and fixed-cost gaps', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      jobs: [
        {
          userId: 'a',
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 3,
          createdAt: daysAgo(5),
        },
      ],
      fixedCosts: [
        { name: 'Vercel', monthlyUsd: 20 },
        { name: 'Supabase', monthlyUsd: null },
      ],
    });
    // net: 29.99 / 1.2 - (29.99 * 0.015 + 0.25) = 24.2915 (rounded 24.29)
    expect(r.netRevenueMonthlyUsd).toBe(24.29);
    expect(r.variableCostMonthlyUsd).toBe(3);
    expect(r.profitMonthlyUsd).toBe(1.29);
    expect(r.fixedCostGaps).toEqual(['Supabase']);
    // contribution 21.29 per subscriber, fixed 20 => 1
    expect(r.breakEvenSubscribers).toBe(1);
  });

  it('has no break-even when each subscriber costs more than they pay', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [{ userId: 'a', planId: 'starter', status: 'active' }],
      jobs: [
        {
          userId: 'a',
          status: 'done',
          modelTier: 'premium',
          apiCostUsd: 30,
          createdAt: daysAgo(1),
        },
      ],
      fixedCosts: [{ name: 'Vercel', monthlyUsd: 20 }],
    });
    expect(r.breakEvenSubscribers).toBeNull();
    expect(r.profitMonthlyUsd).toBeLessThan(0);
  });
});
