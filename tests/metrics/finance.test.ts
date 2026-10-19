import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceInput } from '@/features/metrics/finance';
import { DAY_MS } from '@/features/metrics/north-star';
import { netRevenueUsd } from '@/features/billing/margin';

const NOW = new Date('2026-10-19T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = { now: NOW, windowDays: 30, jobs: [], subscriptions: [], topUps: [] };

describe('computeFinance', () => {
  it('is all zeros with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.apiCostUsd).toBe(0);
    expect(r.grossMarginPct).toBeNull();
    expect(r.breakEvenRatio).toBeNull();
  });

  it('sums MRR over live subscriptions only, by plan', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'past_due' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'mystery', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBe(44.98);
    expect(r.byPlan.pro).toEqual({ subscribers: 1, mrrEur: 29.99 });
    expect(r.netMrrUsd).toBeCloseTo(netRevenueUsd(1499) + netRevenueUsd(2999), 1);
  });

  it('splits API cost into finished videos and waste, inside the window only', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        { status: 'done', modelTier: 'standard', apiCostUsd: 0.1, createdAt: daysAgo(1) },
        { status: 'done', modelTier: 'standard', apiCostUsd: 0.2, createdAt: daysAgo(2) },
        { status: 'done', modelTier: 'premium', apiCostUsd: 1.5, createdAt: daysAgo(3) },
        { status: 'failed', modelTier: 'premium', apiCostUsd: 0.7, createdAt: daysAgo(4) },
        { status: 'done', modelTier: 'standard', apiCostUsd: 9, createdAt: daysAgo(40) },
      ],
    });
    expect(r.apiCostUsd).toBeCloseTo(2.5);
    expect(r.wastedApiCostUsd).toBeCloseTo(0.7);
    expect(r.videosFinished).toBe(3);
    expect(r.byTier.find((t) => t.tier === 'standard')?.costPerVideoUsd).toBeCloseTo(0.15);
  });

  it('counts top-ups by pack in the window and computes margin + break-even', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      topUps: [
        { credits: 20_000, createdAt: daysAgo(5) },
        { credits: 20_000, createdAt: daysAgo(50) },
        { credits: 123, createdAt: daysAgo(1) },
      ],
      jobs: [{ status: 'done', modelTier: 'standard', apiCostUsd: 5, createdAt: daysAgo(2) }],
      fixedMonthlyCostUsd: 20,
    });
    expect(r.topUpRevenueEur).toBe(12);
    const revenue = netRevenueUsd(2999) + netRevenueUsd(1200);
    expect(r.revenueNetUsd).toBeCloseTo(revenue, 1);
    expect(r.grossMarginUsd).toBeCloseTo(revenue - 5, 1);
    expect(r.contributionUsd).toBeCloseTo(revenue - 5 - 20, 1);
    expect(r.breakEvenRatio).toBeCloseTo((revenue - 5) / 20, 1);
  });
});
