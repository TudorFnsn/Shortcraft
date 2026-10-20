import { describe, expect, it } from 'vitest';
import { PLANS } from '@/config/plans';
import {
  computeFinance,
  netUsdPerCredit,
  type FinanceInput,
} from '@/features/finance/unit-economics';

const NOW = new Date('2026-10-20T06:00:00Z');
const SINCE = new Date('2026-09-20T00:00:00Z');
const job = (o: Partial<FinanceInput['jobs'][number]> = {}): FinanceInput['jobs'][number] => ({
  status: 'done',
  modelTier: 'standard',
  targetDurationSec: 15,
  chargedCredits: 2000,
  apiCostUsd: 0.04,
  createdAt: NOW,
  ...o,
});
const base: FinanceInput = {
  jobs: [],
  subscriptions: [],
  topUpRevenueCents: 0,
  since: SINCE,
  eurUsd: 1.08,
};

describe('computeFinance', () => {
  it('is all zeros and n/a with no data', () => {
    const r = computeFinance(base);
    expect(r.mrrEur).toBe(0);
    expect(r.grossMargin).toBeNull();
    expect(r.tiers).toEqual([]);
  });

  it('sums MRR over live subscriptions on plans we sell only', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'ultra', status: 'canceled' },
        { planId: 'legacy', status: 'active' },
      ],
    });
    expect(r.liveSubscribers).toBe(2);
    expect(r.mrrEur).toBeCloseTo(14.99 + 29.99, 6);
    expect(r.mrrUsd).toBeCloseTo((14.99 + 29.99) * 1.08, 6);
  });

  it('counts failed-job spend as cost but not as revenue, and ignores jobs before the window', () => {
    const r = computeFinance({
      ...base,
      jobs: [
        job(),
        job({ status: 'failed', chargedCredits: 0, apiCostUsd: 0.5 }),
        job({ createdAt: new Date('2026-08-01T00:00:00Z'), apiCostUsd: 99 }),
      ],
    });
    expect(r.jobsInWindow).toBe(2);
    expect(r.failedJobs).toBe(1);
    expect(r.failedCostUsd).toBeCloseTo(0.5, 6);
    expect(r.variableCostUsd).toBeCloseTo(0.54, 6);
    const floor = Math.min(...Object.values(PLANS).map((p) => netUsdPerCredit(p.id, 1.08)));
    expect(r.earnedRevenueUsd).toBeCloseTo(2000 * floor, 6);
    expect(r.grossMargin).toBeCloseTo((2000 * floor - 0.54) / (2000 * floor), 6);
  });

  it('averages per tier on finished videos', () => {
    const r = computeFinance({
      ...base,
      jobs: [
        job({ apiCostUsd: 0.04 }),
        job({ apiCostUsd: 0.06 }),
        job({
          modelTier: 'premium',
          apiCostUsd: 1.9,
          targetDurationSec: 30,
          chargedCredits: 42000,
        }),
      ],
    });
    expect(r.tiers.map((t) => t.tier)).toEqual(['premium', 'standard']);
    const std = r.tiers.find((t) => t.tier === 'standard');
    expect(std?.avgCostUsd).toBeCloseTo(0.05, 6);
    expect(std?.costPerSecondUsd).toBeCloseTo(0.1 / 30, 6);
    expect(r.tiers.find((t) => t.tier === 'premium')?.avgCredits).toBe(42000);
  });

  it('reports unknown fixed costs instead of guessing them', () => {
    expect(computeFinance(base).unknownFixedCosts).toContain('ElevenLabs plan');
  });
});

describe('netUsdPerCredit', () => {
  it('is lowest on the plan with the lowest revenue per credit', () => {
    expect(netUsdPerCredit('pro', 1.08)).toBeLessThan(netUsdPerCredit('starter', 1.08));
  });
});
