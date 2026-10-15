import { describe, expect, it } from 'vitest';
import { computeFinance, netUsdFromGrossCents } from '@/features/finance/unit-economics';
import { PLANS } from '@/config/plans';

const now = new Date('2026-10-15T00:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86_400_000);

const base = {
  now,
  subscriptions: [],
  jobs: [],
  payerIds: new Set<string>(),
  topUpCents: 0,
  fixedMonthlyUsd: null,
};

describe('computeFinance', () => {
  it('sums MRR over live subscriptions only', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'trialing' },
        { userId: 'c', planId: 'ultra', status: 'canceled' },
      ],
    });
    expect(r.mrrEur).toBe((PLANS.starter.priceCents + PLANS.pro.priceCents) / 100);
    expect(r.payingSubscribers).toBe(2);
    expect(r.arpuEur).toBeCloseTo(r.mrrEur / 2);
    expect(r.netMrrUsd).toBeLessThan(r.mrrEur * 1.08);
  });

  it('prices cost per tier, counts failed jobs and free-user burn', () => {
    const r = computeFinance({
      ...base,
      payerIds: new Set(['paid']),
      jobs: [
        { userId: 'paid', status: 'done', modelTier: 'premium', apiCostUsd: 1, createdAt: day(1) },
        {
          userId: 'free',
          status: 'failed',
          modelTier: 'standard',
          apiCostUsd: 0.5,
          createdAt: day(2),
        },
        {
          userId: 'free',
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 0.5,
          createdAt: day(3),
        },
        {
          userId: 'free',
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 9,
          createdAt: day(60),
        },
      ],
    });
    expect(r.variableCostUsd).toBe(2);
    expect(r.failedJobCostUsd).toBe(0.5);
    expect(r.byTier.premium?.avgCostUsd).toBe(1);
    expect(r.byTier.standard?.videos).toBe(1);
    expect(r.freeUserCostShare).toBeCloseTo(0.5);
  });

  it('withholds cash and ratio until fixed costs are known, then computes them', () => {
    const subs = [{ userId: 'a', planId: 'pro', status: 'active' }];
    const unknown = computeFinance({ ...base, subscriptions: subs });
    expect(unknown.monthlyCashUsd).toBeNull();
    expect(unknown.mrrCostRatio).toBeNull();
    const known = computeFinance({ ...base, subscriptions: subs, fixedMonthlyUsd: 10 });
    expect(known.monthlyCashUsd).toBeCloseTo(unknown.netMrrUsd - 10);
    expect(known.mrrCostRatio).toBeCloseTo(unknown.netMrrUsd / 10);
  });

  it('scales a short window to a month and handles an empty business', () => {
    const r = computeFinance({
      ...base,
      windowDays: 15,
      jobs: [
        { userId: 'x', status: 'done', modelTier: 'standard', apiCostUsd: 1, createdAt: day(1) },
      ],
    });
    expect(r.variableCostMonthlyUsd).toBe(2);
    expect(r.grossMargin).toBeNull();
    expect(computeFinance(base).arpuEur).toBeNull();
  });

  it('nets VAT, Stripe percent and fixed fee off a gross price', () => {
    expect(netUsdFromGrossCents(1499)).toBeCloseTo(((14.99 / 1.2) * 0.985 - 0.25) * 1.08, 4);
  });
});
