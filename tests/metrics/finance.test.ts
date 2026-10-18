import { describe, expect, it } from 'vitest';
import {
  computeFinance,
  DAY_MS,
  type FinanceInput,
  type FinanceJob,
} from '@/features/metrics/finance';

const NOW = new Date('2026-10-18T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);

const job = (over: Partial<FinanceJob>): FinanceJob => ({
  userId: 'u1',
  status: 'done',
  modelTier: 'standard',
  createdAt: daysAgo(1),
  apiCostUsd: 0.07,
  chargedCredits: 2024,
  ...over,
});

const empty: FinanceInput = { now: NOW, jobs: [], subscriptions: [], payerIds: new Set() };

describe('computeFinance', () => {
  it('returns zeros and a null ratio with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.costToMrr).toBeNull();
    expect(r.byTier).toEqual([]);
    expect(r.asOf).toBe(NOW.toISOString());
  });

  it('sums MRR over live subscriptions on sold plans only', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'trialing' },
        { userId: 'c', planId: 'pro', status: 'canceled' },
        { userId: 'd', planId: 'legacy', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1, ultra: 0 });
    expect(r.mrrEur).toBe(44.98);
    expect(r.netMrrUsd).toBeGreaterThan(0);
    expect(r.netMrrUsd).toBeLessThan(r.mrrEur * 1.08);
  });

  it('counts failed jobs as waste and unpaid users as trial burn', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'p', planId: 'pro', status: 'active' }],
      payerIds: new Set(['p']),
      jobs: [
        job({ userId: 'p', apiCostUsd: 1 }),
        job({ userId: 'p', status: 'failed', apiCostUsd: 0.5 }),
        job({ userId: 'trial', apiCostUsd: 0.25 }),
      ],
    });
    expect(r.apiCostUsd).toBe(1.75);
    expect(r.wasteUsd).toBe(0.5);
    expect(r.trialBurnUsd).toBe(0.25);
    expect(r.costToMrr).toBeCloseTo(1.75 / r.netMrrUsd, 3);
    expect(r.grossProfitUsd).toBeCloseTo(r.netMrrUsd - 1.75, 2);
  });

  it('ignores jobs outside the 30-day window and reports per-tier averages for done jobs', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        job({ createdAt: daysAgo(31), apiCostUsd: 9 }),
        job({ modelTier: 'premium', apiCostUsd: 1, chargedCredits: 26504 }),
        job({ modelTier: 'premium', apiCostUsd: 2, chargedCredits: 26504 }),
        job({ apiCostUsd: 0.07 }),
        job({ status: 'failed', modelTier: 'premium', apiCostUsd: 3 }),
      ],
    });
    expect(r.apiCostUsd).toBe(6.07);
    expect(r.byTier).toEqual([
      {
        tier: 'premium',
        videos: 2,
        apiCostUsd: 3,
        avgCostPerVideoUsd: 1.5,
        avgCreditsPerVideo: 26504,
      },
      {
        tier: 'standard',
        videos: 1,
        apiCostUsd: 0.07,
        avgCostPerVideoUsd: 0.07,
        avgCreditsPerVideo: 2024,
      },
    ]);
  });
});
