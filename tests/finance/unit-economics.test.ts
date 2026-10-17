import { describe, expect, it } from 'vitest';
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import type { FixedCost } from '@/config/fixed-costs';
import { netRevenueUsd } from '@/features/billing/margin';
import { computeFinance, DAY_MS, type FinanceInput } from '@/features/finance/unit-economics';

const NOW = new Date('2026-10-17T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = { jobs: [], subscriptions: [], topUps: [], fixedCosts: [], now: NOW };
const job = (over: Partial<FinanceInput['jobs'][number]> = {}) => ({
  userId: 'u',
  status: 'done',
  modelTier: 'standard',
  apiCostUsd: 0.07,
  createdAt: daysAgo(1),
  ...over,
});

describe('computeFinance', () => {
  it('returns zeros and nulls with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrUsd).toBe(0);
    expect(r.arpuUsd).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.avgCostPerVideoUsd).toBeNull();
    expect(r.breakEvenSubscribers).toBeNull();
  });

  it('counts MRR only for live subscriptions on a sold plan', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'pro', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'past_due' },
        { userId: 'c', planId: 'starter', status: 'canceled' },
        { userId: 'd', planId: 'legacy', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.byPlan).toEqual([{ planId: 'pro', subscribers: 2, mrrUsd: expect.any(Number) }]);
    expect(r.netMrrUsd).toBeCloseTo(2 * netRevenueUsd(PLANS.pro.priceCents), 1);
    expect(r.mrrUsd).toBeGreaterThan(r.netMrrUsd);
    expect(r.arrUsd).toBeCloseTo(r.netMrrUsd * 12, 1);
  });

  it('separates wasted cost from delivered videos and averages per tier', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        job({ apiCostUsd: 0.1 }),
        job({ apiCostUsd: 0.3 }),
        job({ modelTier: 'premium', apiCostUsd: 1.1 }),
        job({ status: 'failed', apiCostUsd: 0.5 }),
        job({ status: 'running', apiCostUsd: 0.2 }),
        job({ createdAt: daysAgo(40), apiCostUsd: 9 }), // outside the window
      ],
    });
    expect(r.videosDone).toBe(3);
    expect(r.apiCostUsd).toBeCloseTo(2.2, 4);
    expect(r.wastedUsd).toBeCloseTo(0.5, 4);
    expect(r.byTier.find((t) => t.tier === 'standard')?.avgCostUsd).toBeCloseTo(0.2, 4);
    expect(r.avgCostPerVideoUsd).toBeCloseTo(2.2 / 3, 3);
  });

  it('adds top-ups bought in the window to revenue, not to MRR', () => {
    const pack = TOPUP_PACKS[0]!;
    const r = computeFinance({
      ...empty,
      topUps: [
        { userId: 'a', credits: pack.credits, createdAt: daysAgo(2) },
        { userId: 'a', credits: pack.credits, createdAt: daysAgo(90) },
        { userId: 'a', credits: 123, createdAt: daysAgo(2) }, // not a pack
      ],
    });
    expect(r.topUpPurchases).toBe(1);
    expect(r.mrrUsd).toBe(0);
    expect(r.netRevenueUsd).toBeCloseTo(netRevenueUsd(pack.priceCents), 1);
  });

  it('computes gross margin, profit and break-even; unknown fixed costs are listed, not zero', () => {
    const fixed: FixedCost[] = [
      { id: 'a', label: 'Known', monthlyUsd: 25, note: '' },
      { id: 'b', label: 'Unknown', monthlyUsd: null, note: '' },
    ];
    const r = computeFinance({
      ...empty,
      fixedCosts: fixed,
      subscriptions: [{ userId: 'a', planId: 'starter', status: 'active' }],
      jobs: [job({ apiCostUsd: 1 })],
    });
    const net = netRevenueUsd(PLANS.starter.priceCents);
    expect(r.fixedUsd).toBe(25);
    expect(r.unknownFixed).toEqual(['Unknown']);
    expect(r.grossMargin).toBeCloseTo((net - 1) / net, 2);
    expect(r.monthlyProfitUsd).toBeCloseTo(net - 1 - 25, 1);
    expect(r.breakEvenSubscribers).toBe(Math.ceil(25 / (net - 1)));
  });

  it('has no break-even when each subscriber costs more than they pay', () => {
    const r = computeFinance({
      ...empty,
      fixedCosts: [{ id: 'a', label: 'A', monthlyUsd: 25, note: '' }],
      subscriptions: [{ userId: 'a', planId: 'starter', status: 'active' }],
      jobs: [job({ apiCostUsd: 500 })],
    });
    expect(r.breakEvenSubscribers).toBeNull();
  });
});
