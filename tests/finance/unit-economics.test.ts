import { describe, expect, it } from 'vitest';
import { DAY_MS, computeFinance, type FinanceInput } from '@/features/finance/unit-economics';
import { netRevenueUsd } from '@/features/billing/margin';
import { PLANS } from '@/config/plans';

const NOW = new Date('2026-10-20T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);

const empty: FinanceInput = {
  now: NOW,
  windowDays: 30,
  subscriptions: [],
  jobs: [],
  fixedCosts: [],
};

const job = (over: Partial<FinanceInput['jobs'][number]> = {}) => ({
  userId: 'u1',
  status: 'done',
  modelTier: 'standard',
  targetDurationSec: 15,
  apiCostUsd: 0.04,
  chargedCredits: 2000,
  createdAt: daysAgo(1),
  ...over,
});

describe('computeFinance', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrNetUsd).toBe(0);
    expect(r.grossMargin).toBeNull();
    expect(r.coverage).toBeNull();
    expect(r.byTier).toEqual([]);
    expect(r.byPlan.map((p) => p.planId)).toEqual(['starter', 'pro', 'ultra']);
  });

  it('counts only live subscriptions on plans we sell as MRR', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'pro', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'canceled' },
        { userId: 'c', planId: 'starter', status: 'trialing' },
        { userId: 'd', planId: 'legacy', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrGrossEur).toBeCloseTo((PLANS.pro.priceCents + PLANS.starter.priceCents) / 100, 2);
    expect(r.mrrNetUsd).toBeCloseTo(
      netRevenueUsd(PLANS.pro.priceCents) + netRevenueUsd(PLANS.starter.priceCents),
      1,
    );
  });

  it('scales window cost to a month and reports margin and profit', () => {
    const r = computeFinance({
      ...empty,
      windowDays: 7,
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      jobs: [job({ userId: 'a', apiCostUsd: 1 })],
      fixedCosts: [{ name: 'hosting', usdPerMonth: 5 }],
    });
    expect(r.apiCostUsd).toBe(1);
    expect(r.apiCostMonthlyUsd).toBeCloseTo(30 / 7, 2);
    expect(r.grossMargin).toBeCloseTo((r.mrrNetUsd - 30 / 7) / r.mrrNetUsd, 3);
    expect(r.monthlyProfitUsd).toBeCloseTo(r.mrrNetUsd - 30 / 7 - 5, 1);
  });

  it('ignores jobs outside the window and splits cost by tier', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        job({ apiCostUsd: 0.05 }),
        job({ apiCostUsd: 1.9, modelTier: 'premium', chargedCredits: 40_000 }),
        job({ apiCostUsd: 9, createdAt: daysAgo(45) }),
      ],
    });
    expect(r.jobs).toBe(2);
    expect(r.byTier.map((t) => t.tier)).toEqual(['premium', 'standard']);
    expect(r.byTier[0]).toMatchObject({ costPerDoneUsd: 1.9, costPer1kCreditsUsd: 0.0475 });
  });

  it('separates free-user burn and failed-job cost', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'payer', planId: 'starter', status: 'active' }],
      jobs: [
        job({ userId: 'payer', apiCostUsd: 0.1 }),
        job({ userId: 'trial', apiCostUsd: 0.2 }),
        job({ userId: 'trial', status: 'failed', apiCostUsd: 0.3 }),
      ],
    });
    expect(r.freeBurnUsd).toBeCloseTo(0.5, 4);
    expect(r.failedCostUsd).toBeCloseTo(0.3, 4);
    expect(r.failedJobs).toBe(1);
  });

  it('has no done-cost for a tier whose jobs all failed', () => {
    const r = computeFinance({ ...empty, jobs: [job({ status: 'failed' })] });
    expect(r.byTier[0]?.costPerDoneUsd).toBeNull();
  });
});
