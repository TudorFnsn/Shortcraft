import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceInput } from '@/features/finance/unit-economics';

const NOW = new Date('2026-10-17T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const empty: FinanceInput = { now: NOW, subscriptions: [], jobs: [] };

describe('computeFinance', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.arpuEur).toBeNull();
    expect(r.costPerFinishedVideoUsd).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.byTier).toEqual([]);
  });

  it('sums MRR from live subscriptions on known plans only', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'past_due' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'legacy', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBe(44.98);
    expect(r.arpuEur).toBe(22.49);
    expect(r.netMrrUsd).toBeGreaterThan(0);
    expect(r.netMrrUsd).toBeLessThan(r.mrrEur * 1.08);
  });

  it('charges failed jobs to the finished ones and ignores jobs outside the window', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        {
          status: 'done',
          modelTier: 'standard',
          createdAt: daysAgo(2),
          apiCostUsd: 0.1,
          actualCredits: 2000,
        },
        {
          status: 'failed',
          modelTier: 'standard',
          createdAt: daysAgo(3),
          apiCostUsd: 0.3,
          actualCredits: 0,
        },
        {
          status: 'done',
          modelTier: 'premium',
          createdAt: daysAgo(40),
          apiCostUsd: 9,
          actualCredits: 9,
        },
      ],
    });
    expect(r.finishedVideos).toBe(1);
    expect(r.apiSpendUsd).toBe(0.4);
    expect(r.failedSpendUsd).toBe(0.3);
    expect(r.costPerFinishedVideoUsd).toBe(0.4);
    expect(r.byTier).toHaveLength(1);
    expect(r.byTier[0]?.costUsdPer1kCredits).toBe(0.2);
    expect(r.grossMargin).toBeGreaterThan(0.9);
  });
});
