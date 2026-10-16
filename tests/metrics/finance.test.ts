import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, netUsdFromGrossEur } from '@/features/metrics/finance';

const NOW = new Date('2026-10-16T06:00:00Z');
const ago = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const job = (o: Partial<Parameters<typeof computeFinance>[0]['jobs'][number]> = {}) => ({
  userId: 'u1',
  status: 'done',
  modelTier: 'standard',
  apiCostUsd: 0.1,
  actualCredits: 2000,
  createdAt: ago(1),
  ...o,
});

describe('computeFinance', () => {
  it('is all zeros with no data', () => {
    const r = computeFinance({ now: NOW, subscriptions: [], jobs: [] });
    expect(r.mrrEur).toBe(0);
    expect(r.apiCostUsd).toBe(0);
    expect(r.revenueToApiCost).toBeNull();
    expect(r.tiers).toEqual([]);
  });

  it('sums MRR over live subscriptions only', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'trialing' },
        { userId: 'c', planId: 'pro', status: 'canceled' },
      ],
      jobs: [],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBeCloseTo(14.99 + 29.99);
    expect(r.mrrNetUsd).toBeCloseTo(netUsdFromGrossEur(14.99) + netUsdFromGrossEur(29.99));
  });

  it('splits cost by tier, failures and non-paying users, and ignores jobs outside the window', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [{ userId: 'u1', planId: 'starter', status: 'active' }],
      jobs: [
        job(),
        job({ modelTier: 'premium', apiCostUsd: 1.5 }),
        job({ status: 'failed', apiCostUsd: 0.4 }),
        job({ userId: 'trial', apiCostUsd: 0.25 }),
        job({ createdAt: ago(40), apiCostUsd: 99 }),
      ],
    });
    expect(r.apiCostUsd).toBeCloseTo(2.25);
    expect(r.failedCostUsd).toBeCloseTo(0.4);
    expect(r.freeUserCostUsd).toBeCloseTo(0.25);
    const std = r.tiers.find((t) => t.tier === 'standard')!;
    expect(std.jobs).toBe(3);
    expect(std.finished).toBe(2);
    expect(std.costPerFinishedUsd).toBeCloseTo(0.75 / 2);
    expect(r.avgCreditsPerFinished).toBe(2000);
  });

  it('scales a shorter window to a month and subtracts fixed costs', () => {
    const r = computeFinance(
      {
        now: NOW,
        fixedMonthlyUsd: 10,
        subscriptions: [{ userId: 'u1', planId: 'pro', status: 'active' }],
        jobs: [job({ apiCostUsd: 2 })],
      },
      15,
    );
    expect(r.monthlyProfitUsd).toBeCloseTo(netUsdFromGrossEur(29.99) - 4 - 10);
    expect(r.revenueToApiCost).toBeCloseTo(netUsdFromGrossEur(29.99) / 4);
  });
});
