import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceJob } from '@/features/finance/unit-economics';

const NOW = new Date('2026-10-20T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const job = (over: Partial<FinanceJob>): FinanceJob => ({
  status: 'done',
  modelTier: 'standard',
  actualCredits: 2000,
  apiCostUsd: 0.07,
  createdAt: daysAgo(1),
  ...over,
});

describe('computeFinance', () => {
  it('is all zeros and null ratios with no data', () => {
    const r = computeFinance({ now: NOW, subscriptions: [], jobs: [] });
    expect(r.mrrEur).toBe(0);
    expect(r.arpuEur).toBeNull();
    expect(r.grossMarginMonthly).toBeNull();
    expect(r.tiers).toEqual([]);
  });

  it('sums MRR over live subscriptions on sold plans only', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'legacy', status: 'active' },
      ],
      jobs: [],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBe(44.98);
    expect(r.arrEur).toBe(539.76);
    expect(r.arpuEur).toBe(22.49);
    expect(r.netMrrUsd).toBeGreaterThan(0);
  });

  it('prices cost per done video by tier and counts failed jobs as waste', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        job({}),
        job({ apiCostUsd: 0.09 }),
        job({ modelTier: 'premium', actualCredits: 26_000, apiCostUsd: 1.1 }),
        job({ status: 'failed', apiCostUsd: 0.5 }),
        job({ createdAt: daysAgo(40), apiCostUsd: 99 }), // outside the window
      ],
    });
    const std = r.tiers.find((t) => t.tier === 'standard');
    expect(std?.videos).toBe(2);
    expect(std?.avgCostUsd).toBeCloseTo(0.08);
    expect(std?.creditsPerUsd).toBeCloseTo(4000 / 0.16);
    expect(r.tiers.find((t) => t.tier === 'premium')?.avgCostUsd).toBeCloseTo(1.1);
    expect(r.wastedApiCostUsd).toBe(0.5);
    expect(r.windowApiCostUsd).toBe(1.76);
    expect(r.grossMarginMonthly).toBeGreaterThan(0.9);
  });
});
