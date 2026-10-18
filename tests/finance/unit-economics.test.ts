import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceJob } from '@/features/finance/unit-economics';

const now = new Date('2026-10-18T00:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);
const job = (over: Partial<FinanceJob>): FinanceJob => ({
  status: 'done',
  modelTier: 'standard',
  apiCostUsd: 0.05,
  actualCredits: 2000,
  createdAt: ago(1),
  ...over,
});
const base = { now, usdPerEur: 1, fixedMonthlyUsd: 0, windowDays: 30 };

describe('computeFinance', () => {
  it('sums MRR from live subscriptions only', () => {
    const r = computeFinance({
      ...base,
      jobs: [],
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'pro', status: 'canceled' },
      ],
    });
    expect(r.mrrEur).toBeCloseTo(14.99 + 29.99, 2);
    expect(r.payingSubscribers).toBe(2);
    expect(r.byPlan.pro?.subscribers).toBe(1);
  });

  it('averages cost per done video by tier and counts failed spend as waste', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [],
      jobs: [
        job({ apiCostUsd: 0.04 }),
        job({ apiCostUsd: 0.06 }),
        job({ modelTier: 'premium', apiCostUsd: 2, actualCredits: 40000 }),
        job({ status: 'failed', apiCostUsd: 0.3 }),
        job({ createdAt: ago(60), apiCostUsd: 9 }), // outside window
      ],
    });
    expect(r.tiers.find((t) => t.tier === 'standard')?.avgApiCostUsd).toBe(0.05);
    expect(r.tiers.find((t) => t.tier === 'premium')?.usdPer1kCredits).toBe(0.05);
    expect(r.wasteUsd).toBe(0.3);
    expect(r.failedJobs).toBe(1);
    expect(r.apiSpendUsd).toBeCloseTo(2.4, 4);
  });

  it('reports a loss when fixed costs exceed revenue', () => {
    const r = computeFinance({
      ...base,
      fixedMonthlyUsd: 100,
      jobs: [],
      subscriptions: [{ planId: 'starter', status: 'active' }],
    });
    expect(r.monthlyContributionUsd).toBeCloseTo(14.99 - 100, 2);
    expect(r.coverage).toBeLessThan(1);
  });

  it('has no coverage ratio when there are no costs', () => {
    expect(computeFinance({ ...base, jobs: [], subscriptions: [] }).coverage).toBeNull();
  });
});
