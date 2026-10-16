import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, netUsdOfEur } from '@/features/metrics/finance';

const NOW = new Date('2026-10-16T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const job = (o: Partial<Parameters<typeof computeFinance>[0]['jobs'][number]> = {}) => ({
  userId: 'u1',
  status: 'done',
  modelTier: 'standard',
  apiCostUsd: 0.1,
  createdAt: daysAgo(1),
  ...o,
});

describe('computeFinance', () => {
  it('is all zeros / null with no data', () => {
    const r = computeFinance({ subscriptions: [], jobs: [], now: NOW });
    expect(r.mrrEur).toBe(0);
    expect(r.grossMargin).toBeNull();
    expect(r.cogsPerPayingUserUsd).toBeNull();
    expect(r.nonPayingCogsShare).toBeNull();
    expect(r.netProfitUsdPerMonth).toBeNull();
  });

  it('sums MRR over live subscriptions only', () => {
    const r = computeFinance({
      now: NOW,
      jobs: [],
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'trialing' },
        { userId: 'c', planId: 'pro', status: 'canceled' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBe(44.98);
    expect(r.arrEur).toBe(539.76);
    expect(r.byPlan.find((p) => p.planId === 'pro')?.subscribers).toBe(1);
  });

  it('nets VAT, Stripe fees and FX', () => {
    // 14.99 / 1.2 = 12.4917; - 0.2249 - 0.25 = 12.0168; * 1.08 = 12.98
    expect(
      netUsdOfEur(14.99, {
        vatRate: 0.2,
        stripePercentFee: 0.015,
        stripeFixedFeeEur: 0.25,
        usdPerEur: 1.08,
      }),
    ).toBeCloseTo(12.98, 2);
  });

  it('counts only the last 30 days, wasted spend and non-paying burn', () => {
    const r = computeFinance({
      now: NOW,
      fixedCostsUsdPerMonth: 5,
      subscriptions: [{ userId: 'u1', planId: 'starter', status: 'active' }],
      jobs: [
        job({ apiCostUsd: 1 }),
        job({ status: 'failed', apiCostUsd: 0.5 }),
        job({ userId: 'trial', apiCostUsd: 0.5, modelTier: 'premium' }),
        job({ apiCostUsd: 99, createdAt: daysAgo(40) }),
      ],
    });
    expect(r.cogs30dUsd).toBe(2);
    expect(r.wastedSpend30dUsd).toBe(0.5);
    expect(r.nonPayingCogsShare).toBe(0.25);
    expect(r.cogsPerPayingUserUsd).toBe(2);
    expect(r.byTier.find((t) => t.tier === 'standard')).toMatchObject({
      jobs: 2,
      doneJobs: 1,
      costPerDoneVideoUsd: 1.5,
    });
    expect(r.grossMargin).toBeCloseTo((12.98 - 2) / 12.98, 3);
    expect(r.netProfitUsdPerMonth).toBeCloseTo(12.98 - 2 - 5, 2);
  });
});
