import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceInput } from '@/features/metrics/finance';

const NOW = new Date('2026-10-15T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = {
  jobs: [],
  subscriptions: [],
  topUpRevenueCents30d: 0,
  fixedCosts: [],
  now: NOW,
};
const job = (over: Partial<FinanceInput['jobs'][number]> = {}) => ({
  status: 'done',
  modelTier: 'standard',
  targetDurationSec: 15,
  apiCostUsd: 0.1,
  actualCredits: 2000,
  createdAt: daysAgo(1),
  ...over,
});

describe('computeFinance', () => {
  it('is all zeros with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrNetUsd).toBe(0);
    expect(r.grossMargin).toBeNull();
    expect(r.breakEvenSubscribers).toBeNull();
    expect(r.byTier).toEqual([]);
  });

  it('counts only live subscriptions in MRR', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'pro', status: 'active' },
        { userId: 'b', planId: 'starter', status: 'canceled' },
        { userId: 'c', planId: 'pro', status: 'past_due' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.byPlan).toEqual({ pro: 2 });
    expect(r.mrrGrossEur).toBe(59.98);
    expect(r.mrrNetUsd).toBeGreaterThan(0);
    expect(r.arrNetUsd).toBeCloseTo(r.mrrNetUsd * 12, 0);
  });

  it('splits API cost by tier, ignores old jobs and reports failed spend separately', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        job(),
        job({ apiCostUsd: 0.3 }),
        job({ modelTier: 'premium', apiCostUsd: 1.1, actualCredits: 26_000 }),
        job({ status: 'failed', apiCostUsd: 0.5 }),
        job({ createdAt: daysAgo(45), apiCostUsd: 99 }),
      ],
    });
    expect(r.apiCostDoneUsd30d).toBeCloseTo(1.5);
    expect(r.apiCostFailedUsd30d).toBeCloseTo(0.5);
    const std = r.byTier.find((t) => t.tier === 'standard');
    expect(std?.videos).toBe(2);
    expect(std?.avgCostPerVideoUsd).toBeCloseTo(0.2);
    expect(r.byTier.find((t) => t.tier === 'premium')?.creditsPerApiUsd).toBe(23_636);
  });

  it('computes margin, profit and break-even with fixed costs', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      jobs: [job({ apiCostUsd: 2 })],
      fixedCosts: [
        { id: 'x', label: 'x', usdPerMonth: 20, confirmed: true },
        { id: 'y', label: 'y', usdPerMonth: 5, confirmed: false },
      ],
    });
    expect(r.fixedCostsUsd).toBe(25);
    expect(r.fixedCostsUnconfirmed).toEqual(['y']);
    expect(r.contributionMarginUsd).toBeCloseTo(r.mrrNetUsd - 2, 1);
    expect(r.monthlyProfitUsd).toBeCloseTo(r.mrrNetUsd - 27, 1);
    expect(r.breakEvenSubscribers).toBe(Math.ceil(25 / (r.mrrNetUsd - 2)));
  });
});
