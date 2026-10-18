import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceInput } from '@/features/finance/unit-economics';
import { netRevenueUsd } from '@/features/billing/margin';

const NOW = new Date('2026-10-18T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);

const empty: FinanceInput = {
  now: NOW,
  subscriptions: [],
  jobs: [],
  topUps: [],
  fixedCosts: [],
  adSpendUsd30d: 0,
};

const job = (over: Partial<FinanceInput['jobs'][number]> = {}): FinanceInput['jobs'][number] => ({
  status: 'done',
  modelTier: 'standard',
  targetDurationSec: 15,
  apiCostUsd: 0.07,
  actualCredits: 2000,
  createdAt: daysAgo(1),
  ...over,
});

describe('computeFinance', () => {
  it('is all zeros with no data and never divides by zero', () => {
    const r = computeFinance(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.arrEur).toBe(0);
    expect(r.avgApiCostPerVideoUsd).toBeNull();
    expect(r.apiCostShare).toBeNull();
    expect(r.revenueToCostMultiple).toBeNull();
    expect(r.profitUsd30d).toBe(0);
  });

  it('computes MRR from live subscriptions on sold plans only', () => {
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
    expect(r.mrrEur).toBe(14.99 + 29.99);
    expect(r.arrEur).toBe(Math.round((14.99 + 29.99) * 12 * 100) / 100);
    expect(r.netMrrUsd).toBeCloseTo(netRevenueUsd(1499) + netRevenueUsd(2999), 1);
    expect(r.byPlan.find((p) => p.planId === 'pro')?.subscribers).toBe(1);
  });

  it('counts API spend of failed jobs but averages finished videos only', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        job({ apiCostUsd: 0.1 }),
        job({ apiCostUsd: 0.3 }),
        job({ status: 'failed', apiCostUsd: 0.5 }),
        job({ apiCostUsd: 9, createdAt: daysAgo(40) }),
      ],
    });
    expect(r.videosDone30d).toBe(2);
    expect(r.videosFailed30d).toBe(1);
    expect(r.apiCostUsd30d).toBe(0.9);
    expect(r.avgApiCostPerVideoUsd).toBe(0.2);
  });

  it('splits cost per tier and reports credits billed per dollar of cost', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        job({ apiCostUsd: 0.1, actualCredits: 2000 }),
        job({ modelTier: 'premium', apiCostUsd: 2, actualCredits: 26_000 }),
      ],
    });
    expect(r.byTier.map((t) => t.tier)).toEqual(['premium', 'standard']);
    expect(r.byTier.find((t) => t.tier === 'premium')?.creditsPerUsd).toBe(13_000);
    expect(r.byTier.find((t) => t.tier === 'standard')?.creditsPerUsd).toBe(20_000);
  });

  it('adds top-ups from the window and ignores unknown pack sizes', () => {
    const r = computeFinance({
      ...empty,
      topUps: [
        { credits: 20_000, createdAt: daysAgo(3) },
        { credits: 20_000, createdAt: daysAgo(50) },
        { credits: 777, createdAt: daysAgo(2) },
      ],
    });
    expect(r.topUpNetUsd30d).toBeCloseTo(netRevenueUsd(1200), 1);
    expect(r.netRevenueUsd30d).toBe(r.topUpNetUsd30d);
  });

  it('keeps profit unknown while a fixed cost or ad spend is missing', () => {
    const base = {
      ...empty,
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      jobs: [job({ apiCostUsd: 1 })],
    };
    const known = computeFinance({
      ...base,
      fixedCosts: [{ id: 'vercel', label: 'Vercel', monthlyUsd: 20 }],
    });
    expect(known.profitUsd30d).toBe(known.profitKnownCostsUsd30d);
    expect(known.profitKnownCostsUsd30d).toBeCloseTo(known.netRevenueUsd30d - 1 - 20, 1);

    const unknown = computeFinance({
      ...base,
      fixedCosts: [
        { id: 'vercel', label: 'Vercel', monthlyUsd: 20 },
        { id: 'elevenlabs', label: 'ElevenLabs', monthlyUsd: null },
      ],
    });
    expect(unknown.profitUsd30d).toBeNull();
    expect(unknown.unknownFixedCosts).toEqual(['elevenlabs']);
    expect(unknown.profitKnownCostsUsd30d).toBe(known.profitKnownCostsUsd30d);

    expect(computeFinance({ ...base, adSpendUsd30d: null }).profitUsd30d).toBeNull();
  });

  it('reports revenue as a multiple of API + known fixed cost', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'a', planId: 'ultra', status: 'active' }],
      jobs: [job({ apiCostUsd: 5 })],
      fixedCosts: [{ id: 'x', label: 'X', monthlyUsd: 15 }],
    });
    expect(r.revenueToCostMultiple).toBeCloseTo(r.netRevenueUsd30d / 20, 1);
    expect(r.apiCostShare).toBeCloseTo(5 / r.netRevenueUsd30d, 2);
  });
});
