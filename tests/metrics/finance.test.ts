import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceInput } from '@/features/metrics/finance';
import { netRevenueUsd } from '@/features/billing/margin';

const NOW = new Date('2026-10-14T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = {
  now: NOW,
  subscriptions: [],
  topups: [],
  jobs: [],
  fixedCostsUsdMonthly: 0,
};

describe('computeFinance', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrNetUsd).toBe(0);
    expect(r.revenueToApiCost).toBeNull();
    expect(r.apiCostPerFinishedVideoUsd).toBeNull();
    expect(r.meetsTarget).toBe(true);
  });

  it('counts only live subscriptions toward MRR', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'starter', status: 'canceled' },
        { planId: 'nope', status: 'active' },
      ],
    });
    expect(r.subscribers).toEqual({ pro: 1 });
    expect(r.mrrGrossEur).toBeCloseTo(29.99);
    expect(r.mrrNetUsd).toBeCloseTo(netRevenueUsd(2999));
  });

  it('windows top-ups and jobs to 30 days and separates failed-job waste', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      fixedCostsUsdMonthly: 10,
      topups: [
        { credits: 20_000, createdAt: daysAgo(5) },
        { credits: 20_000, createdAt: daysAgo(45) },
      ],
      jobs: [
        { status: 'done', createdAt: daysAgo(1), chargedCredits: 2000, apiCostUsd: 0.5 },
        { status: 'failed', createdAt: daysAgo(2), chargedCredits: 0, apiCostUsd: 0.25 },
        { status: 'done', createdAt: daysAgo(60), chargedCredits: 2000, apiCostUsd: 9 },
      ],
    });
    expect(r.topupNetUsd).toBeCloseTo(netRevenueUsd(1200));
    expect(r.apiCostUsd).toBeCloseTo(0.75);
    expect(r.finishedVideos).toBe(1);
    expect(r.failedJobApiCostUsd).toBeCloseTo(0.25);
    expect(r.apiCostPerFinishedVideoUsd).toBeCloseTo(0.75);
    expect(r.profitUsd).toBeCloseTo(r.revenueNetUsd - 0.75 - 10);
    expect(r.meetsTarget).toBe(true);
  });

  it('flags a revenue/API-cost ratio under the 3x target', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ planId: 'starter', status: 'active' }],
      jobs: [{ status: 'done', createdAt: daysAgo(1), chargedCredits: 1, apiCostUsd: 10 }],
    });
    expect(r.meetsTarget).toBe(false);
  });
});
