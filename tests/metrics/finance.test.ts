import { describe, expect, it } from 'vitest';
import { computeFinance, netUsdFromEurCents, type FinanceInput } from '@/features/metrics/finance';
import { DAY_MS } from '@/features/metrics/north-star';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

const NOW = new Date('2026-10-20T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = {
  subscriptions: [],
  jobs: [],
  topUps: [],
  paidUserIds: new Set(),
  fixedMonthlyUsd: 0,
  now: NOW,
};
const job = (over: Partial<FinanceInput['jobs'][number]> = {}) => ({
  userId: 'u1',
  status: 'done',
  createdAt: daysAgo(1),
  apiCostUsd: 0.1,
  actualCredits: 2000,
  modelTier: 'standard',
  ...over,
});

describe('netUsdFromEurCents', () => {
  it('removes VAT and Stripe fees, then converts to USD', () => {
    // 14.99 EUR: ex-VAT 12.4917, fee 0.2249+0.25, minus both = 12.0168, x1.08 FX
    expect(netUsdFromEurCents(1499, REVENUE_ASSUMPTIONS)).toBeCloseTo(12.98, 2);
  });
});

describe('computeFinance', () => {
  it('is all zeros / nulls with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrNetUsd).toBe(0);
    expect(r.arpuNetUsd).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.costPerVideoUsd).toBeNull();
    expect(r.breakEvenSubscribers).toBeNull();
  });

  it('counts only live subscriptions on sold plans toward MRR', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'pro', status: 'active' },
        { userId: 'b', planId: 'starter', status: 'canceled' },
        { userId: 'c', planId: 'nope', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(1);
    expect(r.mrrGrossEur).toBe(29.99);
    expect(r.byPlan.pro).toEqual({ subscribers: 1, mrrGrossEur: 29.99 });
  });

  it('prices top-ups by pack, flags unknown amounts, ignores old ones', () => {
    const r = computeFinance({
      ...empty,
      topUps: [
        { userId: 'a', credits: 20_000, createdAt: daysAgo(2) },
        { userId: 'a', credits: 12_345, createdAt: daysAgo(3) },
        { userId: 'a', credits: 20_000, createdAt: daysAgo(45) },
      ],
    });
    expect(r.topUpRevenueNetUsd30d).toBeCloseTo(netUsdFromEurCents(1200, REVENUE_ASSUMPTIONS), 1);
    expect(r.unpricedTopUps30d).toBe(1);
  });

  it('splits API cost: per tier, free users, failed jobs, and cost per video', () => {
    const r = computeFinance({
      ...empty,
      paidUserIds: new Set(['paid']),
      jobs: [
        job({ userId: 'paid', apiCostUsd: 0.07 }),
        job({ userId: 'paid', apiCostUsd: 1.1, modelTier: 'premium', actualCredits: 26_000 }),
        job({ userId: 'free', apiCostUsd: 0.07 }),
        job({ userId: 'free', status: 'failed', apiCostUsd: 0.02 }),
        job({ createdAt: daysAgo(40), apiCostUsd: 9 }),
      ],
    });
    expect(r.videosDone30d).toBe(3);
    expect(r.failedJobs30d).toBe(1);
    expect(r.apiCostUsd30d).toBeCloseTo(1.26, 4);
    expect(r.freeUserApiCostUsd30d).toBeCloseTo(0.09, 4);
    expect(r.byTier.premium?.costPerVideoUsd).toBe(1.1);
    expect(r.costPerVideoUsd).toBeCloseTo(0.4133, 4);
  });

  it('computes contribution, gross margin and break-even subscribers', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'a', planId: 'starter', status: 'active' }],
      jobs: [job({ userId: 'a', apiCostUsd: 2 })],
      paidUserIds: new Set(['a']),
      fixedMonthlyUsd: 100,
    });
    const net = netUsdFromEurCents(1499, REVENUE_ASSUMPTIONS);
    expect(r.contributionUsd30d).toBeCloseTo(net - 2 - 100, 1);
    expect(r.grossMargin).toBeCloseTo((net - 2) / net, 2);
    expect(r.breakEvenSubscribers).toBe(Math.ceil(100 / (net - 2)));
  });
});
