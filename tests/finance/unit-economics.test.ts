import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceInput } from '@/features/finance/unit-economics';

const NOW = new Date('2026-10-19T06:00:00Z');
const base: FinanceInput = {
  now: NOW,
  jobs: [],
  subscriptions: [],
  paidCreditsGranted: 0,
  topUpGrossCents: 0,
  fixedMonthlyCostUsd: 0,
  windowDays: 30,
};
const job = (over: Partial<FinanceInput['jobs'][number]> = {}) => ({
  status: 'done',
  modelTier: 'standard',
  targetDurationSec: 15,
  actualCredits: 2000,
  apiCostUsd: 0.1,
  createdAt: new Date(NOW.getTime() - DAY_MS),
  ...over,
});

describe('computeFinance', () => {
  it('is all zeros with no data', () => {
    const r = computeFinance(base);
    expect(r.mrrGrossCents).toBe(0);
    expect(r.apiCostShareOfMrr).toBeNull();
    expect(r.breakEvenSubscribers).toBeNull();
    expect(r.tiers).toEqual([]);
  });

  it('sums MRR from live subscriptions only, at list price', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'ghost', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrGrossCents).toBe(1499 + 2999);
    expect(r.mrrNetUsd).toBeGreaterThan(0);
    expect(r.mrrNetUsd).toBeLessThan((r.mrrGrossCents / 100) * 1.08);
  });

  it('ignores jobs outside the window and counts failed spend separately', () => {
    const r = computeFinance({
      ...base,
      windowDays: 7,
      jobs: [
        job(),
        job({ status: 'failed', apiCostUsd: 0.5 }),
        job({ createdAt: new Date(NOW.getTime() - 20 * DAY_MS), apiCostUsd: 9 }),
      ],
    });
    expect(r.apiCostUsd).toBeCloseTo(0.6);
    expect(r.failedCostUsd).toBeCloseTo(0.5);
    expect(r.apiCostPer30dUsd).toBeCloseTo((0.6 / 7) * 30);
  });

  it('computes per-tier cost per video and per 1k credits from finished jobs', () => {
    const r = computeFinance({
      ...base,
      jobs: [
        job({ apiCostUsd: 0.1, actualCredits: 2000 }),
        job({ apiCostUsd: 0.3, actualCredits: 2000 }),
        job({ modelTier: 'premium', apiCostUsd: 2, actualCredits: 20_000 }),
      ],
    });
    const std = r.tiers.find((t) => t.tier === 'standard');
    expect(std?.avgCostPerVideoUsd).toBeCloseTo(0.2);
    expect(std?.costPer1kCreditsUsd).toBeCloseTo(0.1);
    expect(r.tiers.find((t) => t.tier === 'premium')?.videos).toBe(1);
  });

  it('derives contribution and break-even subscribers', () => {
    const r = computeFinance({
      ...base,
      fixedMonthlyCostUsd: 100,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [job({ apiCostUsd: 3 })],
    });
    expect(r.monthlyContributionUsd).toBeCloseTo(r.mrrNetUsd - (3 / 30) * 30 - 100);
    expect(r.breakEvenSubscribers).toBeGreaterThan(1);
    expect(r.apiCostShareOfMrr).toBeGreaterThan(0);
  });
});
