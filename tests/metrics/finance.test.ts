import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceInput } from '@/features/metrics/finance';
import { netRevenueUsd } from '@/features/billing/margin';

const NOW = new Date('2026-10-18T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const empty: FinanceInput = { subscriptions: [], jobs: [], topUps: [], now: NOW, fixedCosts: [] };

describe('computeFinance', () => {
  it('is all zeros / null with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.arpuEur).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.breakEvenSubscribers).toBeNull();
  });

  it('counts only live subscriptions on plans we sell', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'starter', status: 'past_due' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'ghost', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBeCloseTo(29.99 + 14.99);
    expect(r.byPlan.pro?.subscribers).toBe(1);
    expect(r.arpuEur).toBeCloseTo((29.99 + 14.99) / 2);
  });

  it('prices top-ups by pack and flags unknown sizes, window only', () => {
    const r = computeFinance({
      ...empty,
      topUps: [
        { credits: 20_000, createdAt: daysAgo(2) },
        { credits: 20_000, createdAt: daysAgo(40) },
        { credits: 12_345, createdAt: daysAgo(1) },
      ],
    });
    expect(r.topUpRevenueUsd).toBeCloseTo(netRevenueUsd(1200));
    expect(r.unpricedTopUps).toBe(1);
  });

  it('splits API cost by tier, isolates failed-job waste, and computes margin and profit', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        {
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 0.1,
          actualCredits: 2000,
          createdAt: daysAgo(1),
        },
        {
          status: 'done',
          modelTier: 'premium',
          apiCostUsd: 1.1,
          actualCredits: 26_000,
          createdAt: daysAgo(2),
        },
        {
          status: 'failed',
          modelTier: 'premium',
          apiCostUsd: 0.5,
          actualCredits: 0,
          createdAt: daysAgo(3),
        },
        {
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 9,
          actualCredits: 1,
          createdAt: daysAgo(60),
        },
      ],
      fixedCosts: [{ id: 'x', vendor: 'x', what: 'x', usdPerMonth: 10, status: 'assumed' }],
    });
    expect(r.apiCostUsd).toBeCloseTo(1.7);
    expect(r.failedJobCostUsd).toBeCloseTo(0.5);
    expect(r.byTier.standard?.costPerVideoUsd).toBeCloseTo(0.1);
    expect(r.byTier.premium?.usdPer1kCredits).toBeCloseTo((1.1 / 26_000) * 1000);
    const net = netRevenueUsd(2999);
    expect(r.grossMargin).toBeCloseTo((net - 1.7) / net);
    expect(r.profitUsd).toBeCloseTo(net - 1.7 - 10);
    expect(r.unconfirmedFixedCosts).toEqual(['x']);
    expect(r.breakEvenSubscribers).toBe(Math.ceil(10 / (net - 1.7)));
  });
});
