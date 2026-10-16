import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceJob } from '@/features/metrics/finance';

const NOW = new Date('2026-10-16T06:00:00Z');
const day = 86_400_000;
const job = (over: Partial<FinanceJob> = {}): FinanceJob => ({
  status: 'done',
  modelTier: 'standard',
  targetDurationSec: 15,
  actualCredits: 2000,
  apiCostUsd: 0.07,
  createdAt: new Date(NOW.getTime() - day),
  ...over,
});

describe('computeFinance', () => {
  it('is all zeros and null ratios with no data', () => {
    const r = computeFinance({ subscriptions: [], jobs: [], now: NOW });
    expect(r.mrrGrossEur).toBe(0);
    expect(r.grossMarginMonthly.marginPct).toBeNull();
    expect(r.apiCostShareOfMrr).toBeNull();
    expect(r.realizedMarkup).toBeNull();
    expect(r.byTier).toEqual([]);
  });

  it('counts only live subscriptions on sold plans toward MRR', () => {
    const r = computeFinance({
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'enterprise', status: 'active' },
      ],
      jobs: [],
      now: NOW,
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1, ultra: 0 });
    expect(r.mrrGrossEur).toBe(44.98);
    expect(r.arrNetUsd).toBeCloseTo(r.mrrNetUsd * 12, 0);
  });

  it('separates done-job cost per tier from failed-job waste and ignores old jobs', () => {
    const r = computeFinance({
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        job(),
        job({ apiCostUsd: 0.09 }),
        job({ modelTier: 'premium', apiCostUsd: 1.1, actualCredits: 26_504 }),
        job({ status: 'failed', apiCostUsd: 0.02 }),
        job({ createdAt: new Date(NOW.getTime() - 60 * day), apiCostUsd: 50 }),
      ],
      now: NOW,
    });
    expect(r.videosDone).toBe(3);
    expect(r.videosFailed).toBe(1);
    expect(r.failedCostUsd).toBe(0.02);
    expect(r.byTier.map((t) => t.tier)).toEqual(['premium', 'standard']);
    expect(r.byTier[1]).toMatchObject({ videos: 2, avgCostUsd: 0.08, avgCredits: 2000 });
    expect(r.totalApiCostUsd).toBe(1.28);
    expect(r.grossMarginMonthly.marginPct).toBeGreaterThan(90);
  });

  it('scales a short window to a month', () => {
    const r = computeFinance({
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [job({ apiCostUsd: 1 })],
      now: NOW,
      windowDays: 10,
    });
    expect(r.grossMarginMonthly.apiCostUsd).toBe(3);
  });
});
