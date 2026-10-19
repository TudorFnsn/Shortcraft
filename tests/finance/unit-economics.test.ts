import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/features/metrics/north-star';
import { computeFinance, type FinanceInput } from '@/features/finance/unit-economics';

const NOW = new Date('2026-10-19T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = { subscriptions: [], jobs: [], topUps: [], now: NOW, fixedCosts: [] };

describe('computeFinance', () => {
  it('is all zeros / n/a with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.grossMargin).toBeNull();
    expect(r.breakEvenSubscribers).toBeNull();
    expect(r.tiers.standard.avgCostUsd).toBeNull();
  });

  it('sums MRR over live subscriptions only', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'past_due' },
        { userId: 'c', planId: 'ultra', status: 'canceled' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBe(44.98);
    expect(r.arrEur).toBe(539.76);
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1, ultra: 0 });
  });

  it('averages cost per finished video by tier and counts failed spend as waste', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        {
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 0.04,
          actualCredits: 2000,
          createdAt: daysAgo(1),
        },
        {
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 0.06,
          actualCredits: 3000,
          createdAt: daysAgo(2),
        },
        {
          status: 'done',
          modelTier: 'premium',
          apiCostUsd: 1.9,
          actualCredits: 40000,
          createdAt: daysAgo(3),
        },
        {
          status: 'failed',
          modelTier: 'premium',
          apiCostUsd: 0.5,
          actualCredits: 0,
          createdAt: daysAgo(4),
        },
        {
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 9,
          actualCredits: 1,
          createdAt: daysAgo(31),
        },
      ],
    });
    expect(r.videosFinished).toBe(3);
    expect(r.tiers.standard).toMatchObject({ videos: 2, avgCostUsd: 0.05, avgCredits: 2500 });
    expect(r.tiers.standard.costPer1kCreditsUsd).toBe(0.02);
    expect(r.tiers.premium.avgCostUsd).toBe(1.9);
    expect(r.failedJobs).toBe(1);
    expect(r.wastedCostUsd).toBe(0.5);
    expect(r.variableCostUsd).toBe(2.5);
  });

  it('matches top-ups to packs by credits and flags the rest', () => {
    const r = computeFinance({
      ...empty,
      topUps: [
        { credits: 20_000, createdAt: daysAgo(2) },
        { credits: 777, createdAt: daysAgo(2) },
        { credits: 20_000, createdAt: daysAgo(40) },
      ],
    });
    expect(r.topUpNetUsd).toBeGreaterThan(0);
    expect(r.topUpUnmatched).toBe(1);
  });

  it('computes margin, cash after costs, break-even and gaps', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      jobs: [
        {
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 1,
          actualCredits: 1,
          createdAt: daysAgo(1),
        },
      ],
      fixedCosts: [
        { id: 'x', label: 'X', monthlyUsd: 10, note: '' },
        { id: 'y', label: 'Y', monthlyUsd: null, note: '' },
      ],
      invoicedUsd: 3,
    });
    expect(r.fixedCostUsd).toBe(10);
    expect(r.fixedCostGaps).toEqual(['Y']);
    expect(r.grossMargin).toBeCloseTo((r.netRevenueUsd - 1) / r.netRevenueUsd, 2);
    expect(r.cashAfterCostsUsd).toBeCloseTo(r.netRevenueUsd - 11, 2);
    expect(r.breakEvenSubscribers).toBe(1);
    expect(r.invoiceGapUsd).toBe(2);
  });
});
