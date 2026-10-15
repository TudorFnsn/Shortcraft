import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceJob } from '@/features/finance/unit-economics';

const NOW = new Date('2026-10-15T06:00:00Z');
const day = (d: number) => new Date(NOW.getTime() - d * 86_400_000);
const job = (o: Partial<FinanceJob>): FinanceJob => ({
  status: 'done',
  modelTier: 'standard',
  createdAt: day(1),
  actualCredits: 2000,
  apiCostUsd: 0.04,
  ...o,
});

describe('computeFinance', () => {
  it('is all zeros with no data', () => {
    const r = computeFinance({ now: NOW, subscriptions: [], jobs: [] });
    expect(r.mrrEur).toBe(0);
    expect(r.payingSubscribers).toBe(0);
    expect(r.last30d.failedShare).toBeNull();
    expect(r.tiers).toEqual([]);
  });

  it('sums MRR from live subscriptions only', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'past_due' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'bogus', status: 'active' },
      ],
      jobs: [],
    });
    expect(r.mrrEur).toBe(44.98);
    expect(r.payingSubscribers).toBe(2);
  });

  it('prices tiers per video and per 1k credits, and counts failed spend', () => {
    const r = computeFinance({
      now: NOW,
      subscriptions: [],
      jobs: [
        job({}),
        job({ modelTier: 'premium', actualCredits: 40_000, apiCostUsd: 1.9 }),
        job({ status: 'failed', apiCostUsd: 0.01 }),
        job({ createdAt: day(60), apiCostUsd: 5 }),
      ],
    });
    const premium = r.tiers.find((t) => t.tier === 'premium');
    expect(premium?.avgCostUsd).toBe(1.9);
    expect(premium?.costPer1kCredits).toBe(0.0475);
    expect(r.last30d.videos).toBe(2);
    expect(r.last30d.failedVideos).toBe(1);
    expect(r.last30d.apiCostUsd).toBe(1.95);
  });
});
