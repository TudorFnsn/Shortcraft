import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceInput } from '@/features/metrics/finance';
import { PLANS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';

const NOW = new Date('2026-10-16T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = { subscriptions: [], jobs: [], topUps: [], vendors: [], now: NOW };

describe('computeFinance', () => {
  it('is all zeros and n/a with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrUsd).toBe(0);
    expect(r.arpuUsd).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.fixedCostCover).toBeNull();
    expect(r.tiers).toEqual([]);
  });

  it('sums net MRR over live subscriptions on sold plans only', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'starter', status: 'past_due' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'legacy', status: 'active' },
      ],
    });
    const expected = netRevenueUsd(PLANS.pro.priceCents) + netRevenueUsd(PLANS.starter.priceCents);
    expect(r.mrrUsd).toBeCloseTo(expected, 2);
    expect(r.payingSubscribers).toBe(2);
    expect(r.subscribersByPlan).toEqual({ pro: 1, starter: 1 });
    expect(r.arrUsd).toBeCloseTo(expected * 12, 1);
  });

  it('prices top-ups by pack and ignores old or unknown ones', () => {
    const r = computeFinance({
      ...empty,
      topUps: [
        { credits: 20_000, createdAt: daysAgo(3) },
        { credits: 20_000, createdAt: daysAgo(40) },
        { credits: 12_345, createdAt: daysAgo(1) },
      ],
    });
    expect(r.topUpRevenue30dUsd).toBeCloseTo(netRevenueUsd(1200), 2);
  });

  it('counts failed-job spend, averages cost over finished videos per tier', () => {
    const job = (status: string, tier: string, cost: number, daysOld = 1) => ({
      status,
      modelTier: tier,
      apiCostUsd: cost,
      actualCredits: status === 'done' ? 1000 : 0,
      createdAt: daysAgo(daysOld),
    });
    const r = computeFinance({
      ...empty,
      jobs: [
        job('done', 'premium', 1.0),
        job('failed', 'premium', 0.5),
        job('done', 'standard', 0.1),
        job('done', 'standard', 9, 45),
      ],
    });
    expect(r.apiSpend30dUsd).toBeCloseTo(1.6, 2);
    expect(r.failedSpend30dUsd).toBeCloseTo(0.5, 2);
    expect(r.tiers.find((t) => t.tier === 'premium')?.avgCostPerDoneVideoUsd).toBe(1.5);
    expect(r.tiers.find((t) => t.tier === 'standard')?.jobs).toBe(1);
  });

  it('computes margin, cash contribution and flags unknown vendors', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        {
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 2,
          actualCredits: 1,
          createdAt: daysAgo(2),
        },
      ],
      vendors: [
        { vendor: 'Vercel', kind: 'fixed', monthlyUsd: 20 },
        { vendor: 'Sentry', kind: 'fixed', monthlyUsd: null },
        { vendor: 'fal.ai', kind: 'variable', monthlyUsd: null },
      ],
    });
    const mrr = netRevenueUsd(PLANS.pro.priceCents);
    expect(r.grossMargin).toBeCloseTo((mrr - 2) / mrr, 3);
    expect(r.fixedCostsMonthlyUsd).toBe(20);
    expect(r.unknownVendors).toEqual(['Sentry']);
    expect(r.cashContribution30dUsd).toBeCloseTo(mrr - 2 - 20, 1);
    expect(r.fixedCostCover).toBeCloseTo((mrr - 2) / 20, 1);
  });
});
