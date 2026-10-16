import { describe, expect, it } from 'vitest';
import { PLANS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import {
  computeFinance,
  DAY_MS,
  type FinanceInput,
  type FinanceJob,
} from '@/features/finance/unit-economics';

const NOW = new Date('2026-10-16T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const base: FinanceInput = { now: NOW, windowDays: 30, jobs: [], subscriptions: [] };
const job = (over: Partial<FinanceJob>): FinanceJob => ({
  status: 'done',
  createdAt: daysAgo(1),
  modelTier: 'standard',
  apiCostUsd: 0.04,
  actualCredits: 2000,
  ...over,
});

describe('computeFinance', () => {
  it('is all zeros / null ratios with no data', () => {
    const r = computeFinance(base);
    expect(r.mrrNetUsd).toBe(0);
    expect(r.coverage).toBeNull();
    expect(r.costToMrr).toBeNull();
    expect(r.creditsPerUsd).toBeNull();
    expect(r.tiers).toEqual([]);
  });

  it('sums MRR from live subscriptions only, one per user', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [
        { userId: 'a', planId: 'pro', status: 'active' },
        { userId: 'a', planId: 'pro', status: 'active' }, // duplicate row
        { userId: 'b', planId: 'starter', status: 'trialing' },
        { userId: 'c', planId: 'ultra', status: 'canceled' },
        { userId: 'd', planId: 'bogus', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1, ultra: 0 });
    expect(r.mrrGrossEur).toBeCloseTo((PLANS.pro.priceCents + PLANS.starter.priceCents) / 100, 2);
    expect(r.mrrNetUsd).toBeCloseTo(
      netRevenueUsd(PLANS.pro.priceCents) + netRevenueUsd(PLANS.starter.priceCents),
      2,
    );
  });

  it('splits cost by tier and counts failed jobs as waste', () => {
    const r = computeFinance({
      ...base,
      jobs: [
        job({}),
        job({ apiCostUsd: 0.06 }),
        job({ status: 'failed', apiCostUsd: 0.5, modelTier: 'premium' }),
        job({ modelTier: 'premium', apiCostUsd: 1.9, actualCredits: 40_000 }),
        job({ createdAt: daysAgo(45), apiCostUsd: 99 }), // outside the window
      ],
    });
    expect(r.variableCostUsd).toBeCloseTo(2.5, 4);
    expect(r.wastedCostUsd).toBeCloseTo(0.5, 4);
    const premium = r.tiers.find((t) => t.tier === 'premium');
    expect(premium).toMatchObject({ finished: 1, failed: 1, wastedUsd: 0.5 });
    expect(premium?.costPerFinishedUsd).toBeCloseTo(2.4, 4);
    expect(r.tiers[0]?.tier).toBe('premium'); // biggest spend first
  });

  it('scales variable cost to 30 days and reports profit and coverage', () => {
    const r = computeFinance({
      ...base,
      windowDays: 15,
      jobs: [job({ apiCostUsd: 3 })],
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      fixedCosts: [{ name: 'Supabase', monthlyUsd: 10 }],
    });
    expect(r.variableCostMonthlyUsd).toBe(6);
    expect(r.fixedCostUsd).toBe(10);
    const net = netRevenueUsd(PLANS.pro.priceCents);
    expect(r.monthlyProfitUsd).toBeCloseTo(net - 16, 2);
    expect(r.coverage).toBeCloseTo(net / 16, 2);
    expect(r.costToMrr).toBeCloseTo(6 / net, 3);
  });

  it('reports credits charged per USD of API cost on finished jobs', () => {
    const r = computeFinance({ ...base, jobs: [job({ apiCostUsd: 0.1, actualCredits: 3000 })] });
    expect(r.creditsPerUsd).toBe(30_000);
    expect(r.creditsBurned).toBe(3000);
  });
});
