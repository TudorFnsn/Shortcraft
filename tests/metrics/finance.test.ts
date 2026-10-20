import { describe, expect, it } from 'vitest';
import { PLANS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { computeFinance, DAY_MS, type FinanceInput } from '@/features/metrics/finance';

const NOW = new Date('2026-10-20T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = { subscriptions: [], jobs: [], now: NOW };

const job = (over: Partial<FinanceInput['jobs'][number]> = {}) => ({
  userId: 'u1',
  status: 'done',
  modelTier: 'standard',
  createdAt: daysAgo(1),
  apiCostUsd: 0.1,
  chargedCredits: 2_000,
  ...over,
});

describe('computeFinance', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.arpuEur).toBeNull();
    expect(r.mrrRatio).toBeNull();
    expect(r.costPer1kCreditsUsd).toBeNull();
    expect(r.byPlan).toEqual([]);
    expect(r.targetRatio).toBe(3);
  });

  it('sums MRR over live subscriptions only', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'pro', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'trialing' },
        { userId: 'c', planId: 'starter', status: 'active' },
        { userId: 'd', planId: 'ultra', status: 'canceled' },
        { userId: 'e', planId: 'nope', status: 'active' },
      ],
    });
    const expected = (2 * PLANS.pro.priceCents + PLANS.starter.priceCents) / 100;
    expect(r.mrrEur).toBeCloseTo(expected, 2);
    expect(r.arrEur).toBeCloseTo(expected * 12, 2);
    expect(r.payingSubscribers).toBe(3);
    expect(r.byPlan[0]).toMatchObject({ planId: 'pro', subscribers: 2 });
    expect(r.netMrrUsd).toBeCloseTo(
      2 * netRevenueUsd(PLANS.pro.priceCents) + netRevenueUsd(PLANS.starter.priceCents),
      2,
    );
  });

  it('splits cost into finished, failed and in-flight inside the 30-day window', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        job({ apiCostUsd: 0.1 }),
        job({ status: 'failed', apiCostUsd: 0.5 }),
        job({ status: 'images', apiCostUsd: 0.2 }),
        job({ createdAt: daysAgo(45), apiCostUsd: 9 }),
      ],
    });
    expect(r.apiCostUsd).toBeCloseTo(0.8, 4);
    expect(r.failedCostUsd).toBeCloseTo(0.5, 4);
    expect(r.inFlightCostUsd).toBeCloseTo(0.2, 4);
  });

  it('prices a finished video per tier and per 1k credits', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        job({ apiCostUsd: 0.1, chargedCredits: 2_000 }),
        job({ apiCostUsd: 0.3, chargedCredits: 2_000 }),
        job({ modelTier: 'premium', apiCostUsd: 2, chargedCredits: 20_000 }),
      ],
    });
    expect(r.byTier[0]).toMatchObject({ tier: 'premium', finished: 1, costPerVideoUsd: 2 });
    expect(r.byTier[1]).toMatchObject({ tier: 'standard', finished: 2, costPerVideoUsd: 0.2 });
    expect(r.costPer1kCreditsUsd).toBeCloseTo(0.1, 4);
  });

  it('computes the MRR ratio and what non-paying users cost', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'payer', planId: 'pro', status: 'active' }],
      jobs: [job({ userId: 'payer', apiCostUsd: 1 }), job({ userId: 'trial', apiCostUsd: 0.5 })],
    });
    expect(r.mrrRatio).toBeCloseTo(netRevenueUsd(PLANS.pro.priceCents) / 1.5, 2);
    expect(r.freeActiveUsers).toBe(1);
    expect(r.freeUserCostUsd).toBeCloseTo(0.5, 4);
  });
});
