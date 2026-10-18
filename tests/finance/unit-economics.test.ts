import { describe, expect, it } from 'vitest';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';
import {
  computeFinance,
  netMonthlyUsd,
  type FinanceJob,
  type FinanceSub,
} from '@/features/finance/unit-economics';

const now = new Date('2026-10-18T00:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86_400_000);
const job = (o: Partial<FinanceJob>): FinanceJob => ({
  userId: 'u1',
  status: 'done',
  modelTier: 'standard',
  createdAt: day(1),
  apiCostUsd: 0.07,
  estimatedCredits: 2024,
  actualCredits: 2000,
  targetDurationSec: 15,
  ...o,
});
const sub = (userId: string, planId: string, status = 'active'): FinanceSub => ({
  userId,
  planId,
  status,
});

describe('netMonthlyUsd', () => {
  it('strips VAT and the Stripe fee, then converts to USD', () => {
    // 29.99 → 24.99 ex VAT − (0.45 + 0.25) fee = 24.29 EUR → × 1.08
    expect(netMonthlyUsd(2999, REVENUE_ASSUMPTIONS)).toBeCloseTo(26.23, 1);
  });
});

describe('computeFinance', () => {
  it('counts only live subscriptions on sold plans toward MRR', () => {
    const r = computeFinance({
      now,
      jobs: [],
      paidGrantCredits: 0,
      subscriptions: [sub('a', 'pro'), sub('b', 'starter', 'canceled'), sub('c', 'nope')],
    });
    expect(r.payingSubscribers).toBe(1);
    expect(r.subscribersByPlan).toEqual({ starter: 0, pro: 1, ultra: 0 });
    expect(r.mrrNetUsd).toBeCloseTo(netMonthlyUsd(2999, REVENUE_ASSUMPTIONS), 6);
    expect(r.realisedMultiple).toBeNull();
  });

  it('attributes failed-job cost as waste and non-payer cost as free-user burn', () => {
    const r = computeFinance({
      now,
      subscriptions: [sub('p', 'pro')],
      paidGrantCredits: 100_000,
      jobs: [
        job({ userId: 'p', apiCostUsd: 1 }),
        job({ userId: 'free', apiCostUsd: 1, status: 'failed' }),
        job({ userId: 'p', createdAt: day(90), apiCostUsd: 50 }), // outside window
      ],
    });
    expect(r.apiCostUsd).toBe(2);
    expect(r.freeUserCostShare).toBeCloseTo(0.5);
    expect(r.tiers[0]).toMatchObject({ finished: 1, failed: 1, wastedCostUsd: 1 });
    expect(r.creditUtilisation).toBeCloseTo(0.02);
    expect(r.realisedMultiple).toBeCloseTo(r.mrrNetUsd / 2);
  });

  it('subtracts fixed costs pro-rata to the window', () => {
    const r = computeFinance({
      now,
      jobs: [],
      subscriptions: [sub('a', 'pro')],
      paidGrantCredits: 0,
      fixedMonthlyCostsUsd: 30,
      windowDays: 15,
    });
    expect(r.grossMarginUsd).toBeCloseTo(r.mrrNetUsd / 2 - 15, 6);
  });
});
