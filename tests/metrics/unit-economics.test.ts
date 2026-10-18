import { describe, expect, it } from 'vitest';
import {
  computeUnitEconomics,
  netUsdOfGrossEur,
  type EconInput,
  type EconJob,
} from '@/features/metrics/unit-economics';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

const NOW = new Date('2026-10-18T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const base: EconInput = { now: NOW, subscriptions: [], jobs: [], fixedMonthlyUsd: 0 };
const job = (over: Partial<EconJob>): EconJob => ({
  status: 'done',
  modelTier: 'standard',
  targetDurationSec: 15,
  actualCredits: 2000,
  apiCostUsd: 0.1,
  createdAt: daysAgo(1),
  ...over,
});

describe('netUsdOfGrossEur', () => {
  it('removes VAT and Stripe fees, then converts to USD', () => {
    // 14.99 / 1.2 = 12.4917; fee = 0.2249 + 0.25 → 12.0168 EUR × 1.08
    expect(netUsdOfGrossEur(14.99, REVENUE_ASSUMPTIONS)).toBeCloseTo(12.98, 1);
  });
});

describe('computeUnitEconomics', () => {
  it('has no margin rate without revenue', () => {
    const r = computeUnitEconomics({ ...base, jobs: [job({})] });
    expect(r.payingSubscribers).toBe(0);
    expect(r.grossMarginRate).toBeNull();
    expect(r.contributionUsd).toBe(-0.1);
  });

  it('counts only live subscriptions on plans we sell', () => {
    const r = computeUnitEconomics({
      ...base,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'nope', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(1);
    expect(r.mrrGrossEur).toBe(29.99);
  });

  it('only prices jobs from the last 30 days and reports failed-job waste', () => {
    const r = computeUnitEconomics({
      ...base,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      fixedMonthlyUsd: 5,
      jobs: [
        job({ apiCostUsd: 1 }),
        job({ status: 'failed', apiCostUsd: 0.5 }),
        job({ apiCostUsd: 9, createdAt: daysAgo(45) }),
      ],
    });
    expect(r.variableCostUsd30d).toBe(1.5);
    expect(r.failedCostUsd30d).toBe(0.5);
    expect(r.videos30d).toBe(1);
    expect(r.contributionUsd).toBeCloseTo(r.mrrNetUsd - 1.5 - 5, 1);
  });

  it('breaks finished videos down by tier', () => {
    const r = computeUnitEconomics({
      ...base,
      jobs: [
        job({ modelTier: 'premium', apiCostUsd: 1.1, actualCredits: 26_000 }),
        job({ modelTier: 'standard', apiCostUsd: 0.07, actualCredits: 2000 }),
        job({ modelTier: 'standard', apiCostUsd: 0.09, actualCredits: 2000 }),
      ],
    });
    expect(r.byTier.map((t) => t.tier)).toEqual(['premium', 'standard']);
    expect(r.byTier[1]).toMatchObject({ videos: 2, avgCostUsd: 0.08, costPer1kCredits: 0.04 });
  });
});
