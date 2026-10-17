import { describe, expect, it } from 'vitest';
import { PLANS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { computeFinance, type FinanceInput } from '@/features/metrics/finance';
import { DAY_MS } from '@/features/metrics/north-star';

const NOW = new Date('2026-10-17T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = {
  subscriptions: [],
  topUps: [],
  jobs: [],
  fixedCostsUsdPerMonth: 0,
  now: NOW,
};
const job = (over: Partial<FinanceInput['jobs'][number]> = {}) => ({
  status: 'done',
  modelTier: 'standard',
  targetDurationSec: 15,
  apiCostUsd: 0.1,
  actualCredits: 2000,
  createdAt: daysAgo(1),
  ...over,
});

describe('computeFinance', () => {
  it('returns zeros and nulls with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrNetUsd).toBe(0);
    expect(r.revenueMultiple).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.arpuNetUsd).toBeNull();
    expect(r.breakEvenSubscribers).toBeNull();
    expect(r.tiers).toEqual([]);
  });

  it('counts only live subscriptions on known plans toward MRR', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'pro', status: 'active' },
        { userId: 'b', planId: 'starter', status: 'past_due' },
        { userId: 'c', planId: 'pro', status: 'canceled' },
        { userId: 'd', planId: 'legacy', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.subscribersByPlan).toEqual({ pro: 1, starter: 1 });
    expect(r.mrrGrossEur).toBeCloseTo((PLANS.pro.priceCents + PLANS.starter.priceCents) / 100);
    expect(r.mrrNetUsd).toBeCloseTo(
      netRevenueUsd(PLANS.pro.priceCents) + netRevenueUsd(PLANS.starter.priceCents),
    );
    expect(r.arrNetUsd).toBeCloseTo(r.mrrNetUsd * 12);
  });

  it('prices top-ups by pack, ignores old ones, and flags unknown amounts', () => {
    const r = computeFinance({
      ...empty,
      topUps: [
        { credits: 20_000, createdAt: daysAgo(3) },
        { credits: 20_000, createdAt: daysAgo(45) },
        { credits: 12_345, createdAt: daysAgo(2) },
      ],
    });
    expect(r.topUpNetUsd).toBeCloseTo(netRevenueUsd(1200));
    expect(r.unmatchedTopUps).toBe(1);
  });

  it('measures spend, failed spend, margin and cost per finished video by tier', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      jobs: [
        job({ apiCostUsd: 0.1 }),
        job({ apiCostUsd: 0.3 }),
        job({ status: 'failed', apiCostUsd: 0.5, actualCredits: 0 }),
        job({ modelTier: 'premium', apiCostUsd: 1.5, actualCredits: 26_000 }),
        job({ apiCostUsd: 9, createdAt: daysAgo(40) }),
      ],
    });
    expect(r.apiSpendUsd).toBeCloseTo(2.4);
    expect(r.failedSpendUsd).toBeCloseTo(0.5);
    const std = r.tiers.find((t) => t.tier === 'standard');
    expect(std?.jobs).toBe(3);
    expect(std?.doneJobs).toBe(2);
    expect(std?.costPerDoneVideoUsd).toBeCloseTo(0.45); // failed-job spend is loaded onto finished videos;
    expect(r.revenueMultiple).toBeCloseTo(r.netRevenueUsd / 2.4);
    expect(r.grossMargin).toBeCloseTo((r.netRevenueUsd - 2.4) / r.netRevenueUsd);
    expect(r.apiCostPer1kCredits).toBeCloseTo((1.9 / 30_000) * 1000);
  });

  it('computes break-even subscribers from ARPU after API share', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      jobs: [job({ apiCostUsd: 2 })],
      fixedCostsUsdPerMonth: 100,
    });
    const arpu = netRevenueUsd(PLANS.pro.priceCents);
    const share = r.apiSpendUsd / arpu;
    expect(r.breakEvenSubscribers).toBe(Math.ceil(100 / (arpu * (1 - share))));
    expect(r.monthlyProfitUsd).toBeCloseTo(arpu - r.apiSpendUsd - 100);
  });

  it('has no break-even when spend eats all revenue', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'a', planId: 'starter', status: 'active' }],
      jobs: [job({ apiCostUsd: 50 })],
      fixedCostsUsdPerMonth: 10,
    });
    expect(r.breakEvenSubscribers).toBeNull();
  });
});
