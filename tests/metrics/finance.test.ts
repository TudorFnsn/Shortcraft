import { describe, expect, it } from 'vitest';
import { DAY_MS } from '@/features/metrics/north-star';
import { computeFinance, type FinanceInput, type FinanceJob } from '@/features/metrics/finance';
import { netRevenueUsd } from '@/features/billing/margin';
import { PLANS, TOPUP_PACKS } from '@/config/plans';

const NOW = new Date('2026-10-18T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = { subscriptions: [], jobs: [], topUps: [], now: NOW };
const job = (over: Partial<FinanceJob>): FinanceJob => ({
  userId: 'u',
  status: 'done',
  modelTier: 'standard',
  createdAt: daysAgo(1),
  apiCostUsd: 0.1,
  actualCredits: 2000,
  ...over,
});

describe('computeFinance', () => {
  it('returns zeros and nulls with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrNetUsd).toBe(0);
    expect(r.arpuNetUsd).toBeNull();
    expect(r.costPerVideoUsd).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.costPer1kCreditsUsd).toBeNull();
  });

  it('sums MRR over live subscriptions on sold plans only', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'pro', status: 'active' },
        { userId: 'b', planId: 'starter', status: 'trialing' },
        { userId: 'c', planId: 'ultra', status: 'canceled' },
        { userId: 'd', planId: 'legacy', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1, ultra: 0 });
    expect(r.mrrGrossEur).toBeCloseTo((PLANS.pro.priceCents + PLANS.starter.priceCents) / 100);
    expect(r.mrrNetUsd).toBeCloseTo(
      netRevenueUsd(PLANS.pro.priceCents) + netRevenueUsd(PLANS.starter.priceCents),
      1,
    );
    expect(r.arpuNetUsd).toBeCloseTo(r.mrrNetUsd / 2, 1);
  });

  it('counts failed jobs in cost but only done jobs as videos', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        job({ apiCostUsd: 0.1 }),
        job({ apiCostUsd: 0.3 }),
        job({ status: 'failed', apiCostUsd: 0.2 }),
        job({ createdAt: daysAgo(40), apiCostUsd: 9 }),
      ],
    });
    expect(r.apiCostUsd).toBeCloseTo(0.6);
    expect(r.videosDone).toBe(2);
    expect(r.costPerVideoUsd).toBeCloseTo(0.3);
    expect(r.failedCostUsd).toBeCloseTo(0.2);
  });

  it('splits cost by tier', () => {
    const r = computeFinance({
      ...empty,
      jobs: [job({ apiCostUsd: 0.07 }), job({ modelTier: 'premium', apiCostUsd: 1.1 })],
    });
    expect(r.byTier.standard?.costPerVideoUsd).toBeCloseTo(0.07);
    expect(r.byTier.premium?.costPerVideoUsd).toBeCloseTo(1.1);
  });

  it('matches top-ups to packs inside the window and flags unknown amounts', () => {
    const pack = TOPUP_PACKS[0]!;
    const r = computeFinance({
      ...empty,
      topUps: [
        { credits: pack.credits, createdAt: daysAgo(2) },
        { credits: pack.credits, createdAt: daysAgo(60) },
        { credits: 123, createdAt: daysAgo(2) },
      ],
    });
    expect(r.topUpNetUsd).toBeCloseTo(netRevenueUsd(pack.priceCents), 1);
    expect(r.unmatchedTopUps).toBe(1);
  });

  it('computes gross margin on net revenue', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      jobs: [job({ apiCostUsd: 5 })],
    });
    const net = netRevenueUsd(PLANS.pro.priceCents);
    expect(r.grossMargin).toBeCloseTo((net - 5) / net, 2);
    expect(r.costPer1kCreditsUsd).toBeCloseTo(2.5);
  });
});
