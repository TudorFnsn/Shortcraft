import { describe, expect, it } from 'vitest';
import {
  computeFinance,
  DAY_MS,
  netUsdOf,
  type FinanceInput,
} from '@/features/finance/unit-economics';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

const NOW = new Date('2026-10-19T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const base: FinanceInput = {
  subscriptions: [],
  jobs: [],
  fixedCostsUsdPerMonth: null,
  cashOnHandUsd: null,
  now: NOW,
};
const job = (over: Partial<FinanceInput['jobs'][number]> = {}) => ({
  status: 'done',
  modelTier: 'standard',
  apiCostUsd: 0.1,
  actualCredits: 2000,
  createdAt: daysAgo(1),
  ...over,
});

describe('computeFinance', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinance(base);
    expect(r.mrrEur).toBe(0);
    expect(r.grossMargin).toBeNull();
    expect(r.avgCostPerDoneVideoUsd).toBeNull();
    expect(r.breakEvenSubscribers).toBeNull();
    expect(r.monthlyProfitUsd).toBeNull();
  });

  it('counts MRR only for live subscriptions on plans we sell', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'starter', status: 'trialing' },
        { planId: 'ultra', status: 'canceled' },
        { planId: 'ghost', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBe(44.98);
    expect(r.arpuEur).toBe(22.49);
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1, ultra: 0 });
  });

  it('nets VAT and Stripe fees off a charge', () => {
    const a = REVENUE_ASSUMPTIONS;
    const expected = (29.99 / 1.2 - (29.99 * 0.015 + 0.25)) * 1.08;
    expect(netUsdOf(29.99, a)).toBeCloseTo(expected, 6);
  });

  it('prices cost per done video over 30 days and counts failed spend as waste', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        job({ apiCostUsd: 0.1 }),
        job({ apiCostUsd: 0.3, modelTier: 'premium', actualCredits: 26_000 }),
        job({ status: 'failed', apiCostUsd: 0.2 }),
        job({ apiCostUsd: 9, createdAt: daysAgo(40) }),
      ],
    });
    expect(r.doneVideos30d).toBe(2);
    expect(r.variableCost30dUsd).toBe(0.6);
    expect(r.wastedOnFailed30dUsd).toBe(0.2);
    expect(r.avgCostPerDoneVideoUsd).toBe(0.3);
    expect(r.byTier.map((t) => t.tier)).toEqual(['premium', 'standard']);
    expect(r.creditUse).toBeCloseTo(28_000 / 100_000, 4);
    expect(r.realizedMultiple).toBeGreaterThan(30);
  });

  it('derives profit, break-even and runway once fixed costs and cash are known', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [{ planId: 'starter', status: 'active' }],
      jobs: [job({ apiCostUsd: 1 })],
      fixedCostsUsdPerMonth: 200,
      cashOnHandUsd: 1000,
    });
    expect(r.monthlyProfitUsd).toBeLessThan(0);
    expect(r.breakEvenSubscribers).toBeGreaterThan(10);
    expect(r.runwayMonths).toBeGreaterThan(5);
  });
});
