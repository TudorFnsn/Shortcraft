import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceJob } from '@/features/metrics/unit-economics';

const now = new Date('2026-10-20T00:00:00Z');
const job = (over: Partial<FinanceJob>): FinanceJob => ({
  status: 'done',
  modelTier: 'standard',
  apiCostUsd: 0.1,
  actualCredits: 2000,
  createdAt: new Date('2026-10-15T00:00:00Z'),
  ...over,
});

describe('computeFinance', () => {
  it('counts only live subscriptions on known plans toward MRR', () => {
    const r = computeFinance({
      now,
      windowDays: 30,
      jobs: [],
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'ghost', status: 'active' },
      ],
      topUpNetUsd: 0,
      fixedCosts: [],
    });
    expect(r.subscribersByPlan).toEqual({ pro: 1 });
    expect(r.mrrNetUsd).toBeGreaterThan(20);
    expect(r.revenueToCost).toBeNull();
  });

  it('averages cost per finished video by tier and keeps failed spend as burn', () => {
    const r = computeFinance({
      now,
      windowDays: 30,
      jobs: [
        job({ apiCostUsd: 0.1 }),
        job({ apiCostUsd: 0.3 }),
        job({ status: 'failed', apiCostUsd: 0.5 }),
        job({ createdAt: new Date('2026-01-01T00:00:00Z'), apiCostUsd: 9 }),
      ],
      subscriptions: [],
      topUpNetUsd: 5,
      fixedCosts: [{ name: 'ElevenLabs', usdPerMonth: 5 }],
    });
    expect(r.tiers).toEqual([
      { tier: 'standard', videos: 2, avgCostUsd: 0.2, avgCredits: 2000, usdPer1kCredits: 0.1 },
    ]);
    expect(r.apiCostUsd).toBe(0.9);
    expect(r.failedApiCostUsd).toBe(0.5);
    expect(r.cashMarginUsd).toBe(-0.9);
  });

  it('scales fixed costs to the window', () => {
    const r = computeFinance({
      now,
      windowDays: 15,
      jobs: [],
      subscriptions: [],
      topUpNetUsd: 0,
      fixedCosts: [{ name: 'x', usdPerMonth: 30 }],
    });
    expect(r.fixedCostUsd).toBe(15);
  });
});
