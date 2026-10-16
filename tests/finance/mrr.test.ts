import { describe, expect, it } from 'vitest';
import { computeFinance } from '@/features/finance/mrr';

const base = { creditsCharged: 0, blendedUsdPerCredit: 0, fixedCostsUsd: 0 };

describe('computeFinance', () => {
  it('is empty with no subscribers', () => {
    const r = computeFinance({ ...base, subscriptions: [] });
    expect(r.payingSubscribers).toBe(0);
    expect(r.netMrrUsd).toBe(0);
    expect(r.mrrToCostRatio).toBeNull();
    expect(r.grossMarginPct).toBeNull();
  });

  it('counts only live subscriptions and ignores unknown plans', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'nope', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(1);
    expect(r.byPlan).toEqual({ pro: 1 });
    expect(r.grossMrrEur).toBe(29.99);
    expect(r.netMrrUsd).toBeGreaterThan(0);
    expect(r.netMrrUsd).toBeLessThan(29.99 * 1.08);
  });

  it('prefers measured spend and reports the ratio and burn', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [{ planId: 'ultra', status: 'active' }],
      creditsCharged: 1_000_000,
      blendedUsdPerCredit: 1,
      measuredApiCostUsd: 10,
      fixedCostsUsd: 10,
    });
    expect(r.apiCostSource).toBe('measured');
    expect(r.apiCostUsd).toBe(10);
    expect(r.totalCostUsd).toBe(20);
    expect(r.mrrToCostRatio).toBeCloseTo(r.netMrrUsd / 20);
    expect(r.burnUsd).toBeCloseTo(r.netMrrUsd - 20);
  });

  it('estimates spend from credits when nothing is measured', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [],
      creditsCharged: 10_000,
      blendedUsdPerCredit: 0.0001,
    });
    expect(r.apiCostSource).toBe('estimated');
    expect(r.apiCostUsd).toBeCloseTo(1);
  });
});
