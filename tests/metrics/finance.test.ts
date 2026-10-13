import { describe, expect, it } from 'vitest';
import { PLANS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { computeFinance, type FinanceJob } from '@/features/metrics/finance';

const NOW = new Date('2026-10-13T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const job = (o: Partial<FinanceJob>): FinanceJob => ({
  status: 'done',
  modelTier: 'standard',
  targetDurationSec: 15,
  apiCostUsd: 0.1,
  createdAt: daysAgo(1),
  ...o,
});

describe('computeFinance', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinance({ now: NOW, subscriptions: [], jobs: [] });
    expect(r.mrrEur).toBe(0);
    expect(r.grossMargin).toBeNull();
    expect(r.coverageMultiple).toBeNull();
    expect(r.window.costCoverage).toBeNull();
    expect(r.window.byTier).toEqual([]);
  });

  it('counts MRR only for live paid subscriptions', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'ultra', status: 'past_due' },
        { planId: 'nope', status: 'active' },
      ],
      jobs: [],
    });
    expect(r.payingSubscribers).toBe(3);
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1, ultra: 1 });
    const cents = PLANS.starter.priceCents + PLANS.pro.priceCents + PLANS.ultra.priceCents;
    expect(r.mrrEur).toBe(cents / 100);
    expect(r.arrEur).toBe((cents * 12) / 100);
    const net =
      netRevenueUsd(PLANS.starter.priceCents) +
      netRevenueUsd(PLANS.pro.priceCents) +
      netRevenueUsd(PLANS.ultra.priceCents);
    expect(r.netMrrUsd).toBeCloseTo(net, 2);
  });

  it('prices tiers, counts failed spend and ignores jobs outside the window', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        job({ apiCostUsd: 0.07 }),
        job({ apiCostUsd: 0.09, targetDurationSec: 30 }),
        job({ modelTier: 'premium', apiCostUsd: 1.1 }),
        job({ status: 'failed', apiCostUsd: 0.4 }),
        job({ apiCostUsd: 9, createdAt: daysAgo(31) }),
        job({ apiCostUsd: 9, createdAt: new Date(NOW.getTime() + 1000) }),
      ],
    });
    expect(r.window.videosDone).toBe(3);
    expect(r.window.jobsFailed).toBe(1);
    expect(r.window.totalCostUsd).toBe(1.66);
    expect(r.window.wastedCostUsd).toBe(0.4);
    expect(r.window.costPerPayingSubscriberUsd).toBe(1.66);
    expect(r.window.byTier).toEqual([
      {
        tier: 'premium',
        videos: 1,
        totalCostUsd: 1.1,
        avgCostUsd: 1.1,
        costPerVideoSecUsd: 0.0733,
      },
      {
        tier: 'standard',
        videos: 2,
        totalCostUsd: 0.16,
        avgCostUsd: 0.08,
        costPerVideoSecUsd: 0.0036,
      },
    ]);
    expect(r.coverageMultiple).toBeGreaterThan(1);
    expect(r.grossMargin).toBeGreaterThan(0);
  });

  it('flags unmetered costs through coverage', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [],
      jobs: [job({ apiCostUsd: 0 }), job({ apiCostUsd: 0 }), job({ apiCostUsd: 0.2 })],
    });
    expect(r.window.costCoverage).toBeCloseTo(0.333, 3);
  });
});
