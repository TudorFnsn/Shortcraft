import { describe, expect, it } from 'vitest';
import { computeFinops, DAY_MS, type FinJob } from '@/features/metrics/finops';

const NOW = new Date('2026-10-15T06:00:00Z');
const job = (over: Partial<FinJob>): FinJob => ({
  status: 'done',
  modelTier: 'standard',
  createdAt: new Date(NOW.getTime() - DAY_MS),
  actualCredits: 2000,
  apiCostUsd: 0.07,
  ...over,
});

describe('computeFinops', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinops({ now: NOW, subscriptions: [], jobs: [] });
    expect(r.mrrEur).toBe(0);
    expect(r.arpuEur).toBeNull();
    expect(r.revenueToApiCost).toBeNull();
    expect(r.monthlyCashUsd).toBe(0);
  });

  it('counts only live subscriptions on sold plans toward MRR', () => {
    const r = computeFinops({
      now: NOW,
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'active' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'legacy', status: 'active' },
      ],
      jobs: [],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBe(44.98);
    expect(r.arpuEur).toBe(22.49);
  });

  it('aggregates 30-day API cost by tier and ignores older jobs', () => {
    const r = computeFinops({
      now: NOW,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        job({}),
        job({ modelTier: 'premium', actualCredits: 26_000, apiCostUsd: 1.1 }),
        job({ status: 'failed', apiCostUsd: 0.04 }),
        job({ createdAt: new Date(NOW.getTime() - 40 * DAY_MS), apiCostUsd: 9 }),
      ],
      fixedMonthlyCostsUsd: 20,
    });
    expect(r.last30d.doneJobs).toBe(2);
    expect(r.last30d.failedJobs).toBe(1);
    expect(r.last30d.apiCostUsd).toBe(1.21);
    expect(r.last30d.byTier.find((t) => t.tier === 'premium')?.avgCostUsd).toBe(1.1);
    expect(r.monthlyCashUsd).toBe(Math.round((r.netMrrUsd - 1.21 - 20) * 100) / 100);
    expect(r.revenueToApiCost).toBeGreaterThan(1);
  });
});
