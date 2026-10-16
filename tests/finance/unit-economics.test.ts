import { describe, expect, it } from 'vitest';
import { computeUnitEconomics, netMonthlyUsd } from '@/features/finance/unit-economics';

const now = new Date('2026-10-16T00:00:00Z');
const job = (over: Partial<Parameters<typeof computeUnitEconomics>[0]['jobs'][number]> = {}) => ({
  status: 'done',
  modelTier: 'standard',
  createdAt: new Date('2026-10-10T00:00:00Z'),
  apiCostUsd: 0.1,
  chargedCredits: 2000,
  ...over,
});

describe('unit economics', () => {
  it('nets VAT and Stripe fees off a plan price', () => {
    // 29.99 EUR: /1.2 = 24.99, minus 0.45 + 0.25 = 24.29 EUR, x1.08
    expect(netMonthlyUsd(2999)).toBeCloseTo(26.23, 1);
  });

  it('counts only live subscriptions in MRR', () => {
    const r = computeUnitEconomics({
      now,
      subscriptions: [
        { userId: 'a', planId: 'pro', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'canceled' },
      ],
      jobs: [],
    });
    expect(r.payingSubscribers).toBe(1);
    expect(r.mrrGrossEur).toBeCloseTo(29.99);
    expect(r.grossMargin).toBe(1);
    expect(r.mrrToCostMultiple).toBeNull();
  });

  it('uses only the trailing 30 days of jobs and splits cost by tier', () => {
    const r = computeUnitEconomics({
      now,
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      jobs: [
        job(),
        job({ modelTier: 'premium', apiCostUsd: 1.1 }),
        job({ createdAt: new Date('2026-08-01T00:00:00Z'), apiCostUsd: 99 }),
      ],
    });
    expect(r.apiCost30dUsd).toBeCloseTo(1.2);
    expect(r.videos30d).toBe(2);
    expect(r.costByTier.premium).toBeCloseTo(1.1);
    expect(r.grossMargin).toBeGreaterThan(0.9);
  });
});
