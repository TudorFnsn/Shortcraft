import { describe, expect, it } from 'vitest';
import {
  computeFinance,
  DAY_MS,
  netUsdPerGrossEur,
  type FinanceJob,
} from '@/features/metrics/finance';

const NOW = new Date('2026-10-16T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const job = (over: Partial<FinanceJob> = {}): FinanceJob => ({
  status: 'done',
  createdAt: daysAgo(1),
  actualCredits: 2000,
  apiCostUsd: 0.1,
  modelTier: 'standard',
  ...over,
});

describe('computeFinance', () => {
  it('is all zeros / null with no data', () => {
    const r = computeFinance({ subscriptions: [], jobs: [], now: NOW });
    expect(r.mrrEur).toBe(0);
    expect(r.arpuEur).toBeNull();
    expect(r.burnRatio).toBeNull();
    expect(r.byTier.standard.avgCostPerVideoUsd).toBeNull();
  });

  it('sums MRR from live subscriptions on known plans only', () => {
    const r = computeFinance({
      now: NOW,
      jobs: [],
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'ultra', status: 'canceled' },
        { planId: 'legacy', status: 'active' },
      ],
    });
    expect(r.mrrEur).toBe(14.99 + 29.99);
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1, ultra: 0 });
    expect(r.arpuEur).toBe(22.49);
    expect(r.netMrrUsd).toBeCloseTo(44.98 * netUsdPerGrossEur(), 1);
  });

  it('meters API cost per tier, counts failed spend, ignores jobs outside the window', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        job({ apiCostUsd: 0.1 }),
        job({ apiCostUsd: 0.3 }),
        job({ modelTier: 'premium', apiCostUsd: 1.1, actualCredits: 26_504 }),
        job({ status: 'failed', apiCostUsd: 0.5 }),
        job({ createdAt: daysAgo(40), apiCostUsd: 99 }),
        job({ createdAt: new Date(NOW.getTime() + DAY_MS), apiCostUsd: 99 }),
      ],
    });
    expect(r.jobsInWindow).toBe(4);
    expect(r.apiCostUsd).toBe(2);
    expect(r.failedCostUsd).toBe(0.5);
    expect(r.byTier.standard).toMatchObject({ videos: 2, avgCostPerVideoUsd: 0.2 });
    expect(r.byTier.premium).toMatchObject({ videos: 1, creditsCharged: 26_504 });
  });

  it('scales the window to 30 days and includes fixed costs in burn', () => {
    const r = computeFinance({
      now: NOW,
      windowDays: 15,
      fixedMonthlyCostUsd: 10,
      subscriptions: [{ planId: 'ultra', status: 'active' }],
      jobs: [job({ apiCostUsd: 5 })],
    });
    // 5 USD over 15 days -> 10 USD per 30 days, plus 10 fixed.
    const expected = r.netMrrUsd - 20;
    expect(r.monthlyContributionUsd).toBeCloseTo(expected, 1);
    expect(r.burnRatio).toBeCloseTo(20 / r.netMrrUsd, 2);
  });
});
