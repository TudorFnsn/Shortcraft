import { describe, expect, it } from 'vitest';
import { computeUnitEconomics } from '@/features/metrics/unit-economics';

describe('computeUnitEconomics', () => {
  it('sums MRR net of VAT from active plans only', () => {
    const r = computeUnitEconomics(
      [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'ultra', status: 'canceled' },
      ],
      [],
    );
    expect(r.activeSubscribers).toBe(2);
    expect(r.mrrNetEur).toBeCloseTo((14.99 + 29.99) / 1.2, 5);
  });

  it('averages done jobs per tier and counts failures separately', () => {
    const job = (status: string, cost: number) => ({
      status,
      modelTier: 'standard',
      targetDurationSec: 30,
      actualCredits: 3000,
      apiCostUsd: cost,
    });
    const r = computeUnitEconomics([], [job('done', 0.1), job('done', 0.3), job('failed', 0.2)]);
    expect(r.tiers.standard?.videos).toBe(2);
    expect(r.tiers.standard?.avgCostUsd).toBeCloseTo(0.2);
    expect(r.tiers.standard?.costPer1kCredits).toBeCloseTo(0.0667, 3);
    expect(r.failedJobs).toBe(1);
    expect(r.failedCostUsd).toBeCloseTo(0.2);
  });
});
