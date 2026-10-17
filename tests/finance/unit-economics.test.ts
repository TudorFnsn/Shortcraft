import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceJob } from '@/features/finance/unit-economics';

const from = new Date('2026-10-01T00:00:00Z');
const to = new Date('2026-10-31T00:00:00Z');
const at = new Date('2026-10-10T00:00:00Z');
const job = (over: Partial<FinanceJob>): FinanceJob => ({
  userId: 'u1',
  status: 'done',
  modelTier: 'standard',
  apiCostUsd: 0.1,
  createdAt: at,
  ...over,
});

describe('computeFinance', () => {
  it('sums MRR over live subscriptions on plans we sell only', () => {
    const r = computeFinance({
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'ultra', status: 'canceled' },
        { planId: 'legacy', status: 'active' },
      ],
      jobs: [],
      grants: [],
      from,
      to,
    });
    expect(r.mrrEur).toBeCloseTo(14.99 + 29.99);
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1 });
    expect(r.arpuEur).toBeCloseTo((14.99 + 29.99) / 2);
    expect(r.netMrrUsd).toBeGreaterThan(0);
    expect(r.netMrrUsd).toBeLessThan(r.mrrUsd);
  });

  it('splits spend by tier, flags failed-job spend and ignores jobs outside the window', () => {
    const r = computeFinance({
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        job({ apiCostUsd: 0.07 }),
        job({ modelTier: 'premium', apiCostUsd: 2.3 }),
        job({ status: 'failed', modelTier: 'premium', apiCostUsd: 1.1 }),
        job({ apiCostUsd: 9, createdAt: new Date('2026-09-01T00:00:00Z') }),
      ],
      grants: [],
      from,
      to,
    });
    expect(r.jobsInWindow).toBe(3);
    expect(r.jobsDone).toBe(2);
    expect(r.apiSpendUsd).toBeCloseTo(3.47);
    expect(r.spendByTierUsd.premium).toBeCloseTo(3.4);
    expect(r.wastedSpendUsd).toBeCloseTo(1.1);
    expect(r.avgCostPerDoneVideoUsd).toBeCloseTo((0.07 + 2.3) / 2);
    expect(r.coverage).toBeGreaterThan(0);
  });

  it('prices top-ups by pack and reports null ratios on an empty window', () => {
    const r = computeFinance({
      subscriptions: [],
      jobs: [],
      grants: [
        { reason: 'topup', delta: 20_000, createdAt: at },
        { reason: 'monthly_grant', delta: 30_000, createdAt: at },
        { reason: 'topup', delta: 60_000, createdAt: new Date('2026-08-01T00:00:00Z') },
      ],
      from,
      to,
    });
    expect(r.topUpCashEur).toBe(12);
    expect(r.coverage).toBeNull();
    expect(r.arpuEur).toBeNull();
    expect(r.avgCostPerDoneVideoUsd).toBeNull();
  });
});
