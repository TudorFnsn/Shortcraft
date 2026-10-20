import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceInput } from '@/features/metrics/finance';
import { DAY_MS } from '@/features/metrics/north-star';

const NOW = new Date('2026-10-20T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const base: FinanceInput = { now: NOW, subscriptions: [], jobs: [], fixedCosts: [] };

describe('computeFinance', () => {
  it('has no ratio and no payers with no data', () => {
    const r = computeFinance(base);
    expect(r.mrrEur).toBe(0);
    expect(r.mrrRatio).toBeNull();
    expect(r.arpuEur).toBeNull();
    expect(r.grossMarginPct).toBeNull();
  });

  it('counts only live subscriptions on plans we sell', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'starter', status: 'trialing' },
        { planId: 'ultra', status: 'canceled' },
        { planId: 'legacy', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBe(44.98);
    expect(r.arpuEur).toBe(22.49);
    expect(r.netMrrUsd).toBeGreaterThan(0);
    expect(r.netMrrUsd).toBeLessThan(r.mrrEur * 1.08);
  });

  it('includes failed jobs in cost but ignores jobs older than 30 days', () => {
    const r = computeFinance({
      ...base,
      jobs: [
        {
          status: 'done',
          modelTier: 'standard',
          createdAt: daysAgo(1),
          apiCostUsd: 0.1,
          actualCredits: 2000,
        },
        {
          status: 'failed',
          modelTier: 'premium',
          createdAt: daysAgo(2),
          apiCostUsd: 0.9,
          actualCredits: 0,
        },
        {
          status: 'done',
          modelTier: 'premium',
          createdAt: daysAgo(31),
          apiCostUsd: 5,
          actualCredits: 9000,
        },
      ],
    });
    expect(r.variableCost30dUsd).toBe(1);
    expect(r.failedShareOfCost).toBe(0.9);
    expect(r.byTier.map((t) => t.tier)).toEqual(['premium', 'standard']);
    expect(r.byTier[1]?.costPerDoneUsd).toBe(0.1);
    expect(r.byTier[1]?.costPer1kCreditsUsd).toBe(0.05);
    expect(r.byTier[0]?.costPerDoneUsd).toBeNull();
  });

  it('computes the MRR ratio over variable + known fixed cost and lists unknown vendors', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [{ planId: 'ultra', status: 'active' }],
      jobs: [
        {
          status: 'done',
          modelTier: 'standard',
          createdAt: daysAgo(1),
          apiCostUsd: 10,
          actualCredits: 1,
        },
      ],
      fixedCosts: [
        { vendor: 'Vercel', covers: '', monthlyUsd: 20 },
        { vendor: 'Sentry', covers: '', monthlyUsd: null },
      ],
    });
    expect(r.fixedKnownUsd).toBe(20);
    expect(r.fixedUnknownVendors).toEqual(['Sentry']);
    expect(r.totalCostUsd).toBe(30);
    expect(r.mrrRatio).toBeCloseTo(r.netMrrUsd / 30, 1);
  });
});
