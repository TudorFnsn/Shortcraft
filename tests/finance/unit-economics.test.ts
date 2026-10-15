import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, pct, type FinanceInput } from '@/features/finance/unit-economics';

const NOW = new Date('2026-10-15T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = { now: NOW, subscriptions: [], jobs: [], topups: [], fixedCosts: [] };
const job = (over: Partial<FinanceInput['jobs'][number]> = {}) => ({
  userId: 'u1',
  status: 'done',
  modelTier: 'standard',
  apiCostUsd: 0.1,
  actualCredits: 2000,
  createdAt: daysAgo(1),
  ...over,
});

describe('computeFinance', () => {
  it('returns zeros and n/a with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrNetUsd).toBe(0);
    expect(r.apiCostToRevenue).toBeNull();
    expect(r.avgApiCostPerVideoUsd).toBeNull();
    expect(r.breakEvenSubscribers).toBeNull();
  });

  it('counts live subscriptions only and flags past_due as at risk', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'pro', status: 'active' },
        { userId: 'b', planId: 'starter', status: 'past_due' },
        { userId: 'c', planId: 'ultra', status: 'canceled' },
        { userId: 'd', planId: 'bogus', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.pastDueSubscribers).toBe(1);
    expect(r.mrrGrossEur).toBe(44.98);
  });

  it('separates done, failed and free-user spend inside the 30-day window', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'u1', planId: 'pro', status: 'active' }],
      jobs: [
        job(),
        job({ status: 'failed', apiCostUsd: 0.5 }),
        job({ userId: 'free', apiCostUsd: 0.2 }),
        job({ createdAt: daysAgo(45), apiCostUsd: 9 }),
      ],
    });
    expect(r.videosDone).toBe(2);
    expect(r.videosFailed).toBe(1);
    expect(r.apiCostUsd).toBe(0.8);
    expect(r.apiCostFailedUsd).toBe(0.5);
    expect(r.apiCostFreeUsersUsd).toBe(0.2);
    expect(r.avgApiCostPerVideoUsd).toBe(0.15);
    expect(r.byTier[0]).toMatchObject({ tier: 'standard', videos: 2 });
  });

  it('computes the revenue multiple, top-up revenue and break-even', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'u1', planId: 'pro', status: 'active' }],
      jobs: [job({ apiCostUsd: 1 })],
      topups: [
        { credits: 20_000, createdAt: daysAgo(2) },
        { credits: 20_000, createdAt: daysAgo(60) },
        { credits: 7, createdAt: daysAgo(1) },
      ],
      fixedCosts: [
        { id: 'a', label: 'A', monthlyUsd: 25 },
        { id: 'b', label: 'B', monthlyUsd: null },
      ],
    });
    expect(r.topupNetUsd).toBeGreaterThan(0);
    expect(r.revenueNetUsd).toBeCloseTo(r.mrrNetUsd + r.topupNetUsd, 1);
    expect(r.revenueMultiple).toBeGreaterThan(3);
    expect(r.fixedCostUnknown).toEqual(['b']);
    expect(r.profitUsd).toBeCloseTo(r.contributionUsd - 25, 1);
    expect(r.breakEvenSubscribers).toBe(1);
  });
});

describe('pct', () => {
  it('formats ratios', () => {
    expect(pct(0.314)).toBe('31%');
    expect(pct(null)).toBe('n/a');
  });
});
