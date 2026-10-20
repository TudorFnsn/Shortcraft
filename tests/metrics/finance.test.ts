import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceInput } from '@/features/metrics/finance';
import { netRevenueUsd } from '@/features/billing/margin';

const NOW = new Date('2026-10-20T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const empty: FinanceInput = {
  subscriptions: [],
  jobs: [],
  topUpsCents: [],
  fixedCostUsdMonthly: null,
  now: NOW,
};

describe('computeFinance', () => {
  it('has no ratios without revenue', () => {
    const r = computeFinance({ ...empty, fixedCostUsdMonthly: 50 });
    expect(r.mrrEur).toBe(0);
    expect(r.costToMrr).toBeNull();
    expect(r.marginPct).toBeNull();
    expect(r.monthlyProfitUsd).toBe(-50);
  });

  it('sums live subscriptions only and nets VAT + fees', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'trialing' },
        { userId: 'c', planId: 'pro', status: 'canceled' },
        { userId: 'd', planId: 'nope', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1 });
    expect(r.mrrEur).toBe(44.98);
    expect(r.arrEur).toBe(539.76);
    expect(r.netMrrUsd).toBeCloseTo(netRevenueUsd(1499) + netRevenueUsd(2999), 2);
  });

  it('counts API cost of every status in the window, failed jobs as waste', () => {
    const job = (status: string, tier: string, cost: number, credits: number, age: number) => ({
      status,
      modelTier: tier,
      apiCostUsd: cost,
      actualCredits: credits,
      createdAt: daysAgo(age),
    });
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      fixedCostUsdMonthly: 10,
      jobs: [
        job('done', 'standard', 0.07, 2000, 1),
        job('done', 'standard', 0.09, 3000, 2),
        job('failed', 'premium', 1.1, 0, 3),
        job('done', 'premium', 1.1, 26_500, 4),
        job('done', 'standard', 5, 1, 40), // outside the window
      ],
    });
    expect(r.apiCostUsd).toBe(2.36);
    expect(r.failedCostUsd).toBe(1.1);
    const std = r.byTier.find((t) => t.tier === 'standard');
    expect(std).toMatchObject({ videos: 2, costPerVideoUsd: 0.08 });
    expect(std?.costPer1kCreditsUsd).toBe(0.032);
    const prem = r.byTier.find((t) => t.tier === 'premium');
    expect(prem).toMatchObject({ videos: 1, failed: 1, costPerVideoUsd: 1.1 });
    expect(r.totalCostUsd).toBe(12.36);
    expect(r.costToMrr).toBeCloseTo(12.36 / r.netMrrUsd, 3);
    expect(r.marginPct).toBeGreaterThan(0);
  });
});
