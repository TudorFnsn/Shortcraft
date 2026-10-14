import { describe, expect, it } from 'vitest';
import { computeFinance } from '@/features/metrics/finance';

const now = new Date('2026-10-14T12:00:00Z');
const job = (status: string, apiCostUsd: number, daysAgo: number) => ({
  status,
  apiCostUsd,
  createdAt: new Date(now.getTime() - daysAgo * 86_400_000),
});

describe('computeFinance', () => {
  it('sums MRR over live subscriptions on sold plans only', () => {
    const r = computeFinance({
      subs: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'ghost', status: 'active' },
      ],
      jobs: [],
      now,
    });
    expect(r.liveSubscribers).toBe(2);
    expect(r.mrrEur).toBeCloseTo(44.98);
    expect(r.netMrrUsd).toBeGreaterThan(0);
    expect(r.netMrrUsd).toBeLessThan(44.98 * 1.08);
    expect(r.grossMargin).toBe(1);
  });

  it('counts only the last 30 days and splits out failed-job waste', () => {
    const r = computeFinance({
      subs: [{ planId: 'pro', status: 'active' }],
      jobs: [job('done', 1, 1), job('done', 3, 29), job('failed', 0.5, 2), job('done', 99, 45)],
      now,
    });
    expect(r.apiSpend30dUsd).toBeCloseTo(4.5);
    expect(r.wastedOnFailed30dUsd).toBeCloseTo(0.5);
    expect(r.doneVideos30d).toBe(2);
    expect(r.costPerDoneVideoUsd).toBeCloseTo(2);
  });

  it('has no margin without revenue', () => {
    const r = computeFinance({ subs: [], jobs: [job('done', 1, 1)], now });
    expect(r.grossMargin).toBeNull();
  });
});
