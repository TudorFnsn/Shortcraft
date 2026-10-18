import { describe, expect, it } from 'vitest';
import { computeFinance } from '@/features/metrics/finance';

describe('computeFinance', () => {
  it('sums MRR of live subscriptions only and averages cost per finished video', () => {
    const r = computeFinance(
      [
        { plan_id: 'starter', status: 'active' },
        { plan_id: 'pro', status: 'canceled' },
        { plan_id: 'pro', status: 'trialing' },
      ],
      [
        {
          status: 'done',
          model_tier: 'standard',
          target_duration_sec: 15,
          actual_credits: 2000,
          api_cost_usd: 0.1,
        },
        {
          status: 'done',
          model_tier: 'premium',
          target_duration_sec: 15,
          actual_credits: 20000,
          api_cost_usd: 1.1,
        },
        {
          status: 'failed',
          model_tier: 'standard',
          target_duration_sec: 15,
          actual_credits: 0,
          api_cost_usd: 0.04,
        },
      ],
    );
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBeCloseTo(44.98, 2);
    expect(r.doneJobs).toBe(2);
    expect(r.failedJobs).toBe(1);
    expect(r.avgCostPerDoneVideoUsd).toBeCloseTo(0.6, 5);
    expect(r.byTier['premium']?.apiCostUsd).toBeCloseTo(1.1, 5);
    expect(r.apiCostShareOfNetMrr).toBeGreaterThan(0);
  });

  it('is safe with no data', () => {
    const r = computeFinance([], []);
    expect(r.mrrEur).toBe(0);
    expect(r.apiCostShareOfNetMrr).toBeNull();
    expect(r.costPer1kCreditsUsd).toBe(0);
  });
});
