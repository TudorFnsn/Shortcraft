import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceJob } from '@/features/metrics/finance';

const NOW = new Date('2026-10-20T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

const job = (over: Partial<FinanceJob> = {}): FinanceJob => ({
  status: 'done',
  modelTier: 'standard',
  createdAt: daysAgo(1),
  apiCostUsd: 0.1,
  chargedCredits: 1_000,
  ...over,
});

describe('computeFinance', () => {
  it('returns zeros and null ratios with no data', () => {
    const r = computeFinance({ subscriptions: [], jobs: [], now: NOW });
    expect(r.mrrEurCents).toBe(0);
    expect(r.arpuUsd).toBeNull();
    expect(r.grossMargin).toBeNull();
    expect(r.revenueToCost).toBeNull();
    expect(r.costPerFinishedVideoUsd).toBeNull();
    expect(r.belowTarget).toBe(false);
  });

  it('counts MRR only for live subscriptions on plans we sell', () => {
    const r = computeFinance({
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'enterprise', status: 'active' },
      ],
      jobs: [],
      now: NOW,
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1, ultra: 0 });
    expect(r.mrrEurCents).toBe(1499 + 2999);
    expect(r.netMrrUsd).toBeGreaterThan(0);
    expect(r.netMrrUsd).toBeLessThan((r.mrrEurCents / 100) * 1.08);
  });

  it('charges failed jobs to the videos that shipped', () => {
    const r = computeFinance({
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [job({ apiCostUsd: 0.2 }), job({ status: 'failed', apiCostUsd: 0.1 })],
      now: NOW,
    });
    expect(r.jobs).toBe(2);
    expect(r.jobsDone).toBe(1);
    expect(r.meteredCostUsd).toBe(0.3);
    expect(r.costPerFinishedVideoUsd).toBe(0.3);
    expect(r.burnUsdPerCredit).toBe(0.00015);
  });

  it('ignores jobs outside the 30-day window and splits cost by tier', () => {
    const r = computeFinance({
      subscriptions: [],
      jobs: [
        job({ modelTier: 'premium', apiCostUsd: 2 }),
        job({ createdAt: daysAgo(31), apiCostUsd: 50 }),
        job({ createdAt: new Date(NOW.getTime() + 1_000), apiCostUsd: 50 }),
      ],
      now: NOW,
    });
    expect(r.jobs).toBe(1);
    expect(r.byTier.premium).toEqual({ jobs: 1, done: 1, costUsd: 2, credits: 1_000 });
  });

  it('flags revenue below the 3x gate', () => {
    const subs = [{ planId: 'starter', status: 'active' }];
    const lossy = computeFinance({
      subscriptions: subs,
      jobs: [job({ apiCostUsd: 20 })],
      now: NOW,
    });
    expect(lossy.belowTarget).toBe(true);
    expect(lossy.grossMargin).toBeLessThan(0);

    const healthy = computeFinance({
      subscriptions: subs,
      jobs: [job({ apiCostUsd: 1 })],
      now: NOW,
    });
    expect(healthy.belowTarget).toBe(false);
  });
});
