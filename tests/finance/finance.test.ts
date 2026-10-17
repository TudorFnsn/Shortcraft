import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceInput } from '@/features/finance/finance';

const NOW = new Date('2026-10-17T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const empty: FinanceInput = {
  now: NOW,
  subscriptions: [],
  topups: [],
  jobs: [],
  fixedCostsUsdPerMonth: 0,
  windowDays: 30,
};
const job = (over: Partial<FinanceInput['jobs'][number]> = {}): FinanceInput['jobs'][number] => ({
  status: 'done',
  modelTier: 'standard',
  targetDurationSec: 15,
  apiCostUsd: 0.04,
  actualCredits: 2000,
  createdAt: daysAgo(1),
  ...over,
});

describe('computeFinance', () => {
  it('is all zeros / nulls with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.arpuEur).toBeNull();
    expect(r.revenueToCost).toBeNull();
    expect(r.monthlyProfitUsd).toBe(0);
  });

  it('counts only live subscriptions toward MRR', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'past_due' },
        { planId: 'ultra', status: 'canceled' },
        { planId: 'mystery', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBe(44.98);
    expect(r.arpuEur).toBe(22.49);
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1, ultra: 0 });
  });

  it('nets each top-up and ignores ones outside the window or unknown packs', () => {
    const r = computeFinance({
      ...empty,
      topups: [
        { credits: 20_000, createdAt: daysAgo(2) },
        { credits: 20_000, createdAt: daysAgo(90) },
        { credits: 123, createdAt: daysAgo(1) },
      ],
    });
    expect(r.topupRevenueEur).toBe(12);
  });

  it('groups finished videos by tier and tracks failed-job spend', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        job(),
        job({ apiCostUsd: 0.06 }),
        job({ modelTier: 'premium', apiCostUsd: 2, actualCredits: 40_000 }),
        job({ status: 'failed', apiCostUsd: 0.5 }),
        job({ createdAt: daysAgo(60), apiCostUsd: 9 }),
      ],
    });
    expect(r.apiCostUsd).toBe(2.6);
    expect(r.failedJobCostUsd).toBe(0.5);
    expect(r.byTier.standard).toMatchObject({ videos: 2, avgCostUsd: 0.05, creditsPerUsd: 40_000 });
    expect(r.byTier.premium?.videos).toBe(1);
  });

  it('reports profit after variable and fixed cost', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [job({ apiCostUsd: 3 })],
      fixedCostsUsdPerMonth: 10,
    });
    expect(r.monthlyProfitUsd).toBeCloseTo(r.netMrrUsd - 3 - 10, 2);
    expect(r.revenueToCost).toBeCloseTo(r.netMrrUsd / 13, 2);
  });
});
