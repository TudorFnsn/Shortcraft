import { describe, expect, it } from 'vitest';
import type { FixedCost } from '@/config/fixed-costs';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';
import {
  computeFinance,
  DAY_MS,
  netUsdOf,
  type FinanceInput,
  type FinanceJob,
} from '@/features/finance/unit-economics';

const NOW = new Date('2026-10-19T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);

const empty: FinanceInput = {
  now: NOW,
  subscriptions: [],
  jobs: [],
  paidGrants: [],
  fixedCosts: [],
};

const job = (over: Partial<FinanceJob>): FinanceJob => ({
  userId: 'u',
  status: 'done',
  modelTier: 'standard',
  createdAt: daysAgo(1),
  apiCostUsd: 0.05,
  chargedCredits: 2000,
  ...over,
});

describe('netUsdOf', () => {
  it('removes VAT and Stripe fees, then converts to USD', () => {
    const a = REVENUE_ASSUMPTIONS;
    const expected =
      (29.99 / (1 + a.vatRate) - 29.99 * a.stripePercentFee - a.stripeFixedFeeEur) * a.usdPerEur;
    expect(netUsdOf(29.99, 1)).toBeCloseTo(expected, 6);
  });

  it('never goes negative', () => {
    expect(netUsdOf(0.1, 1)).toBe(0);
  });
});

describe('computeFinance', () => {
  it('returns zeros and nulls with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrr.payingSubscribers).toBe(0);
    expect(r.mrr.netUsd).toBe(0);
    expect(r.mrr.arpuNetUsd).toBeNull();
    expect(r.apiCost30d.perDoneVideoUsd).toBeNull();
    expect(r.monthly.revenueMultiple).toBeNull();
    expect(r.breakEven.subscribersNeeded).toBeNull();
    expect(r.flags).toContain('No paying subscribers: MRR is zero.');
  });

  it('counts only live subscriptions on sold plans in MRR', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'pro', status: 'active' },
        { userId: 'b', planId: 'starter', status: 'past_due' },
        { userId: 'c', planId: 'ultra', status: 'canceled' },
        { userId: 'd', planId: 'legacy', status: 'active' },
      ],
    });
    expect(r.mrr.payingSubscribers).toBe(2);
    expect(r.mrr.byPlan).toEqual({ starter: 1, pro: 1, ultra: 0 });
    expect(r.mrr.grossEur).toBeCloseTo(14.99 + 29.99, 2);
  });

  it('prices top-ups by pack inside the 30-day window and reports unknown grants', () => {
    const r = computeFinance({
      ...empty,
      paidGrants: [
        { userId: 'a', reason: 'topup', delta: 20_000, createdAt: daysAgo(3) },
        { userId: 'a', reason: 'topup', delta: 60_000, createdAt: daysAgo(40) },
        { userId: 'a', reason: 'topup', delta: 777, createdAt: daysAgo(2) },
        { userId: 'a', reason: 'monthly_grant', delta: 30_000, createdAt: daysAgo(2) },
      ],
    });
    expect(r.topUps30d.packs).toBe(1);
    expect(r.topUps30d.grossEur).toBe(12);
    expect(r.topUps30d.unmatchedGrants).toBe(1);
    expect(r.flags.some((f) => f.includes('match no pack'))).toBe(true);
  });

  it('splits API cost by outcome, tier and payer, ignoring jobs outside the window', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'payer', planId: 'pro', status: 'active' }],
      jobs: [
        job({ userId: 'payer', apiCostUsd: 0.05 }),
        job({ userId: 'payer', modelTier: 'premium', apiCostUsd: 1.9 }),
        job({ userId: 'trial', status: 'failed', apiCostUsd: 0.2 }),
        job({ userId: 'trial', status: 'scripting', apiCostUsd: 0.04 }),
        job({ userId: 'payer', createdAt: daysAgo(45), apiCostUsd: 99 }),
      ],
    });
    const c = r.apiCost30d;
    expect(c.totalUsd).toBeCloseTo(2.19, 2);
    expect(c.done.jobs).toBe(2);
    expect(c.failed.jobs).toBe(1);
    expect(c.other.jobs).toBe(1);
    expect(c.byTier.premium?.costUsd).toBeCloseTo(1.9, 2);
    expect(c.acquisitionBurnUsd).toBeCloseTo(0.24, 2);
    expect(c.perDoneVideoUsd).toBeCloseTo(0.98, 2);
    expect(c.wastedShare).toBeCloseTo(0.2 / 2.19, 4);
    expect(c.costPer1kCreditsUsd).toBeCloseTo((2.19 / 8000) * 1000, 4);
  });

  it('treats a user with a past paid grant as a payer even after the subscription lapsed', () => {
    const r = computeFinance({
      ...empty,
      paidGrants: [
        { userId: 'lapsed', reason: 'monthly_grant', delta: 30_000, createdAt: daysAgo(60) },
      ],
      jobs: [job({ userId: 'lapsed', apiCostUsd: 0.5 })],
    });
    expect(r.apiCost30d.acquisitionBurnUsd).toBe(0);
  });

  it('computes profit, break-even and missing fixed costs', () => {
    const fixed: FixedCost[] = [
      { id: 'host', label: 'Host', usdPerMonth: 20, note: '' },
      { id: 'voice', label: 'Voice', usdPerMonth: null, note: '' },
    ];
    const r = computeFinance({
      ...empty,
      fixedCosts: fixed,
      subscriptions: [{ userId: 'p', planId: 'pro', status: 'active' }],
      jobs: [job({ userId: 'p', apiCostUsd: 2 })],
    });
    const net = netUsdOf(29.99, 1);
    expect(r.fixed.monthlyUsd).toBe(20);
    expect(r.fixed.missing).toEqual(['voice']);
    expect(r.monthly.contributionUsd).toBeCloseTo(net - 2, 2);
    expect(r.monthly.profitUsd).toBeCloseTo(net - 2 - 20, 2);
    expect(r.breakEven.subscribersNeeded).toBe(Math.ceil(20 / (net - 2)));
    expect(r.flags.some((f) => f.includes('Fixed costs not supplied: voice'))).toBe(true);
  });

  it('flags revenue below the margin target and no break-even when each subscriber loses money', () => {
    const r = computeFinance({
      ...empty,
      fixedCosts: [{ id: 'host', label: 'Host', usdPerMonth: 20, note: '' }],
      subscriptions: [{ userId: 'p', planId: 'starter', status: 'active' }],
      jobs: [job({ userId: 'p', apiCostUsd: 30 })],
    });
    expect(r.monthly.revenueMultiple).toBeLessThan(3);
    expect(r.flags.some((f) => f.includes('below the 3x target'))).toBe(true);
    expect(r.breakEven.subscribersNeeded).toBeNull();
  });
});
