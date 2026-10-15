import { describe, expect, it } from 'vitest';
import { computeUnitEconomics } from '@/features/metrics/unit-economics';

describe('computeUnitEconomics', () => {
  it('sums MRR over live subscriptions only', () => {
    const r = computeUnitEconomics({
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'pro', status: 'canceled' },
      ],
      jobs: [],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBeCloseTo(14.99 + 29.99, 5);
    expect(r.byPlan.pro?.subscribers).toBe(1);
    expect(r.netMrrUsd).toBeGreaterThan(0);
    expect(r.netMrrUsd).toBeLessThan(r.mrrEur * 1.08);
  });

  it('splits cost per credit by tier and isolates money burned on failures', () => {
    const r = computeUnitEconomics({
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        { status: 'done', modelTier: 'standard', actualCredits: 1000, apiCostUsd: 0.05 },
        { status: 'done', modelTier: 'premium', actualCredits: 10000, apiCostUsd: 1 },
        { status: 'failed', modelTier: 'premium', actualCredits: 0, apiCostUsd: 0.4 },
      ],
    });
    expect(r.doneJobs).toBe(2);
    expect(r.failedJobs).toBe(1);
    expect(r.failedCostUsd).toBeCloseTo(0.4);
    expect(r.byTier.premium?.costPerCreditUsd).toBeCloseTo(0.0001);
    expect(r.totalCostUsd).toBeCloseTo(1.45);
    expect(r.costToNetMrr).not.toBeNull();
  });

  it('returns null ratios on an empty book', () => {
    const r = computeUnitEconomics({ subscriptions: [], jobs: [] });
    expect(r.mrrEur).toBe(0);
    expect(r.costToNetMrr).toBeNull();
  });
});
