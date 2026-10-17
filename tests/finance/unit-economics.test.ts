import { describe, expect, it } from 'vitest';
import { PLANS } from '@/config/plans';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';
import {
  computeFinance,
  DAY_MS,
  netUsdFromEurCents,
  type FinanceInput,
} from '@/features/finance/unit-economics';

const NOW = new Date('2026-10-17T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = {
  now: NOW,
  subscriptions: [],
  jobs: [],
  oneOffRevenueEurCents: 0,
  fixedCosts: [],
};

describe('netUsdFromEurCents', () => {
  it('removes VAT, then the Stripe fee, then converts to USD', () => {
    const a = REVENUE_ASSUMPTIONS;
    const gross = PLANS.pro.priceCents / 100;
    const expected =
      (gross / (1 + a.vatRate) - (gross * a.stripePercentFee + a.stripeFixedFeeEur)) * a.usdPerEur;
    expect(netUsdFromEurCents(PLANS.pro.priceCents, a)).toBeCloseTo(expected, 6);
  });
});

describe('computeFinance', () => {
  it('returns zeros and n/a ratios with no data', () => {
    const r = computeFinance(empty);
    expect(r.netMrrUsd).toBe(0);
    expect(r.payingSubscribers).toBe(0);
    expect(r.coverage).toBeNull();
    expect(r.apiShareOfMrr).toBeNull();
    expect(r.costPerFinishedVideoUsd).toBeNull();
  });

  it('counts only live subscriptions on plans we sell', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'starter', status: 'trialing' },
        { planId: 'ghost', status: 'active' },
      ],
    });
    expect(r.byPlan).toEqual({ starter: 1, pro: 1, ultra: 0 });
    expect(r.grossMrrEur).toBeCloseTo((PLANS.pro.priceCents + PLANS.starter.priceCents) / 100, 2);
  });

  it('costs only jobs inside the window and separates failed spend', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ planId: 'ultra', status: 'active' }],
      jobs: [
        {
          status: 'done',
          modelTier: 'standard',
          createdAt: daysAgo(2),
          apiCostUsd: 0.1,
          actualCredits: 2000,
        },
        {
          status: 'done',
          modelTier: 'premium',
          createdAt: daysAgo(3),
          apiCostUsd: 2,
          actualCredits: 26000,
        },
        {
          status: 'failed',
          modelTier: 'premium',
          createdAt: daysAgo(4),
          apiCostUsd: 0.5,
          actualCredits: 0,
        },
        {
          status: 'done',
          modelTier: 'standard',
          createdAt: daysAgo(45),
          apiCostUsd: 9,
          actualCredits: 1,
        },
      ],
    });
    expect(r.apiCostUsd).toBe(2.6);
    expect(r.wastedApiCostUsd).toBe(0.5);
    expect(r.finishedVideos).toBe(2);
    expect(r.failedVideos).toBe(1);
    expect(r.costPerFinishedVideoUsd).toBe(1.05);
    expect(r.tiers.find((t) => t.tier === 'standard')?.usdPerThousandCredits).toBe(0.05);
  });

  it('scales fixed costs to the window and reports coverage', () => {
    const r = computeFinance({
      ...empty,
      windowDays: 15,
      subscriptions: [{ planId: 'ultra', status: 'active' }],
      fixedCosts: [{ name: 'Hosting', usdPerMonth: 20 }],
    });
    expect(r.fixedCostUsd).toBe(10);
    expect(r.burnUsd).toBe(10);
    expect(r.coverage).toBeGreaterThan(0);
    expect(r.contributionUsd).toBeCloseTo(r.netMrrUsd / 2 - 10, 1);
  });
});
