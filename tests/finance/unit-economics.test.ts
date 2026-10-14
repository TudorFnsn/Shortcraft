import { describe, expect, it } from 'vitest';
import { computeUnitEconomics } from '@/features/finance/unit-economics';

const now = new Date('2026-10-14T00:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86_400_000);
const assumptions = { eurToUsd: 1, netRevenueShare: 0.5 };

describe('computeUnitEconomics', () => {
  it('computes MRR, cost per video and the MRR ratio', () => {
    const r = computeUnitEconomics({
      now,
      windowDays: 30,
      assumptions,
      subscriptions: [
        { priceCents: 3000, live: true },
        { priceCents: 3000, live: true },
        { priceCents: 9999, live: false },
      ],
      jobs: [
        { status: 'done', apiCostUsd: 1, createdAt: day(1) },
        { status: 'done', apiCostUsd: 1, createdAt: day(2) },
        { status: 'failed', apiCostUsd: 0.5, createdAt: day(3) },
        { status: 'done', apiCostUsd: 99, createdAt: day(40) },
      ],
      fixedCosts: [{ name: 'x', monthlyUsd: 7.5, confirmed: false }],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.netMrrUsd).toBe(30);
    expect(r.variableCostUsd).toBe(2.5);
    expect(r.costPerFinishedVideoUsd).toBe(1.25);
    expect(r.failedCostUsd).toBe(0.5);
    expect(r.unconfirmedFixedUsd).toBe(7.5);
    expect(r.mrrRatio).toBe(3);
    expect(r.grossMarginPct).toBe(66.7);
  });

  it('returns null ratios when there is nothing to divide by', () => {
    const r = computeUnitEconomics({
      now,
      windowDays: 30,
      subscriptions: [],
      jobs: [],
      fixedCosts: [],
    });
    expect(r.mrrRatio).toBeNull();
    expect(r.costPerFinishedVideoUsd).toBeNull();
    expect(r.grossMarginPct).toBeNull();
  });
});
