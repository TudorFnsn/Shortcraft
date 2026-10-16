import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceInput } from '@/features/finance/unit-economics';
import { netRevenueUsd } from '@/features/billing/margin';
import { PLANS } from '@/config/plans';

const NOW = new Date('2026-10-16T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = {
  now: NOW,
  jobs: [],
  subscriptions: [],
  topUps: [],
  fixedCostsUsdPerMonth: {},
};
const job = (over: Partial<FinanceInput['jobs'][number]> = {}) => ({
  status: 'done',
  modelTier: 'standard',
  createdAt: daysAgo(1),
  apiCostUsd: 0.1,
  actualCredits: 2000,
  ...over,
});

describe('computeFinance', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrNetUsd).toBe(0);
    expect(r.grossMarginRatio).toBeNull();
    expect(r.failureRate).toBeNull();
    expect(r.arpuNetUsd).toBeNull();
  });

  it('counts only live subscriptions of sold plans toward MRR', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'ghost', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(1);
    expect(r.mrrGrossEur).toBe(PLANS.starter.priceCents / 100);
    expect(r.mrrNetUsd).toBeCloseTo(netRevenueUsd(PLANS.starter.priceCents), 2);
  });

  it('prices top-ups from the matching pack and ignores unknown sizes', () => {
    const r = computeFinance({
      ...empty,
      topUps: [
        { credits: 20_000, createdAt: daysAgo(2) },
        { credits: 12_345, createdAt: daysAgo(2) },
        { credits: 20_000, createdAt: daysAgo(90) },
      ],
    });
    expect(r.topUpRevenueNetUsd).toBeCloseTo(netRevenueUsd(1200), 2);
  });

  it('measures cost per finished video by tier and the waste on failed jobs', () => {
    const r = computeFinance({
      ...empty,
      jobs: [
        job({ apiCostUsd: 0.1 }),
        job({ apiCostUsd: 0.3 }),
        job({ modelTier: 'premium', apiCostUsd: 1.5, actualCredits: 26_000 }),
        job({ status: 'failed', apiCostUsd: 0.4 }),
        job({ apiCostUsd: 9, createdAt: daysAgo(60) }),
      ],
    });
    expect(r.variableCostUsd).toBeCloseTo(2.3, 2);
    expect(r.wastedOnFailedUsd).toBeCloseTo(0.4, 2);
    expect(r.failureRate).toBeCloseTo(0.25, 5);
    const std = r.perTier.find((t) => t.tier === 'standard');
    expect(std?.finished).toBe(2);
    expect(std?.avgCostPerVideoUsd).toBeCloseTo(0.2, 5);
    expect(r.perTier.find((t) => t.tier === 'premium')?.creditsPerVideo).toBe(26_000);
  });

  it('flags unknown fixed costs instead of assuming zero, and computes margin', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [job({ apiCostUsd: 2 })],
      fixedCostsUsdPerMonth: { vercel: 20, elevenlabs: null },
    });
    expect(r.fixedCostsUnknown).toEqual(['elevenlabs']);
    expect(r.fixedCostsKnownUsd).toBe(20);
    const rev = netRevenueUsd(PLANS.pro.priceCents);
    expect(r.monthlyProfitUsd).toBeCloseTo(rev - 2 - 20, 1);
    expect(r.grossMarginRatio).toBeCloseTo((rev - 22) / rev, 2);
    expect(r.apiCostShare).toBeCloseTo(2 / rev, 2);
  });
});
