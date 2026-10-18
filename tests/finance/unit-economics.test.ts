import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, priceGrantUsd } from '@/features/finance/unit-economics';
import { PLANS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';

const NOW = new Date('2026-10-18T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const base = { now: NOW, subscriptions: [], jobs: [], paidGrants: [], fixedCosts: [] };

describe('computeFinance', () => {
  it('is all zeros / n/a with no data', () => {
    const r = computeFinance(base);
    expect(r.mrrEur).toBe(0);
    expect(r.grossMargin).toBeNull();
    expect(r.revenueMultiple).toBeNull();
    expect(r.creditUtilisation).toBeNull();
    expect(r.breakEvenSubscribers).toBeNull();
  });

  it('counts only live subscriptions on sold plans in MRR', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'trialing' },
        { userId: 'c', planId: 'pro', status: 'canceled' },
        { userId: 'd', planId: 'bogus', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBeCloseTo(14.99 + 29.99, 2);
  });

  it('prices grants by matching credits and counts the rest as unpriced', () => {
    const grant = {
      reason: 'monthly_grant',
      delta: PLANS.starter.monthlyCredits,
      createdAt: daysAgo(2),
    };
    expect(priceGrantUsd(grant)).toBeCloseTo(netRevenueUsd(1499), 6);
    const r = computeFinance({
      ...base,
      paidGrants: [
        grant,
        { reason: 'topup', delta: 1234, createdAt: daysAgo(1) },
        { ...grant, createdAt: daysAgo(40) },
      ],
    });
    expect(r.unmatchedGrants).toBe(1);
    expect(r.cashRevenueNetUsd).toBeCloseTo(netRevenueUsd(1499), 2);
  });

  it('splits cost per tier, charges failed jobs to the finished ones and finds profit', () => {
    const job = (status: string, cost: number, credits: number) => ({
      status,
      modelTier: 'premium',
      targetDurationSec: 15,
      apiCostUsd: cost,
      actualCredits: credits,
      createdAt: daysAgo(3),
    });
    const r = computeFinance({
      ...base,
      subscriptions: [{ userId: 'a', planId: 'pro', status: 'active' }],
      paidGrants: [
        { reason: 'monthly_grant', delta: PLANS.pro.monthlyCredits, createdAt: daysAgo(3) },
      ],
      jobs: [job('done', 1, 20_000), job('failed', 1, 0)],
      fixedCosts: [{ vendor: 'x', what: 'y', monthlyUsd: 10, source: 'invoice' }],
    });
    expect(r.tiers[0]).toMatchObject({ done: 1, costPerVideoUsd: 2, costPer1kCreditsUsd: 0.1 });
    expect(r.failedCostShare).toBe(0.5);
    expect(r.creditUtilisation).toBeCloseTo(0.2);
    expect(r.profitUsd).toBeCloseTo(netRevenueUsd(2999) - 2 - 10, 1);
    expect(r.fixedCostUnverified).toBe(0);
    expect(r.breakEvenSubscribers).toBe(1);
  });
});
