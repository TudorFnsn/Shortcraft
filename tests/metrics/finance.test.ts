import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, netUsd, type FinanceInput } from '@/features/metrics/finance';

const NOW = new Date('2026-10-19T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const base: FinanceInput = {
  now: NOW,
  subscriptions: [],
  jobs: [],
  topUps: [],
  fixedMonthlyUsd: 0,
};

describe('netUsd', () => {
  it('takes VAT and Stripe fees off a EUR price and converts to USD', () => {
    // 29.99 / 1.2 − 29.99 × 1.5% − 0.25 = 24.2917… EUR → × 1.08
    expect(netUsd(2999)).toBeCloseTo(26.23, 1);
    expect(netUsd(0)).toBe(0);
  });
});

describe('computeFinance', () => {
  it('is all zeros / null ratios with no data', () => {
    const r = computeFinance(base);
    expect(r.mrrNetUsd).toBe(0);
    expect(r.arpuNetUsd).toBeNull();
    expect(r.revenueToApiCost).toBeNull();
    expect(r.revenueToAllCosts).toBeNull();
    expect(r.cashMarginUsd).toBe(0);
  });

  it('counts only live paid subscriptions in MRR and the plan mix', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [
        { userId: 'a', planId: 'pro', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'canceled' },
        { userId: 'c', planId: 'starter', status: 'trialing' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.planMix).toEqual({ pro: 1, starter: 1 });
    expect(r.mrrGrossEur).toBeCloseTo(44.98, 2);
  });

  it('averages API cost per finished video by tier and tracks wasted spend on failures', () => {
    const r = computeFinance({
      ...base,
      jobs: [
        { status: 'done', modelTier: 'standard', apiCostUsd: 0.1, createdAt: daysAgo(1) },
        { status: 'done', modelTier: 'standard', apiCostUsd: 0.2, createdAt: daysAgo(2) },
        { status: 'done', modelTier: 'premium', apiCostUsd: 1.2, createdAt: daysAgo(3) },
        { status: 'failed', modelTier: 'premium', apiCostUsd: 0.5, createdAt: daysAgo(3) },
        { status: 'done', modelTier: 'standard', apiCostUsd: 9, createdAt: daysAgo(40) },
      ],
    });
    expect(r.byTier.standard).toEqual({ videos: 2, avgCostUsd: 0.15, totalCostUsd: 0.3 });
    expect(r.byTier.premium?.avgCostUsd).toBe(1.2);
    expect(r.apiCostUsd30d).toBe(2);
    expect(r.failedCostUsd30d).toBe(0.5);
  });

  it('reports cash margin after API and fixed costs, with top-ups in the window only', () => {
    const r = computeFinance({
      ...base,
      fixedMonthlyUsd: 50,
      subscriptions: [{ userId: 'a', planId: 'ultra', status: 'active' }],
      topUps: [
        { amountCents: 1200, createdAt: daysAgo(5) },
        { amountCents: 5900, createdAt: daysAgo(60) },
      ],
      jobs: [{ status: 'done', modelTier: 'standard', apiCostUsd: 10, createdAt: daysAgo(1) }],
    });
    const revenue = r.mrrNetUsd + r.topUpNetUsd;
    expect(r.topUpNetUsd).toBeCloseTo(netUsd(1200), 2);
    expect(r.cashMarginUsd).toBeCloseTo(revenue - 60, 1);
    expect(r.revenueToApiCost).toBeCloseTo(revenue / 10, 1);
    expect(r.revenueToAllCosts).toBeCloseTo(revenue / 60, 1);
  });
});
