import { describe, expect, it } from 'vitest';
import { computeFinance, netUsdPerPayment, type FinanceInput } from '@/features/metrics/finance';

const NOW = new Date('2026-10-17T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const empty: FinanceInput = { subscriptions: [], jobs: [], fixedMonthlyCostUsd: 0, now: NOW };

describe('computeFinance', () => {
  it('is all zeros with no data, and margin is null', () => {
    const r = computeFinance(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.grossMargin).toBeNull();
    expect(r.perTier).toEqual([]);
    expect(r.monthlyProfitUsd).toBe(0);
  });

  it('counts only live subscriptions on sold plans toward MRR', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'enterprise', status: 'active' },
      ],
    });
    expect(r.mrrEur).toBeCloseTo(14.99 + 29.99);
    expect(r.mrrByPlan.pro).toEqual({ subscribers: 1, mrrEur: 29.99 });
  });

  it('averages cost per finished video by tier and keeps failed spend separate', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        { status: 'done', modelTier: 'standard', apiCostUsd: 0.1, createdAt: daysAgo(1) },
        { status: 'done', modelTier: 'standard', apiCostUsd: 0.2, createdAt: daysAgo(2) },
        { status: 'done', modelTier: 'premium', apiCostUsd: 1.5, createdAt: daysAgo(3) },
        { status: 'failed', modelTier: 'premium', apiCostUsd: 0.4, createdAt: daysAgo(3) },
        { status: 'done', modelTier: 'standard', apiCostUsd: 9, createdAt: daysAgo(40) },
      ],
    });
    expect(r.perTier.find((t) => t.tier === 'standard')?.avgCostUsd).toBeCloseTo(0.15);
    expect(r.perTier.find((t) => t.tier === 'premium')?.videos).toBe(1);
    expect(r.apiCostUsd30d).toBeCloseTo(2.2);
    expect(r.failedCostUsd30d).toBeCloseTo(0.4);
  });

  it('computes gross margin and profit after fixed costs', () => {
    const net = netUsdPerPayment(1499);
    const r = computeFinance({
      ...empty,
      subscriptions: [{ planId: 'starter', status: 'active' }],
      jobs: [{ status: 'done', modelTier: 'standard', apiCostUsd: 1, createdAt: daysAgo(1) }],
      fixedMonthlyCostUsd: 5,
    });
    expect(r.netMrrUsd).toBeCloseTo(net);
    expect(r.grossMargin).toBeCloseTo((net - 1) / net);
    expect(r.monthlyProfitUsd).toBeCloseTo(net - 1 - 5);
  });
});
