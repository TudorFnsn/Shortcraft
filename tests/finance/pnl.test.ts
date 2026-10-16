import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceInput } from '@/features/finance/pnl';
import { DAY_MS } from '@/features/metrics/north-star';
import { netRevenueUsd } from '@/features/billing/margin';

const NOW = new Date('2026-10-16T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = { now: NOW, subscriptions: [], jobs: [], topUps: [], fixedCosts: [] };

describe('computeFinance', () => {
  it('is all zeros with n/a ratios and no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrGrossEur).toBe(0);
    expect(r.arpuNetUsd).toBeNull();
    expect(r.avgCostPerVideoUsd).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.netProfitUsd).toBe(0);
  });

  it('sums MRR over live subscriptions only', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'past_due' },
        { planId: 'ultra', status: 'canceled' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrGrossEur).toBeCloseTo(14.99 + 29.99, 2);
    expect(r.mrrNetUsd).toBeCloseTo(netRevenueUsd(1499) + netRevenueUsd(2999), 1);
  });

  it('counts failed jobs in cost but not in videos, and ignores jobs older than 30 days', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        { status: 'done', modelTier: 'standard', apiCostUsd: 0.1, createdAt: daysAgo(1) },
        { status: 'failed', modelTier: 'premium', apiCostUsd: 0.5, createdAt: daysAgo(2) },
        { status: 'done', modelTier: 'premium', apiCostUsd: 1.5, createdAt: daysAgo(3) },
        { status: 'done', modelTier: 'premium', apiCostUsd: 9, createdAt: daysAgo(40) },
      ],
    });
    expect(r.videosDone30d).toBe(2);
    expect(r.apiCostUsd30d).toBe(2.1);
    expect(r.avgCostPerVideoUsd).toBe(1.05);
    expect(r.costByTier[0]).toMatchObject({ tier: 'premium', videos: 1, totalCostUsd: 2 });
  });

  it('lists unfilled fixed costs and subtracts the filled ones', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      fixedCosts: [
        { id: 'vercel', label: 'Vercel', monthlyCents: 2000 },
        { id: 'supabase', label: 'Supabase', monthlyCents: null },
      ],
    });
    expect(r.unfilledFixedCosts).toEqual(['supabase']);
    expect(r.fixedCostsUsd).toBeCloseTo(21.6, 2);
    expect(r.netProfitUsd).toBeCloseTo(r.grossProfitUsd - 21.6, 2);
    expect(r.grossMargin).toBe(1);
  });

  it('includes top-ups from the last 30 days in revenue', () => {
    const r = computeFinance({
      ...empty,
      topUps: [
        { priceCents: 1200, createdAt: daysAgo(5) },
        { priceCents: 1200, createdAt: daysAgo(45) },
      ],
    });
    expect(r.topUpNetUsd30d).toBeCloseTo(netRevenueUsd(1200), 2);
  });
});
