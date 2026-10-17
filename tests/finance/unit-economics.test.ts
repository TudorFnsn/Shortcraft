import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceInput } from '@/features/finance/unit-economics';
import { netRevenueUsd } from '@/features/billing/margin';
import { PLANS } from '@/config/plans';

const NOW = new Date('2026-10-17T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);

const empty: FinanceInput = { subscriptions: [], jobs: [], topUps: [], now: NOW };

const job = (over: Partial<FinanceInput['jobs'][number]> = {}) => ({
  status: 'done',
  modelTier: 'standard',
  createdAt: daysAgo(1),
  apiCostUsd: 0.1,
  chargedCredits: 1000,
  ...over,
});

describe('computeFinance', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.payingSubscribers).toBe(0);
    expect(r.arpuEur).toBeNull();
    expect(r.burnRatio).toBeNull();
    expect(r.realisedMargin).toBeNull();
    expect(r.costPerFinishedUsd).toBeNull();
    expect(r.costPer1kCreditsUsd).toBeNull();
    expect(r.byTier).toEqual([]);
  });

  it('sums MRR over live subscriptions only, on plans we sell', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'trialing' },
        { userId: 'c', planId: 'pro', status: 'canceled' },
        { userId: 'd', planId: 'legacy', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1 });
    expect(r.mrrEur).toBeCloseTo((PLANS.starter.priceCents + PLANS.pro.priceCents) / 100, 2);
    expect(r.arpuEur).toBeCloseTo(r.mrrEur / 2, 2);
    expect(r.netMrrUsd).toBeCloseTo(
      netRevenueUsd(PLANS.starter.priceCents) + netRevenueUsd(PLANS.pro.priceCents),
      2,
    );
  });

  it('charges failed jobs to the cost of a finished video', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        job({ apiCostUsd: 0.1 }),
        job({ apiCostUsd: 0.3, status: 'failed', chargedCredits: 0 }),
        job({ apiCostUsd: 0.2, createdAt: daysAgo(45) }), // outside the window
      ],
    });
    expect(r.jobsInWindow).toBe(2);
    expect(r.finishedInWindow).toBe(1);
    expect(r.failedInWindow).toBe(1);
    expect(r.apiCostUsd).toBeCloseTo(0.4, 2);
    expect(r.costPerFinishedUsd).toBeCloseTo(0.4, 4);
    expect(r.costPer1kCreditsUsd).toBeCloseTo(0.4, 4);
  });

  it('computes burn ratio and realised margin against net MRR', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      jobs: [job({ apiCostUsd: 2 })],
    });
    const net = netRevenueUsd(PLANS.pro.priceCents);
    expect(r.burnRatio).toBeCloseTo(2 / net, 2);
    expect(r.realisedMargin).toBeCloseTo((net - 2) / net, 2);
  });

  it('splits cost by tier', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        job({ modelTier: 'standard', apiCostUsd: 0.1 }),
        job({ modelTier: 'premium', apiCostUsd: 2.5 }),
        job({ modelTier: 'premium', apiCostUsd: 1.5 }),
      ],
    });
    expect(r.byTier.map((t) => t.tier)).toEqual(['premium', 'standard']);
    expect(r.byTier[0]?.costPerFinishedUsd).toBeCloseTo(2, 4);
    expect(r.byTier[1]?.costPerFinishedUsd).toBeCloseTo(0.1, 4);
  });

  it('prices top-ups from the matching pack and ignores unknown amounts', () => {
    const r = computeFinance({
      ...empty,
      topUps: [
        { credits: 20_000, createdAt: daysAgo(3) },
        { credits: 20_000, createdAt: daysAgo(40) },
        { credits: 123, createdAt: daysAgo(2) },
      ],
    });
    expect(r.topUpsInWindow).toBe(2);
    expect(r.topUpRevenueEur).toBe(12);
  });
});
