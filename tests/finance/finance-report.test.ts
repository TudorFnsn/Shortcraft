import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, netUsdFromEurCents } from '@/features/finance/finance-report';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

const NOW = new Date('2026-10-14T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const base = { now: NOW, subscriptions: [], topUps: [], jobs: [], fixedCosts: [] };

describe('computeFinance', () => {
  it('is all zeros / n/a with no data', () => {
    const r = computeFinance(base);
    expect(r.mrrNetUsd).toBe(0);
    expect(r.mrrRatio).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.arpuNetUsd).toBeNull();
    expect(r.monthlyProfitUsd).toBe(0);
  });

  it('counts only live subscriptions on plans we sell', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'starter', status: 'past_due' },
        { planId: 'nope', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.planMix).toEqual({ pro: 1, starter: 1 });
    expect(r.mrrGrossEur).toBeCloseTo(44.98, 2);
    const expected =
      netUsdFromEurCents(2999, REVENUE_ASSUMPTIONS) + netUsdFromEurCents(1499, REVENUE_ASSUMPTIONS);
    expect(r.mrrNetUsd).toBeCloseTo(expected, 6);
    expect(r.arrNetUsd).toBeCloseTo(expected * 12, 6);
  });

  it('removes VAT and Stripe fees from revenue', () => {
    // €29.99 / 1.2 = 24.99 − (0.45 + 0.25) = 24.29 EUR → × 1.08
    expect(netUsdFromEurCents(2999, REVENUE_ASSUMPTIONS)).toBeCloseTo(26.23, 1);
  });

  it('prices top-ups by pack and ignores old or unknown ones', () => {
    const r = computeFinance({
      ...base,
      topUps: [
        { credits: 20_000, createdAt: daysAgo(3) },
        { credits: 20_000, createdAt: daysAgo(45) },
        { credits: 12_345, createdAt: daysAgo(1) },
      ],
    });
    expect(r.topUpNetUsd30d).toBeCloseTo(netUsdFromEurCents(1200, REVENUE_ASSUMPTIONS), 6);
  });

  it('computes cost, ratios and margin with known and unknown fixed costs', () => {
    const job = (over: Partial<Parameters<typeof computeFinance>[0]['jobs'][number]>) => ({
      status: 'done',
      createdAt: daysAgo(2),
      modelTier: 'standard',
      actualCredits: 2000,
      apiCostUsd: 0.05,
      ...over,
    });
    const r = computeFinance({
      ...base,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        job({}),
        job({ status: 'failed', apiCostUsd: 0.5, actualCredits: 0 }),
        job({ modelTier: 'premium', apiCostUsd: 2, actualCredits: 26_504 }),
        job({ createdAt: daysAgo(40), apiCostUsd: 99 }),
      ],
      fixedCosts: [
        { id: 'a', label: 'A', usdPerMonth: 10, note: '' },
        { id: 'b', label: 'B', usdPerMonth: null, note: '' },
      ],
    });
    expect(r.apiCostUsd30d).toBeCloseTo(2.55, 6);
    expect(r.failedJobCostUsd30d).toBeCloseTo(0.5, 6);
    expect(r.fixedCostsKnownUsd).toBe(10);
    expect(r.fixedCostsUnknown).toEqual(['B']);
    expect(r.totalCostUsd30d).toBeCloseTo(12.55, 6);
    expect(r.mrrRatio).toBeCloseTo(r.mrrNetUsd / 12.55, 6);
    expect(r.grossMargin).toBeCloseTo((r.mrrNetUsd - 2.55) / r.mrrNetUsd, 6);
    expect(r.monthlyProfitUsd).toBeCloseTo(r.mrrNetUsd - 12.55, 6);
    const std = r.tiers.find((t) => t.tier === 'standard');
    expect(std?.jobs).toBe(2);
    expect(std?.doneJobs).toBe(1);
    expect(std?.costPerVideoUsd).toBeCloseTo(0.55, 6);
    expect(r.tiers.find((t) => t.tier === 'premium')?.costPer1kCredits).toBeCloseTo(
      (2 / 26_504) * 1000,
      6,
    );
  });
});
