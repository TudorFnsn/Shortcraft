import { describe, expect, it } from 'vitest';
import { computeUnitEconomics, netUsdFromEur } from '@/features/metrics/unit-economics';

const now = new Date('2026-10-14T00:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86_400_000);

describe('computeUnitEconomics', () => {
  it('sums live MRR, ignores canceled subs and unknown plans', () => {
    const r = computeUnitEconomics({
      now,
      windowDays: 30,
      jobs: [],
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'legacy', status: 'active' },
      ],
    });
    expect(r.mrrEur).toBe(14.99);
    expect(r.payingSubscribers).toBe(1);
    expect(r.netMrrUsd).toBeCloseTo(netUsdFromEur(14.99), 2);
    expect(r.revenueToCostMultiple).toBeNull();
  });

  it('splits cost by tier, counts failed spend and respects the window', () => {
    const r = computeUnitEconomics({
      now,
      windowDays: 30,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        {
          status: 'done',
          modelTier: 'standard',
          chargedCredits: 2000,
          apiCostUsd: 0.07,
          createdAt: day(1),
        },
        {
          status: 'done',
          modelTier: 'standard',
          chargedCredits: 2000,
          apiCostUsd: 0.09,
          createdAt: day(2),
        },
        {
          status: 'failed',
          modelTier: 'premium',
          chargedCredits: 0,
          apiCostUsd: 0.5,
          createdAt: day(3),
        },
        {
          status: 'done',
          modelTier: 'standard',
          chargedCredits: 9999,
          apiCostUsd: 9,
          createdAt: day(60),
        },
      ],
    });
    expect(r.apiSpendUsd).toBe(0.66);
    expect(r.failedApiSpendUsd).toBe(0.5);
    const std = r.tiers.find((t) => t.tier === 'standard');
    expect(std).toMatchObject({ done: 2, avgApiCostUsd: 0.08, avgCredits: 2000 });
    expect(r.revenueToCostMultiple).toBeGreaterThan(10);
  });
});
