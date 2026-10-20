import { describe, expect, it } from 'vitest';
import { PLANS, TOPUP_PACKS } from '@/config/plans';
import { netRevenueUsd } from '@/features/billing/margin';
import { computeFinance } from '@/features/finance/unit-economics';

const now = new Date('2026-10-20T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('computeFinance', () => {
  it('is empty and not judged with no data', () => {
    const r = computeFinance({ jobs: [], subscriptions: [], topUps: [], now });
    expect(r.mrrGrossEur).toBe(0);
    expect(r.arpuNetUsd).toBeNull();
    expect(r.costToRevenue).toBeNull();
    expect(r.healthy).toBeNull();
  });

  it('counts only live subscriptions on sold plans toward MRR', () => {
    const r = computeFinance({
      jobs: [],
      topUps: [],
      now,
      subscriptions: [
        { userId: 'a', planId: 'starter', status: 'active' },
        { userId: 'b', planId: 'pro', status: 'trialing' },
        { userId: 'c', planId: 'pro', status: 'canceled' },
        { userId: 'd', planId: 'legacy', status: 'active' },
      ],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.subscribersByPlan).toEqual({ starter: 1, pro: 1 });
    expect(r.mrrGrossEur).toBe((PLANS.starter.priceCents + PLANS.pro.priceCents) / 100);
    expect(r.mrrNetUsd).toBeCloseTo(
      netRevenueUsd(PLANS.starter.priceCents) + netRevenueUsd(PLANS.pro.priceCents),
      1,
    );
  });

  it('windows costs to 30 days, splits by tier and attributes free-user burn', () => {
    const r = computeFinance({
      now,
      topUps: [],
      subscriptions: [{ userId: 'payer', planId: 'pro', status: 'active' }],
      jobs: [
        {
          userId: 'payer',
          status: 'done',
          modelTier: 'premium',
          apiCostUsd: 3,
          createdAt: daysAgo(2),
        },
        {
          userId: 'trial',
          status: 'failed',
          modelTier: 'standard',
          apiCostUsd: 1,
          createdAt: daysAgo(3),
        },
        {
          userId: 'trial',
          status: 'done',
          modelTier: 'standard',
          apiCostUsd: 99,
          createdAt: daysAgo(40),
        },
      ],
    });
    expect(r.apiCostUsd30d).toBe(4);
    expect(r.apiCostByTier.premium?.costPerDoneVideoUsd).toBe(3);
    expect(r.apiCostByTier.standard?.costPerDoneVideoUsd).toBeNull();
    expect(r.freeUserApiCostUsd30d).toBe(1);
    expect(r.freeUserShareOfCost).toBe(0.25);
    expect(r.healthy).toBe(true);
  });

  it('prices top-ups by pack, flags unknown ones, and ignores old ones', () => {
    const pack = TOPUP_PACKS[0]!;
    const r = computeFinance({
      now,
      jobs: [],
      subscriptions: [],
      topUps: [
        { credits: pack.credits, createdAt: daysAgo(1) },
        { credits: 123, createdAt: daysAgo(1) },
        { credits: pack.credits, createdAt: daysAgo(60) },
      ],
    });
    expect(r.topUpNetUsd30d).toBeCloseTo(netRevenueUsd(pack.priceCents), 1);
    expect(r.topUpCreditsUnpriced30d).toBe(123);
  });

  it('flags unhealthy when cost exceeds a third of net revenue', () => {
    const r = computeFinance({
      now,
      topUps: [],
      subscriptions: [{ userId: 'a', planId: 'starter', status: 'active' }],
      jobs: [
        {
          userId: 'a',
          status: 'done',
          modelTier: 'premium',
          apiCostUsd: 50,
          createdAt: daysAgo(1),
        },
      ],
    });
    expect(r.healthy).toBe(false);
  });
});
