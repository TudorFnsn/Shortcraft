import { describe, expect, it } from 'vitest';
import { computeFinance, netOfCharge, type FinanceInput } from '@/features/metrics/finance';

const NOW = new Date('2026-10-18T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

const empty: FinanceInput = {
  subscriptions: [],
  jobs: [],
  grants: [],
  fixedCosts: { items: {} },
  now: NOW,
};

describe('computeFinance', () => {
  it('returns zeros and n/a with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrEur).toBe(0);
    expect(r.arpuEur).toBeNull();
    expect(r.realizedMarginMultiple).toBeNull();
    expect(r.breakEvenSubscribers).toBeNull();
  });

  it('sums MRR over live subscriptions only', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'past_due' },
        { userId: 'c', planId: 'ultra', status: 'canceled' },
      ],
    });
    expect(r.mrrEur).toBeCloseTo(14.99 + 29.99, 2);
    expect(r.payingSubscribers).toBe(2);
    expect(r.arpuEur).toBeCloseTo((14.99 + 29.99) / 2, 2);
  });

  it('nets VAT and Stripe fees off a charge', () => {
    expect(netOfCharge(29.99)).toBeCloseTo(29.99 / 1.2 - 29.99 * 0.015 - 0.25, 6);
  });

  it('prices a top-up by its credit amount and counts trial grants', () => {
    const r = computeFinance({
      ...empty,
      grants: [
        { userId: 'a', reason: 'topup', delta: 60_000, createdAt: daysAgo(2) },
        { userId: 'a', reason: 'topup', delta: 60_000, createdAt: daysAgo(90) },
        { userId: 'b', reason: 'trial_grant', delta: 3000, createdAt: daysAgo(1) },
      ],
    });
    expect(r.topUpPacksSold).toBe(1);
    expect(r.topUpRevenueEur).toBe(29);
    expect(r.trialCreditsGranted).toBe(3000);
  });

  it('computes realized cost per tier from finished jobs and counts failed-job spend', () => {
    const job = { userId: 'a', actualCredits: 2000, estimatedCredits: 2100, createdAt: daysAgo(3) };
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      jobs: [
        { ...job, status: 'done', modelTier: 'standard', apiCostUsd: 0.1 },
        { ...job, status: 'done', modelTier: 'standard', apiCostUsd: 0.3 },
        { ...job, status: 'failed', modelTier: 'premium', apiCostUsd: 0.5 },
        { ...job, status: 'done', modelTier: 'standard', apiCostUsd: 9, createdAt: daysAgo(60) },
      ],
    });
    expect(r.apiCostUsd).toBeCloseTo(0.9, 4);
    expect(r.byTier).toEqual([
      {
        tier: 'standard',
        jobs: 2,
        creditsBilled: 4000,
        apiCostUsd: 0.4,
        costPer1kCreditsUsd: 0.1,
        avgCostPerJobUsd: 0.2,
      },
    ]);
    expect(r.realizedMarginMultiple).not.toBeNull();
  });

  it('flags unfilled fixed costs and finds break-even', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: Array.from({ length: 10 }, (_, i) => ({
        userId: `u${i}`,
        planId: 'pro',
        status: 'active',
      })),
      fixedCosts: { items: { vercel: 20, supabase: 25, elevenlabs_plan: null } },
    });
    expect(r.fixedCostsUsd).toBe(45);
    expect(r.missingFixedCosts).toEqual(['elevenlabs_plan']);
    expect(r.breakEvenSubscribers).toBeGreaterThan(0);
    expect(r.breakEvenSubscribers).toBeLessThan(10);
    expect(r.monthlyContributionUsd).toBeGreaterThan(0);
  });
});
