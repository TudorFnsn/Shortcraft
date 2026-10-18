import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, netUsdFromGrossEur } from '@/features/metrics/finance';

const NOW = new Date('2026-10-18T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const job = (over: Partial<Parameters<typeof computeFinance>[0]['jobs'][number]> = {}) => ({
  status: 'done',
  modelTier: 'standard',
  createdAt: daysAgo(1),
  apiCostUsd: 0.1,
  actualCredits: 2000,
  ...over,
});

describe('netUsdFromGrossEur', () => {
  it('takes VAT and Stripe fees out, then converts to USD', () => {
    // 29.99 / 1.2 = 24.99; fees 0.45 + 0.25 = 0.70; (24.99 - 0.70) * 1.08
    expect(netUsdFromGrossEur(2999)).toBeCloseTo(26.23, 1);
  });
  it('never goes negative', () => {
    expect(netUsdFromGrossEur(0)).toBe(0);
  });
});

describe('computeFinance', () => {
  it('is all zeros with no data', () => {
    const r = computeFinance({ now: NOW, subscriptions: [], jobs: [], fixedMonthlyCostUsd: 0 });
    expect(r.netMrrUsd).toBe(0);
    expect(r.grossMargin).toBeNull();
    expect(r.byTier).toEqual([]);
  });

  it('counts only live subscriptions on known plans', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'starter', status: 'canceled' },
        { planId: 'nope', status: 'active' },
      ],
      jobs: [],
      fixedMonthlyCostUsd: 0,
    });
    expect(r.payingSubscribers).toBe(1);
    expect(r.grossMrrEur).toBe(29.99);
    expect(r.subscribersByPlan).toEqual({ pro: 1 });
  });

  it('only counts jobs inside the window and tracks failed spend', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        job(),
        job({ status: 'failed', apiCostUsd: 0.5 }),
        job({ createdAt: daysAgo(40), apiCostUsd: 9 }),
      ],
      fixedMonthlyCostUsd: 5,
    });
    expect(r.variableCostUsd).toBe(0.6);
    expect(r.failedCostUsd).toBe(0.5);
    expect(r.monthlyProfitUsd).toBeCloseTo(r.netMrrUsd - 0.6 - 5, 1);
  });

  it('prices cost per 1k credits by tier, biggest spender first', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [],
      jobs: [job(), job({ modelTier: 'premium', apiCostUsd: 1.2, actualCredits: 26_000 })],
      fixedMonthlyCostUsd: 0,
    });
    expect(r.byTier.map((t) => t.tier)).toEqual(['premium', 'standard']);
    expect(r.byTier[0]?.costPer1kCredits).toBeCloseTo(0.046, 3);
  });

  it('scales a shorter window to a month for profit', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [],
      jobs: [job({ apiCostUsd: 1 })],
      fixedMonthlyCostUsd: 0,
      windowDays: 15,
    });
    expect(r.monthlyProfitUsd).toBe(-2);
  });
});
