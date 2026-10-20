import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceInput } from '@/features/finance/unit-economics';
import { netRevenueUsd } from '@/features/billing/margin';

const NOW = new Date('2026-10-20T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinanceInput = { now: NOW, subscriptions: [], jobs: [], topups: [], fixedCosts: [] };
const job = (over: Partial<FinanceInput['jobs'][number]>): FinanceInput['jobs'][number] => ({
  userId: 'u1',
  status: 'done',
  modelTier: 'standard',
  apiCostUsd: 0.05,
  actualCredits: 2000,
  targetDurationSec: 15,
  createdAt: daysAgo(1),
  ...over,
});

describe('computeFinance', () => {
  it('is all zeros / n/a with no data', () => {
    const r = computeFinance(empty);
    expect(r.mrrNetUsd).toBe(0);
    expect(r.grossMargin).toBeNull();
    expect(r.arpuNetUsd).toBeNull();
    expect(r.breakEvenSubscribers).toBeNull();
  });

  it('counts MRR only for live subscriptions on a sold plan', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [
        { userId: 'a', planId: 'pro', status: 'active' },
        { userId: 'b', planId: 'starter', status: 'canceled' },
        { userId: 'c', planId: 'legacy', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(1);
    expect(r.mrrGrossEur).toBe(29.99);
    expect(r.mrrNetUsd).toBeCloseTo(netRevenueUsd(2999), 1);
    expect(r.arrNetUsd).toBeCloseTo(r.mrrNetUsd * 12, 0);
  });

  it('splits spend: wasted on failures, burned by non-payers, cost per video by tier', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'payer', planId: 'pro', status: 'active' }],
      jobs: [
        job({ userId: 'payer', apiCostUsd: 2, modelTier: 'premium', actualCredits: 40000 }),
        job({ userId: 'payer', apiCostUsd: 0.5, status: 'failed' }),
        job({ userId: 'trial', apiCostUsd: 0.1 }),
        job({ userId: 'trial', apiCostUsd: 9, createdAt: daysAgo(45) }), // outside window
      ],
    });
    expect(r.apiCostUsd).toBe(2.6);
    expect(r.wastedApiCostUsd).toBe(0.5);
    expect(r.freeUserApiCostUsd).toBe(0.1);
    expect(r.byTier.premium?.avgCostPerVideoUsd).toBe(2);
    expect(r.byTier.premium?.costPer1kCreditsUsd).toBe(0.05);
    expect(r.byTier.standard?.videos).toBe(1);
  });

  it('adds recent top-ups, computes margin, and reports unknown fixed costs', () => {
    const r = computeFinance({
      ...empty,
      subscriptions: [{ userId: 'a', planId: 'starter', status: 'active' }],
      topups: [
        { credits: 20_000, createdAt: daysAgo(3) },
        { credits: 20_000, createdAt: daysAgo(60) },
      ],
      jobs: [job({ userId: 'a', apiCostUsd: 1 })],
      fixedCosts: [
        { id: 'vercel', label: 'Vercel', usdPerMonth: 20 },
        { id: 'supabase', label: 'Supabase', usdPerMonth: null },
      ],
    });
    expect(r.topupNetUsd).toBeCloseTo(netRevenueUsd(1200), 1);
    expect(r.grossMargin).toBeGreaterThan(0);
    expect(r.fixedKnownUsd).toBe(20);
    expect(r.fixedUnknown).toEqual(['supabase']);
    expect(r.contributionUsd).toBeCloseTo(r.revenueNetUsd - 1 - 20, 1);
    expect(r.breakEvenSubscribers).toBeGreaterThan(0);
  });
});
