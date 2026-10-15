import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, type FinanceJob } from '@/features/metrics/finance';
import { PLANS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';

const NOW = new Date('2026-10-15T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const job = (over: Partial<FinanceJob> = {}): FinanceJob => ({
  status: 'done',
  modelTier: 'standard',
  createdAt: daysAgo(1),
  actualCredits: 2000,
  apiCostUsd: 0.07,
  ...over,
});

describe('computeFinance', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinance({ now: NOW, jobs: [], subscriptions: [] });
    expect(r.mrrEur).toBe(0);
    expect(r.arpuEur).toBeNull();
    expect(r.avgCostPerVideoUsd).toBeNull();
    expect(r.apiCostShareOfNetMrr).toBeNull();
    expect(r.tiers).toEqual([]);
  });

  it('sums MRR over live subscriptions only', () => {
    const r = computeFinance({
      now: NOW,
      jobs: [],
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'nope', status: 'active' },
      ],
    });
    expect(r.mrrEur).toBeCloseTo((PLANS.starter.priceCents + PLANS.pro.priceCents) / 100);
    expect(r.payingByPlan).toEqual({ starter: 1, pro: 1 });
    expect(r.arpuEur).toBeCloseTo(r.mrrEur / 2);
    expect(r.netMrrUsd).toBeCloseTo(
      netRevenueUsd(PLANS.starter.priceCents) + netRevenueUsd(PLANS.pro.priceCents),
    );
  });

  it('measures cost per video and per credit by tier, inside the window', () => {
    const r = computeFinance({
      now: NOW,
      jobs: [
        job(),
        job({ apiCostUsd: 0.09, actualCredits: 3000 }),
        job({ modelTier: 'premium', apiCostUsd: 1.1, actualCredits: 26_504 }),
        job({ createdAt: daysAgo(40), apiCostUsd: 99 }),
      ],
      subscriptions: [],
    });
    expect(r.doneJobs).toBe(3);
    expect(r.apiCostUsd).toBeCloseTo(1.26);
    const std = r.tiers.find((t) => t.tier === 'standard');
    expect(std?.avgCostPerVideoUsd).toBeCloseTo(0.08);
    expect(std?.costPerCreditUsd).toBeCloseTo(0.16 / 5000);
  });

  it('counts failed-job cost as burned, and subtracts it from the margin proxy', () => {
    const r = computeFinance({
      now: NOW,
      jobs: [job(), job({ status: 'failed', apiCostUsd: 0.5 }), job({ status: 'queued' })],
      subscriptions: [{ planId: 'starter', status: 'active' }],
    });
    expect(r.burnedFailedCostUsd).toBeCloseTo(0.5);
    expect(r.grossMarginProxyUsd).toBeCloseTo(r.netMrrUsd - 0.07 - 0.5);
    expect(r.apiCostShareOfNetMrr).toBeCloseTo(0.57 / r.netMrrUsd);
  });
});
