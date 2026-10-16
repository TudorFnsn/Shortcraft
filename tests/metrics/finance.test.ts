import { describe, expect, it } from 'vitest';
import { computeFinance, netOfVatAndFees, type FinanceInput } from '@/features/metrics/finance';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';
import { DAY_MS } from '@/features/metrics/north-star';

const NOW = new Date('2026-10-16T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = { subscriptions: [], jobs: [], topUps: [], now: NOW };

describe('computeFinance', () => {
  it('is all zeros / null with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.arpuEur).toBeNull();
    expect(r.apiCostRatio).toBeNull();
    expect(r.revenueMultiple).toBeNull();
    expect(r.costUsdPer1kCredits).toBeNull();
  });

  it('sums MRR over live subscriptions only', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'trialing' },
        { userId: 'c', planId: 'ultra', status: 'canceled' },
        { userId: 'd', planId: 'nope', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBe(44.98);
    expect(r.arpuEur).toBe(22.49);
    expect(r.byPlan).toEqual({ starter: 1, pro: 1 });
    expect(r.netMrrEur).toBeLessThan(r.mrrEur);
  });

  it('takes VAT and the Stripe fee off revenue', () => {
    const a = REVENUE_ASSUMPTIONS;
    expect(netOfVatAndFees(29.99, a)).toBeCloseTo(29.99 / 1.2 - (29.99 * 0.015 + 0.25), 6);
    expect(netOfVatAndFees(0.1, a)).toBe(0);
  });

  it('splits API cost into finished and failed, per tier, inside the 30-day window', () => {
    const job = (status: string, tier: string, cost: number, credits: number, age: number) => ({
      status,
      modelTier: tier,
      apiCostUsd: cost,
      chargedCredits: credits,
      createdAt: daysAgo(age),
    });
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      topUps: [
        { credits: 20_000, createdAt: daysAgo(2) },
        { credits: 20_000, createdAt: daysAgo(45) },
        { credits: 1, createdAt: daysAgo(1) },
      ],
      jobs: [
        job('done', 'standard', 0.1, 2000, 1),
        job('done', 'standard', 0.2, 2000, 3),
        job('done', 'premium', 1.5, 26000, 4),
        job('failed', 'premium', 0.5, 0, 5),
        job('done', 'standard', 9, 9, 40),
      ],
      fixedCostsUsdPerMonth: 5,
    });
    expect(r.jobsFinished).toBe(3);
    expect(r.jobsFailed).toBe(1);
    expect(r.apiCostUsd).toBe(2.3);
    expect(r.failedCostUsd).toBe(0.5);
    expect(r.topUpRevenueEur).toBe(12);
    expect(r.tiers).toEqual([
      { tier: 'premium', finished: 1, costUsd: 1.5, costPerVideoUsd: 1.5, credits: 26000 },
      { tier: 'standard', finished: 2, costUsd: 0.3, costPerVideoUsd: 0.15, credits: 4000 },
    ]);
    expect(r.costUsdPer1kCredits).toBeCloseTo((1.8 / 30000) * 1000, 3);
    expect(r.revenueMultiple).toBeCloseTo(r.netRevenueUsd / 7.3, 1);
    expect(r.grossProfitUsd).toBeCloseTo(r.netRevenueUsd - 7.3, 1);
  });
});
