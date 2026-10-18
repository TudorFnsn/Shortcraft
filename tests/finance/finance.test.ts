import { describe, expect, it } from 'vitest';
import {
  computeFinance,
  DAY_MS,
  type FinanceInput,
  type FinanceJob,
} from '@/features/finance/finance';

const NOW = new Date('2026-10-18T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = { subscriptions: [], jobs: [], topUps: [], fixedCosts: [], now: NOW };
const job = (over: Partial<FinanceJob>): FinanceJob => ({
  status: 'done',
  modelTier: 'standard',
  targetDurationSec: 15,
  apiCostUsd: 0.04,
  chargedCredits: 1800,
  createdAt: daysAgo(1),
  ...over,
});

describe('computeFinance', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.cashMarginPct).toBeNull();
    expect(r.revenueToApiSpend).toBeNull();
    expect(r.byTier).toEqual([]);
  });

  it('counts MRR from live subscriptions on sold plans only', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'ghost', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBe(44.98);
    expect(r.arrEur).toBe(539.76);
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1, ultra: 0 });
    expect(r.netMrrUsd).toBeGreaterThan(0);
    expect(r.netMrrUsd).toBeLessThan(44.98 * 1.08);
  });

  it('matches top-ups to packs and reports the ones it cannot match', () => {
    const r = computeFinance({
      ...empty,
      topUps: [
        { credits: 20_000, createdAt: daysAgo(2) },
        { credits: 12_345, createdAt: daysAgo(2) },
        { credits: 20_000, createdAt: daysAgo(45) },
      ],
    });
    expect(r.topUpsMatched).toBe(1);
    expect(r.topUpsUnmatched).toBe(1);
    expect(r.topUpRevenueNetUsd).toBeGreaterThan(0);
  });

  it('splits spend by tier and counts failed spend as waste, inside the window only', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        job({}),
        job({ modelTier: 'premium', apiCostUsd: 1.5, chargedCredits: 30_000 }),
        job({ status: 'failed', apiCostUsd: 0.2 }),
        job({ apiCostUsd: 9, createdAt: daysAgo(40) }),
      ],
    });
    expect(r.apiSpendUsd).toBe(1.74);
    expect(r.wastedSpendUsd).toBe(0.2);
    expect(r.doneVideos).toBe(2);
    expect(r.failedVideos).toBe(1);
    expect(r.byTier.map((t) => t.tier)).toEqual(['premium', 'standard']);
    expect(r.byTier[0]?.creditsPerApiUsd).toBe(20_000);
  });

  it('never treats unknown fixed costs as zero', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      fixedCosts: [
        { id: 'a', label: 'A', monthlyUsd: 10 },
        { id: 'b', label: 'B', monthlyUsd: null },
      ],
    });
    expect(r.fixedKnownUsd).toBe(10);
    expect(r.fixedUnknown).toEqual(['b']);
    expect(r.cashProfitUsd).toBe(Math.round((r.netMrrUsd - 10) * 100) / 100);
    expect(r.cashMarginPct).not.toBeNull();
  });
});
