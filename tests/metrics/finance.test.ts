import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, netUsd, type FinanceInput } from '@/features/metrics/finance';

const NOW = new Date('2026-10-15T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = {
  now: NOW,
  subscriptions: [],
  topups: [],
  monthlyGrants: [],
  jobs: [],
};

describe('computeFinance', () => {
  it('returns zeros and nulls with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrNetUsd).toBe(0);
    expect(r.grossMarginPct).toBeNull();
    expect(r.costPerVideoUsd).toBeNull();
    expect(r.arpuNetUsd).toBeNull();
  });

  it('counts only live subscriptions in MRR', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'starter', status: 'trialing' },
        { planId: 'nonsense', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrGrossEur).toBe(44.98);
    expect(r.subscribersByPlan).toEqual({ pro: 1, starter: 1 });
    expect(r.mrrNetUsd).toBeCloseTo(netUsd(29.99) + netUsd(14.99), 1);
  });

  it('ignores activity outside the window and prices failed spend into cost per video', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      monthlyGrants: [{ credits: 100_000, createdAt: daysAgo(3) }],
      jobs: [
        {
          status: 'done',
          createdAt: daysAgo(2),
          apiCostUsd: 0.07,
          actualCredits: 2000,
          modelTier: 'standard',
        },
        {
          status: 'failed',
          createdAt: daysAgo(1),
          apiCostUsd: 0.03,
          actualCredits: 0,
          modelTier: 'standard',
        },
        {
          status: 'done',
          createdAt: daysAgo(60),
          apiCostUsd: 9,
          actualCredits: 9,
          modelTier: 'premium',
        },
      ],
    });
    expect(r.videosDone).toBe(1);
    expect(r.videosFailed).toBe(1);
    expect(r.apiSpendUsd).toBe(0.1);
    expect(r.costPerVideoUsd).toBe(0.1);
    expect(r.creditsMetered).toBe(2000);
    expect(r.grossMarginPct).toBeGreaterThan(99);
  });

  it('values a known top-up pack and skips unknown sizes', () => {
    const r = computeFinance({
      ...empty,
      topups: [
        { credits: 20_000, createdAt: daysAgo(1) },
        { credits: 123, createdAt: daysAgo(1) },
      ],
    });
    expect(r.topupNetUsd).toBeCloseTo(netUsd(12), 1);
    expect(r.creditsGranted).toBe(20_123);
  });
});
