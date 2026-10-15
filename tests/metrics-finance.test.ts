import { describe, expect, it } from 'vitest';
import { computeFinance } from '@/features/metrics/finance';

const now = new Date('2026-10-15T00:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('computeFinance', () => {
  const report = computeFinance({
    now,
    subscriptions: [
      { planId: 'starter', status: 'active' },
      { planId: 'pro', status: 'trialing' },
      { planId: 'pro', status: 'canceled' },
      { planId: 'bogus', status: 'active' },
    ],
    jobs: [
      { status: 'done', modelTier: 'standard', apiCostUsd: 0.1, createdAt: day(1) },
      { status: 'done', modelTier: 'standard', apiCostUsd: 0.3, createdAt: day(2) },
      { status: 'failed', modelTier: 'premium', apiCostUsd: 0.5, createdAt: day(3) },
      { status: 'done', modelTier: 'premium', apiCostUsd: 9, createdAt: day(40) },
    ],
    fixed: { monthlyUsd: { vercel: 1, supabase: 2 } },
  });

  it('counts only live subscriptions on sold plans', () => {
    expect(report.payingSubscribers).toBe(2);
    expect(report.mrrEur).toBeCloseTo(14.99 + 29.99, 2);
  });

  it('uses only the last 30 days of jobs and splits cost by tier', () => {
    expect(report.apiCost30dUsd).toBeCloseTo(0.9, 6);
    expect(report.wastedOnFailedUsd).toBeCloseTo(0.5, 6);
    const standard = report.tiers.find((t) => t.tier === 'standard');
    expect(standard?.costPerDoneVideoUsd).toBeCloseTo(0.2, 6);
    expect(report.tiers.find((t) => t.tier === 'premium')?.costPerDoneVideoUsd).toBeNull();
  });

  it('nets fees and VAT, and subtracts costs for contribution', () => {
    expect(report.netMrrUsd).toBeLessThan(report.mrrUsd);
    expect(report.fixedCostsUsd).toBe(3);
    expect(report.contributionUsd).toBeCloseTo(report.netMrrUsd - 0.9 - 3, 6);
  });

  it('has no coverage ratio when there are no costs', () => {
    expect(computeFinance({ now, subscriptions: [], jobs: [] }).coverage).toBeNull();
  });
});
