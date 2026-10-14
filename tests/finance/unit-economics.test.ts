import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceJob } from '@/features/finance/unit-economics';

const NOW = new Date('2026-10-14T06:00:00Z');
const job = (o: Partial<FinanceJob> & { daysAgo?: number }): FinanceJob => ({
  status: 'done',
  modelTier: 'standard',
  createdAt: new Date(NOW.getTime() - (o.daysAgo ?? 1) * DAY_MS),
  apiCostUsd: 0.07,
  chargedCredits: 2024,
  ...o,
});

describe('computeFinance', () => {
  it('is all zeros with no data', () => {
    const r = computeFinance({ now: NOW, livePlans: [], jobs: [] });
    expect(r.mrrCents).toBe(0);
    expect(r.marginMultiple).toBeNull();
    expect(r.byTier).toEqual([]);
  });

  it('sums MRR from list prices', () => {
    const r = computeFinance({ now: NOW, livePlans: ['starter', 'pro'], jobs: [] });
    expect(r.mrrCents).toBe(1499 + 2999);
    expect(r.netMrrUsd).toBeGreaterThan(0);
  });

  it('counts only the trailing 30 days and splits failed cost out', () => {
    const r = computeFinance({
      now: NOW,
      livePlans: ['pro'],
      fixedMonthlyUsd: 10,
      jobs: [
        job({}),
        job({ status: 'failed', apiCostUsd: 0.5 }),
        job({ daysAgo: 45, apiCostUsd: 99 }),
      ],
    });
    expect(r.apiCost30dUsd).toBe(0.57);
    expect(r.failedCost30dUsd).toBe(0.5);
    expect(r.byTier).toEqual([
      { tier: 'standard', videos: 1, apiCostUsd: 0.07, avgCostUsd: 0.07, avgCredits: 2024 },
    ]);
    expect(r.grossProfit30dUsd).toBeCloseTo(r.netMrrUsd - 0.57 - 10, 1);
    expect(r.marginMultiple).toBeGreaterThan(1);
  });
});
