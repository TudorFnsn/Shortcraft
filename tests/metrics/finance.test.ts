import { describe, expect, it } from 'vitest';
import { computeFinance, netUsdOfEur, type FinanceJob } from '@/features/metrics/finance';

const now = new Date('2026-10-18T00:00:00Z');
const job = (over: Partial<FinanceJob>): FinanceJob => ({
  status: 'done',
  modelTier: 'standard',
  apiCostUsd: 0.05,
  chargedCredits: 2000,
  createdAt: new Date('2026-10-10T00:00:00Z'),
  ...over,
});

describe('computeFinance', () => {
  it('sums MRR over live subscriptions only', () => {
    const r = computeFinance({
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'ultra', status: 'canceled' },
      ],
      jobs: [],
      fixedCostsUsd: 0,
      now,
    });
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1, ultra: 0 });
    expect(r.mrrEur).toBe(44.98);
    expect(r.arpuEur).toBe(22.49);
    expect(r.costRatio).toBe(0);
  });

  it('nets VAT, Stripe fees and FX like the margin gate', () => {
    // 14.99 / 1.2 - 14.99 * 1.5% - 0.25 = 12.02 EUR, * 1.08
    expect(netUsdOfEur(14.99)).toBeCloseTo(12.98, 1);
  });

  it('counts cost in the last 30 days, with failed spend as waste', () => {
    const r = computeFinance({
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        job({}),
        job({ status: 'failed', apiCostUsd: 0.4 }),
        job({ modelTier: 'premium', apiCostUsd: 1.1, chargedCredits: 26_000 }),
        job({ createdAt: new Date('2026-08-01T00:00:00Z'), apiCostUsd: 9 }),
      ],
      fixedCostsUsd: 20,
      now,
    });
    expect(r.apiCostUsd30d).toBe(1.55);
    expect(r.wastedCostUsd30d).toBe(0.4);
    expect(r.tiers.find((t) => t.tier === 'premium')?.costPerDoneUsd).toBe(1.1);
    expect(r.contributionUsd).toBeCloseTo(r.netMrrUsd - 1.55 - 20, 1);
    expect(r.costRatio).toBeLessThan(1 / 3);
  });

  it('has no ratio without recurring revenue', () => {
    const r = computeFinance({ subscriptions: [], jobs: [job({})], fixedCostsUsd: 0, now });
    expect(r.costRatio).toBeNull();
    expect(r.arpuEur).toBeNull();
  });
});
