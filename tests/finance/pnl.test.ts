import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceInput } from '@/features/finance/pnl';

const NOW = new Date('2026-10-17T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const base: FinanceInput = {
  now: NOW,
  subscriptions: [],
  topUps: [],
  renewals: [],
  jobs: [],
  fixedCosts: [],
};

describe('computeFinance', () => {
  it('is all zeros / null with no data', () => {
    const r = computeFinance(base);
    expect(r.mrrNetUsd).toBe(0);
    expect(r.mrrCostRatio).toBeNull();
    expect(r.grossMarginPct).toBeNull();
    expect(r.last30d.apiCostPerVideoUsd).toBeNull();
  });

  it('counts only live subscriptions in MRR, net of VAT and fees', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'starter', status: 'past_due' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrGrossEur).toBeCloseTo(44.98);
    expect(r.mrrNetUsd).toBeGreaterThan(0);
    expect(r.mrrNetUsd).toBeLessThan(44.98 * 1.08);
  });

  it('computes cost per video, per 1k credits and the MRR ÷ cost ratio', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [{ planId: 'ultra', status: 'active' }],
      jobs: [
        { status: 'done', createdAt: daysAgo(2), apiCostUsd: 0.1, actualCredits: 2000 },
        { status: 'done', createdAt: daysAgo(3), apiCostUsd: 0.3, actualCredits: 2000 },
        { status: 'failed', createdAt: daysAgo(4), apiCostUsd: 0.1, actualCredits: 0 },
        { status: 'done', createdAt: daysAgo(40), apiCostUsd: 9, actualCredits: 9 },
      ],
      fixedCosts: [
        { id: 'a', name: 'A', monthlyUsd: 10 },
        { id: 'b', name: 'B', monthlyUsd: null },
      ],
    });
    expect(r.last30d.apiCostUsd).toBe(0.5);
    expect(r.last30d.finishedVideos).toBe(2);
    expect(r.last30d.apiCostPerVideoUsd).toBe(0.25);
    expect(r.last30d.apiCostPer1kCreditsUsd).toBe(0.125);
    expect(r.fixedCostGaps).toEqual(['B']);
    expect(r.monthlyOutflowUsd).toBe(10.5);
    expect(r.mrrCostRatio).toBeCloseTo(r.monthlyRevenueUsd / 10.5, 1);
  });

  it('values top-ups by pack and ignores old ones', () => {
    const r = computeFinance({
      ...base,
      topUps: [
        { credits: 20_000, createdAt: daysAgo(1) },
        { credits: 20_000, createdAt: daysAgo(60) },
        { credits: 123, createdAt: daysAgo(1) },
      ],
    });
    expect(r.last30d.topUpNetUsd).toBeGreaterThan(0);
    expect(r.last30d.topUpNetUsd).toBeLessThan(12 * 1.08);
  });
});
