import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceJob } from '@/features/finance/finance';
import { netRevenueUsd } from '@/features/billing/margin';
import { PLANS } from '@/config/plans';

const NOW = new Date('2026-10-15T06:00:00Z');
const ago = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const job = (over: Partial<FinanceJob>): FinanceJob => ({
  userId: 'u1',
  status: 'done',
  modelTier: 'standard',
  apiCostUsd: 0.1,
  actualCredits: 2000,
  createdAt: ago(1),
  ...over,
});

describe('computeFinance', () => {
  it('is all zeros / nulls with no data', () => {
    const r = computeFinance({ now: NOW, subscriptions: [], jobs: [] });
    expect(r.mrrEur).toBe(0);
    expect(r.arpuEur).toBeNull();
    expect(r.blendedMultiple).toBeNull();
    expect(r.operatingResultUsd).toBeNull();
    expect(r.plans).toHaveLength(3);
  });

  it('counts MRR only for live subscriptions on sold plans', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'past_due' },
        { userId: 'c', planId: 'pro', status: 'canceled' },
        { userId: 'd', planId: 'legacy', status: 'active' },
      ],
      jobs: [],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBe((PLANS.starter.priceCents + PLANS.pro.priceCents) / 100);
    expect(r.arpuEur).toBe(22.49);
  });

  it('splits cost into trial burn, waste and per-tier economics inside the 30-day window', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [{ userId: 'a', planId: 'starter', status: 'active' }],
      jobs: [
        job({ userId: 'a', apiCostUsd: 0.2 }),
        job({ userId: 'a', status: 'failed', apiCostUsd: 0.05 }),
        job({ userId: 'free', apiCostUsd: 0.14 }),
        job({ userId: 'a', modelTier: 'premium', apiCostUsd: 1.1, actualCredits: 26_504 }),
        job({ userId: 'a', apiCostUsd: 9, createdAt: ago(31) }), // outside the window
      ],
    });
    expect(r.apiCostUsd).toBe(1.49);
    expect(r.wasteUsd).toBe(0.05);
    expect(r.trialBurnUsd).toBe(0.14);
    const std = r.tiers.find((t) => t.tier === 'standard');
    expect(std).toMatchObject({ finished: 2, failed: 1 });
    expect(std?.costPerFinishedUsd).toBeCloseTo(0.195, 4);
    expect(r.tiers.find((t) => t.tier === 'premium')?.costPer1kCreditsUsd).toBeCloseTo(0.04151, 4);
    // paying cost = 0.2 + 0.05 + 1.1
    expect(r.blendedMultiple).toBeCloseTo(netRevenueUsd(PLANS.starter.priceCents) / 1.35, 1);
  });

  it('flags thin and underwater subscribers', () => {
    const net = netRevenueUsd(PLANS.starter.priceCents);
    const r = computeFinance({
      now: NOW,
      subscriptions: [
        { userId: 'thin', planId: 'starter', status: 'active' },
        { userId: 'sunk', planId: 'starter', status: 'active' },
        { userId: 'ok', planId: 'starter', status: 'active' },
      ],
      jobs: [
        job({ userId: 'thin', apiCostUsd: net / 2 }),
        job({ userId: 'sunk', apiCostUsd: net * 2 }),
        job({ userId: 'ok', apiCostUsd: net / 10 }),
      ],
    });
    const starter = r.plans.find((p) => p.planId === 'starter');
    expect(starter).toMatchObject({ subscribers: 3, thin: 1, underwater: 1 });
  });

  it('derives operating result and break-even from fixed costs', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      jobs: [job({ userId: 'a', apiCostUsd: 1 })],
      fixedCosts: { monthlyUsd: { vercel: 20, supabase: 25 } },
    });
    expect(r.fixedCostsUsd).toBe(45);
    expect(r.operatingResultUsd).toBeCloseTo(r.grossProfitUsd - 45, 2);
    expect(r.breakEvenSubscribers).toBe(Math.ceil(45 / r.grossProfitUsd));
  });

  it('returns a null break-even when each subscriber loses money', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [{ userId: 'a', planId: 'starter', status: 'active' }],
      jobs: [job({ userId: 'a', apiCostUsd: 100 })],
      fixedCosts: { monthlyUsd: { vercel: 20 } },
    });
    expect(r.breakEvenSubscribers).toBeNull();
  });
});
