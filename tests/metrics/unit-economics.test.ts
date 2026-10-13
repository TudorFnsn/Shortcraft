import { describe, expect, it } from 'vitest';
import { computeUnitEconomics, DAY_MS, type FinanceInput } from '@/features/metrics/unit-economics';

const NOW = new Date('2026-10-13T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = { now: NOW, subscriptions: [], jobs: [], topUps: [] };

describe('computeUnitEconomics', () => {
  it('is all zeros / nulls with no data', () => {
    const r = computeUnitEconomics(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.arpuEur).toBeNull();
    expect(r.last30d.coverage).toBeNull();
    expect(r.last30d.costPerFinishedVideoUsd).toBeNull();
  });

  it('sums MRR for live subscriptions only', () => {
    const r = computeUnitEconomics({
      ...empty,
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'ultra', status: 'unpaid' },
      ],
    });
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1, ultra: 0 });
    expect(r.mrrEur).toBe(44.98);
    expect(r.arpuEur).toBe(22.49);
  });

  it('splits API cost into finished vs wasted and prices a finished video', () => {
    const job = { modelTier: 'standard', actualCredits: 1000, createdAt: daysAgo(2) };
    const r = computeUnitEconomics({
      ...empty,
      jobs: [
        { ...job, status: 'done', apiCostUsd: 0.1 },
        { ...job, status: 'done', apiCostUsd: 0.3 },
        { ...job, status: 'failed', apiCostUsd: 0.2 },
        { ...job, status: 'done', apiCostUsd: 9, createdAt: daysAgo(40) },
      ],
    });
    expect(r.last30d.apiCostUsd).toBe(0.6);
    expect(r.last30d.wastedApiCostUsd).toBe(0.2);
    expect(r.last30d.finishedVideos).toBe(2);
    expect(r.last30d.failedVideos).toBe(1);
    expect(r.last30d.costPerFinishedVideoUsd).toBe(0.3);
    expect(r.last30d.byTier.standard?.costPerVideoUsd).toBe(0.2);
    expect(r.last30d.apiUsdPer1kCredits).toBe(0.2);
  });

  it('counts recent top-ups by pack and computes profit and coverage', () => {
    const r = computeUnitEconomics({
      ...empty,
      subscriptions: [{ planId: 'starter', status: 'active' }],
      topUps: [
        { credits: 20_000, createdAt: daysAgo(3) },
        { credits: 20_000, createdAt: daysAgo(50) },
        { credits: 123, createdAt: daysAgo(1) },
      ],
      jobs: [
        {
          status: 'done',
          modelTier: 'premium',
          apiCostUsd: 2,
          actualCredits: 1,
          createdAt: daysAgo(1),
        },
      ],
      fixedCostsUsdPerMonth: 1,
    });
    expect(r.last30d.topUpNetUsd).toBeGreaterThan(0);
    expect(r.last30d.profitUsd).toBeCloseTo(r.last30d.revenueNetUsd - 3, 2);
    expect(r.last30d.coverage).toBeCloseTo(r.last30d.revenueNetUsd / 3, 1);
  });
});
