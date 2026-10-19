import { describe, expect, it } from 'vitest';
import { PLANS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { computeFinance, type FinanceJob } from '@/features/finance/unit-economics';

const now = new Date('2026-10-19T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

const job = (over: Partial<FinanceJob>): FinanceJob => ({
  userId: 'u1',
  status: 'done',
  modelTier: 'standard',
  targetDurationSec: 15,
  apiCostUsd: 0.05,
  actualCredits: 2000,
  createdAt: daysAgo(1),
  ...over,
});

const sub = (userId: string, planId: string, status = 'active') => ({ userId, planId, status });

describe('computeFinance', () => {
  it('is all zeros and nulls with no data', () => {
    const r = computeFinance({ jobs: [], subscriptions: [], payerIds: new Set(), now });
    expect(r.mrrEur).toBe(0);
    expect(r.cogsRatio).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.tiers).toEqual([]);
    expect(r.tokens).toBe('unmeasured');
  });

  it('sums MRR over live subscriptions on plans we sell only', () => {
    const r = computeFinance({
      jobs: [],
      subscriptions: [
        sub('a', 'starter'),
        sub('b', 'pro', 'trialing'),
        sub('c', 'pro', 'canceled'),
        sub('d', 'enterprise'),
      ],
      payerIds: new Set(),
      now,
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBeCloseTo((PLANS.starter.priceCents + PLANS.pro.priceCents) / 100);
    expect(r.netMrrUsd).toBeCloseTo(
      netRevenueUsd(PLANS.starter.priceCents) + netRevenueUsd(PLANS.pro.priceCents),
    );
  });

  it('counts only jobs from the trailing window', () => {
    const r = computeFinance({
      jobs: [job({}), job({ createdAt: daysAgo(31), apiCostUsd: 9 })],
      subscriptions: [],
      payerIds: new Set(),
      now,
    });
    expect(r.spendUsd).toBeCloseTo(0.05);
  });

  it('separates failed-job waste and trial burn, and prices a finished video by tier', () => {
    const r = computeFinance({
      jobs: [
        job({ apiCostUsd: 0.04 }),
        job({ apiCostUsd: 0.06, targetDurationSec: 30, actualCredits: 3000 }),
        job({ status: 'failed', apiCostUsd: 0.5, modelTier: 'premium' }),
        job({ userId: 'trial', apiCostUsd: 0.2 }),
      ],
      subscriptions: [sub('u1', 'starter')],
      payerIds: new Set(['u1']),
      now,
    });
    expect(r.wasteUsd).toBeCloseTo(0.5);
    expect(r.trialBurnUsd).toBeCloseTo(0.2);
    const std = r.tiers.find((t) => t.tier === 'standard')!;
    expect(std.finished).toBe(3);
    expect(std.costPerVideoUsd).toBeCloseTo(0.1);
    const premium = r.tiers.find((t) => t.tier === 'premium')!;
    expect(premium.finished).toBe(0);
    expect(premium.costPerVideoUsd).toBeNull();
    expect(premium.wasteUsd).toBeCloseTo(0.5);
  });

  it('computes COGS ratio and gross margin against net MRR', () => {
    const net = netRevenueUsd(PLANS.starter.priceCents);
    const r = computeFinance({
      jobs: [job({ apiCostUsd: net / 4 })],
      subscriptions: [sub('u1', 'starter')],
      payerIds: new Set(['u1']),
      now,
    });
    expect(r.cogsRatio).toBeCloseTo(0.25);
    expect(r.grossMargin).toBeCloseTo(0.75);
    expect(r.underwater).toEqual([]);
  });

  it('flags subscribers who cost more than their net plan revenue', () => {
    const net = netRevenueUsd(PLANS.starter.priceCents);
    const r = computeFinance({
      jobs: [job({ userId: 'whale', apiCostUsd: net * 2 }), job({ userId: 'minnow' })],
      subscriptions: [sub('whale', 'starter'), sub('minnow', 'starter')],
      payerIds: new Set(['whale', 'minnow']),
      now,
    });
    expect(r.underwater.map((u) => u.userId)).toEqual(['whale']);
    expect(r.underwater[0]?.costRatio).toBeCloseTo(2);
    expect(r.topSpenders[0]?.userId).toBe('whale');
  });
});
