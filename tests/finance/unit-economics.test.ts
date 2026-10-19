import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceJob } from '@/features/finance/unit-economics';

const NOW = new Date('2026-10-19T06:00:00Z');
const job = (over: Partial<FinanceJob> = {}): FinanceJob => ({
  status: 'done',
  modelTier: 'standard',
  targetDurationSec: 15,
  apiCostUsd: 0.1,
  actualCredits: 2000,
  createdAt: new Date('2026-10-10T00:00:00Z'),
  ...over,
});

describe('computeFinance', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinance({ now: NOW, windowDays: 30, jobs: [], subscriptions: [] });
    expect(r.mrrNetUsd).toBe(0);
    expect(r.mrrToCost).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.apiCostPerVideoUsd).toBeNull();
    expect(r.tiers).toEqual([]);
  });

  it('counts only live subscriptions in MRR', () => {
    const r = computeFinance({
      now: NOW,
      windowDays: 30,
      jobs: [],
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'starter', status: 'canceled' },
        { planId: 'ghost', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(1);
    expect(r.mrrGrossEur).toBe(29.99);
    expect(r.mrrNetUsd).toBeGreaterThan(0);
  });

  it('separates wasted spend on failed jobs and ignores jobs outside the window', () => {
    const r = computeFinance({
      now: NOW,
      windowDays: 30,
      subscriptions: [],
      jobs: [
        job(),
        job({ status: 'failed', apiCostUsd: 0.3 }),
        job({ createdAt: new Date('2026-08-01T00:00:00Z'), apiCostUsd: 99 }),
      ],
    });
    expect(r.apiCostUsd).toBe(0.4);
    expect(r.wastedApiCostUsd).toBe(0.3);
    expect(r.videosDone).toBe(1);
    expect(r.videosFailed).toBe(1);
  });

  it('computes per-tier cost, per-second cost and realised credit markup', () => {
    const r = computeFinance({
      now: NOW,
      windowDays: 30,
      subscriptions: [],
      jobs: [
        job(),
        job({ apiCostUsd: 0.3 }),
        job({ modelTier: 'premium', apiCostUsd: 1.5, actualCredits: 26_000 }),
      ],
    });
    const std = r.tiers.find((t) => t.tier === 'standard');
    expect(std?.videos).toBe(2);
    expect(std?.avgCostUsd).toBe(0.2);
    expect(std?.avgCostPerSecUsd).toBeCloseTo(0.0133, 4);
    expect(std?.creditsPerUsd).toBe(10_000);
    expect(r.tiers.find((t) => t.tier === 'premium')?.avgCostUsd).toBe(1.5);
  });

  it('puts fixed costs into the MRR-to-cost ratio on a monthly run rate', () => {
    const r = computeFinance({
      now: NOW,
      windowDays: 30,
      jobs: [job({ apiCostUsd: 5 })],
      subscriptions: [{ planId: 'ultra', status: 'active' }],
      fixedCosts: [{ name: 'hosting', usdPerMonth: 20 }],
    });
    expect(r.fixedCostsUsd).toBe(20);
    expect(r.totalCostUsd).toBe(25);
    expect(r.mrrToCost).toBeCloseTo(r.mrrNetUsd / 25, 2);
    expect(r.profitUsd).toBeCloseTo(r.mrrNetUsd - 25, 2);
  });

  it('scales a short window to a 30-day run rate', () => {
    const r = computeFinance({
      now: NOW,
      windowDays: 7,
      jobs: [job({ apiCostUsd: 7, createdAt: new Date('2026-10-17T00:00:00Z') })],
      subscriptions: [{ planId: 'pro', status: 'active' }],
    });
    expect(r.profitUsd).toBeCloseTo(r.mrrNetUsd - (7 * 30) / 7, 2);
  });
});
