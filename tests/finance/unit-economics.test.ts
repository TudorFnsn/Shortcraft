import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceInput } from '@/features/finance/unit-economics';
import { netRevenueUsd } from '@/features/billing/margin';

const NOW = new Date('2026-10-20T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const empty: FinanceInput = { now: NOW, subscriptions: [], jobs: [], topups: [], fixedCosts: [] };

describe('computeFinance', () => {
  it('returns zeros and a null ratio with no data', () => {
    const r = computeFinance(empty);
    expect(r.payingSubscribers).toBe(0);
    expect(r.netRevenueUsd).toBe(0);
    expect(r.costRatio).toBeNull();
    expect(r.tiers).toEqual([]);
  });

  it('counts only live subscriptions on plans we sell', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'starter', status: 'canceled' },
        { planId: 'ghost', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(1);
    expect(r.mrrGrossEur).toBe(29.99);
    expect(r.mrrNetUsd).toBe(Number(netRevenueUsd(2999).toFixed(2)));
  });

  it('prices top-ups from the pack, inside the window only', () => {
    const r = computeFinance({
      ...empty,
      topups: [
        { credits: 20_000, createdAt: daysAgo(3) },
        { credits: 20_000, createdAt: daysAgo(45) },
        { credits: 777, createdAt: daysAgo(1) },
      ],
    });
    expect(r.topupNetUsd).toBe(Number(netRevenueUsd(1200).toFixed(2)));
    expect(r.unpricedTopups).toBe(1);
  });

  it('splits cost per delivered video from money wasted on failures', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        {
          status: 'done',
          modelTier: 'standard',
          createdAt: daysAgo(1),
          apiCostUsd: 0.1,
          actualCredits: 2000,
        },
        {
          status: 'done',
          modelTier: 'standard',
          createdAt: daysAgo(2),
          apiCostUsd: 0.2,
          actualCredits: 2000,
        },
        {
          status: 'failed',
          modelTier: 'standard',
          createdAt: daysAgo(2),
          apiCostUsd: 0.05,
          actualCredits: 0,
        },
        {
          status: 'done',
          modelTier: 'standard',
          createdAt: daysAgo(40),
          apiCostUsd: 9,
          actualCredits: 1,
        },
      ],
    });
    const t = r.tiers[0];
    expect(t?.done).toBe(2);
    expect(t?.failed).toBe(1);
    expect(t?.costPerVideoUsd).toBe(0.15);
    expect(t?.wastedUsd).toBe(0.05);
    expect(t?.costPer1kCreditsUsd).toBe(0.075);
    expect(r.apiCostUsd).toBe(0.35);
  });

  it('reports profit, ratio and the fixed costs it could not price', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ planId: 'starter', status: 'active' }],
      jobs: [
        {
          status: 'done',
          modelTier: 'premium',
          createdAt: daysAgo(1),
          apiCostUsd: 2,
          actualCredits: 26_000,
        },
      ],
      fixedCosts: [
        { id: 'vercel', monthlyUsd: 20 },
        { id: 'supabase', monthlyUsd: null },
      ],
    });
    expect(r.fixedCostsUsd).toBe(20);
    expect(r.unknownFixedCosts).toEqual(['supabase']);
    expect(r.profitUsd).toBe(Number((r.netRevenueUsd - 22).toFixed(2)));
    expect(r.costRatio).toBeGreaterThan(1);
  });
});
