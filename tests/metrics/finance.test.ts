import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceJob } from '@/features/metrics/finance';
import { DAY_MS } from '@/features/metrics/north-star';
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';

const NOW = new Date('2026-10-17T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const job = (over: Partial<FinanceJob>): FinanceJob => ({
  userId: 'u1',
  status: 'done',
  createdAt: daysAgo(1),
  apiCostUsd: 0.1,
  actualCredits: 2000,
  targetDurationSec: 15,
  modelTier: 'standard',
  ...over,
});
const base = { now: NOW, jobs: [], subscriptions: [], topUps: [], payerIds: new Set<string>() };

describe('computeFinance', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinance(base);
    expect(r.mrrEur).toBe(0);
    expect(r.grossMargin30d).toBeNull();
    expect(r.revenueToCost30d).toBeNull();
    expect(r.costPerSubscriber30d).toBeNull();
  });

  it('sums MRR over live subscriptions only', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'past_due' },
        { userId: 'c', planId: 'pro', status: 'canceled' },
        { userId: 'd', planId: 'bogus', status: 'active' },
      ],
    });
    expect(r.mrrEur).toBeCloseTo((PLANS.starter.priceCents + PLANS.pro.priceCents) / 100);
    expect(r.liveSubscribers).toEqual({ starter: 1, pro: 1 });
  });

  it('separates wasted failed-job cost and unpaid-user cost, ignores jobs older than 30d', () => {
    const r = computeFinance({
      ...base,
      payerIds: new Set(['payer']),
      jobs: [
        job({ userId: 'payer', apiCostUsd: 0.2 }),
        job({ userId: 'free', apiCostUsd: 0.05 }),
        job({ userId: 'free', status: 'failed', apiCostUsd: 0.3 }),
        job({ userId: 'free', createdAt: daysAgo(40), apiCostUsd: 9 }),
      ],
    });
    expect(r.apiCost30d.done).toBeCloseTo(0.25);
    expect(r.apiCost30d.failedWasted).toBeCloseTo(0.3);
    expect(r.apiCost30d.unpaidUsers).toBeCloseTo(0.35);
  });

  it('computes gross margin from net revenue and total cost', () => {
    const pack = TOPUP_PACKS[0]!;
    const r = computeFinance({
      ...base,
      subscriptions: [{ userId: 'a', planId: 'starter', status: 'active' }],
      topUps: [{ userId: 'a', createdAt: daysAgo(2), credits: pack.credits }],
      jobs: [job({ userId: 'a', apiCostUsd: 1 })],
    });
    const revenue = netRevenueUsd(PLANS.starter.priceCents) + netRevenueUsd(pack.priceCents);
    expect(r.grossMargin30d).toBeCloseTo((revenue - 1) / revenue);
    expect(r.revenueToCost30d).toBeCloseTo(revenue);
    expect(r.costPerSubscriber30d).toBeCloseTo(1);
  });

  it('buckets done videos by tier with cost per 1k credits', () => {
    const r = computeFinance({
      ...base,
      jobs: [
        job({ apiCostUsd: 0.1, actualCredits: 2000 }),
        job({ modelTier: 'premium', apiCostUsd: 1, actualCredits: 20000 }),
      ],
    });
    expect(r.byTier.standard?.costPer1kCredits).toBeCloseTo(0.05);
    expect(r.byTier.premium?.avgCostUsd).toBe(1);
  });
});
