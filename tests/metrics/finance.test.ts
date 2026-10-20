import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceInput } from '@/features/metrics/finance';
import { FIXED_COSTS } from '@/config/fixed-costs';

const NOW = new Date('2026-10-20T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = { jobs: [], subscriptions: [], topUps: [], fixedCosts: [], now: NOW };

describe('computeFinance', () => {
  it('returns zeros and n/a with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrUsd).toBe(0);
    expect(r.costPerFinishedUsd).toBeNull();
    expect(r.cogsRatio).toBeNull();
    expect(r.breakEvenSubscribers).toBeNull();
  });

  it('counts only live subscriptions on sold plans toward MRR', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'pro', status: 'active' },
        { userId: 'b', planId: 'starter', status: 'canceled' },
        { userId: 'c', planId: 'ghost', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(1);
    expect(r.subscribersByPlan).toEqual({ pro: 1 });
    // €29.99 ex 20% VAT × 1.08 USD/EUR
    expect(r.mrrUsd).toBeCloseTo((29.99 / 1.2) * 1.08, 1);
    expect(r.netMrrUsd).toBeLessThan(r.mrrUsd);
  });

  it('prices top-ups by pack and flags sizes it cannot price', () => {
    const r = computeFinance({
      ...empty,
      topUps: [
        { credits: 20_000, createdAt: daysAgo(2) },
        { credits: 777, createdAt: daysAgo(2) },
        { credits: 60_000, createdAt: daysAgo(90) },
      ],
    });
    expect(r.topUpRevenueUsd).toBeGreaterThan(0);
    expect(r.unpricedTopUps).toBe(1);
  });

  it('charges failed jobs to cost but divides only by finished videos', () => {
    const job = (status: string, cost: number, tier = 'standard') => ({
      status,
      modelTier: tier,
      createdAt: daysAgo(1),
      apiCostUsd: cost,
      actualCredits: 2000,
    });
    const r = computeFinance({
      ...empty,
      jobs: [job('done', 0.1), job('done', 0.3), job('failed', 0.2), job('done', 2, 'premium')],
    });
    expect(r.variableCostUsd).toBe(2.6);
    expect(r.failedCostUsd).toBe(0.2);
    expect(r.finishedVideos).toBe(3);
    expect(r.byTier.find((t) => t.tier === 'standard')?.costPerFinishedUsd).toBe(0.3);
  });

  it('lists unknown fixed costs instead of counting them as zero', () => {
    const r = computeFinance({ ...empty, fixedCosts: FIXED_COSTS });
    expect(r.unknownFixedCosts.length).toBe(FIXED_COSTS.length);
    expect(r.fixedCostUsd).toBe(0);
  });

  it('computes break-even subscribers from fixed costs and unit profit', () => {
    const r = computeFinance({
      ...empty,
      fixedCosts: [{ id: 'x', vendor: 'X', what: 'x', monthlyCents: 10_000 }],
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
    });
    expect(r.breakEvenSubscribers).toBeGreaterThan(1);
    expect(r.netCashUsd).toBeLessThan(0);
  });
});
