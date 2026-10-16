import { describe, expect, it } from 'vitest';
import { computeFinance, netUsdFromGrossEur } from '@/features/finance/unit-economics';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

describe('netUsdFromGrossEur', () => {
  it('strips VAT then the Stripe fee', () => {
    // 14.99 / 1.2 = 12.4917; fee 0.2249 + 0.25 = 0.4749; (12.4917 - 0.4749) * 1.08
    expect(netUsdFromGrossEur(14.99, REVENUE_ASSUMPTIONS)).toBeCloseTo(12.98, 1);
  });
});

describe('computeFinance', () => {
  it('is all zeros / nulls with no data', () => {
    const r = computeFinance({ subs: [], jobs: [] });
    expect(r.mrrEur).toBe(0);
    expect(r.arpuEur).toBeNull();
    expect(r.tiers.standard.avgCostPerVideoUsd).toBeNull();
    expect(r.fixedCostCoverage).toBeNull();
  });

  it('sums MRR over live subscriptions only', () => {
    const r = computeFinance({
      subs: [
        { planId: 'starter', live: true },
        { planId: 'pro', live: true },
        { planId: 'ultra', live: false },
        { planId: 'unknown', live: true },
      ],
      jobs: [],
    });
    expect(r.payingSubscribers).toBe(3);
    expect(r.mrrEur).toBe(44.98);
    expect(r.arrEur).toBe(539.76);
  });

  it('averages cost per finished video by tier and counts failed jobs as cost only', () => {
    const r = computeFinance({
      subs: [],
      jobs: [
        { status: 'done', modelTier: 'standard', apiCostUsd: 0.1, chargedCredits: 2000 },
        { status: 'done', modelTier: 'standard', apiCostUsd: 0.3, chargedCredits: 3000 },
        { status: 'done', modelTier: 'premium', apiCostUsd: 2, chargedCredits: 26000 },
        { status: 'failed', modelTier: 'standard', apiCostUsd: 5, chargedCredits: 0 },
      ],
      fixedCostsUsd: 40,
    });
    expect(r.tiers.standard.videos).toBe(2);
    expect(r.tiers.standard.avgCostPerVideoUsd).toBe(0.2);
    expect(r.tiers.standard.avgChargedCredits).toBe(2500);
    expect(r.tiers.premium.avgCostPerVideoUsd).toBe(2);
    expect(r.apiCostUsd).toBe(7.4);
    expect(r.failedCostUsd).toBe(5);
    expect(r.fixedCostCoverage).toBe(0);
  });
});
