import { describe, expect, it } from 'vitest';
import {
  computeFinance,
  type FinanceInput,
  type FinanceJob,
} from '@/features/finance/unit-economics';

const NOW = new Date('2026-10-14T06:00:00Z');
const empty: FinanceInput = { subscriptions: [], jobs: [], now: NOW };
const job = (over: Partial<FinanceJob>): FinanceJob => ({
  userId: 'u',
  status: 'done',
  modelTier: 'standard',
  apiCostUsd: 0.1,
  actualCredits: 2000,
  createdAt: new Date('2026-10-05T00:00:00Z'),
  ...over,
});

describe('computeFinance', () => {
  it('is all zeros / nulls with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.arpuEur).toBeNull();
    expect(r.monthToDate.grossMargin).toBeNull();
    expect(r.costUsdPer1kCredits).toBeNull();
  });

  it('sums MRR over live subscriptions only', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'trialing' },
        { userId: 'c', planId: 'ultra', status: 'canceled' },
        { userId: 'd', planId: 'gone', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBe(44.98);
    expect(r.byPlan).toEqual({ starter: 1, pro: 1 });
    expect(r.arpuEur).toBe(22.49);
    expect(r.netMrrUsd).toBeGreaterThan(0);
    expect(r.netMrrUsd).toBeLessThan(44.98 * 1.08);
  });

  it('splits cost per done video by tier and counts failed spend as waste', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      jobs: [
        job({ apiCostUsd: 0.1 }),
        job({ apiCostUsd: 0.3 }),
        job({ modelTier: 'premium', apiCostUsd: 1.2, actualCredits: 26_000 }),
        job({ status: 'failed', apiCostUsd: 0.05 }),
        job({ createdAt: new Date('2026-09-20T00:00:00Z'), apiCostUsd: 9 }),
      ],
    });
    expect(r.costPerDoneVideo.standard).toEqual({
      videos: 3,
      avgCostUsd: 3.1333,
      avgCredits: 2000,
    });
    expect(r.costPerDoneVideo.premium?.avgCostUsd).toBe(1.2);
    expect(r.monthToDate.jobs).toBe(4);
    expect(r.monthToDate.apiSpendUsd).toBe(1.65);
    expect(r.monthToDate.wastedSpendUsd).toBe(0.05);
    expect(r.monthToDate.grossMargin).toBeLessThan(1);
  });
});
