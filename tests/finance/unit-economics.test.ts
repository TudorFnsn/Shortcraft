import { describe, expect, it } from 'vitest';
import { computeFinance, type FinanceInput } from '@/features/finance/unit-economics';

const now = new Date('2026-10-20T00:00:00Z');
const day = (n: number) => new Date(now.getTime() - n * 86_400_000);
const job = (over: Partial<FinanceInput['jobs'][number]> = {}): FinanceInput['jobs'][number] => ({
  status: 'done',
  modelTier: 'standard',
  targetDurationSec: 15,
  apiCostUsd: 0.1,
  actualCredits: 2000,
  createdAt: day(1),
  ...over,
});

describe('computeFinance', () => {
  it('counts only live subscriptions known to the catalog in MRR', () => {
    const r = computeFinance({
      now,
      subscriptions: [
        { planId: 'starter', status: 'active' },
        { planId: 'pro', status: 'trialing' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'gone', status: 'active' },
      ],
      jobs: [],
      topups: [],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBeCloseTo(14.99 + 29.99, 2);
    expect(r.mrrByPlan.pro).toEqual({ subscribers: 1, mrrEur: 29.99 });
    expect(r.arpuEur).toBeCloseTo(22.49, 2);
    expect(r.mrrNetUsd).toBeGreaterThan(0);
    expect(r.mrrNetUsd).toBeLessThan(r.mrrEur * 1.08);
  });

  it('measures cost per video and per 1k credits by tier, inside the 30-day window', () => {
    const r = computeFinance({
      now,
      subscriptions: [],
      jobs: [
        job(),
        job({ apiCostUsd: 0.3, actualCredits: 4000 }),
        job({ modelTier: 'premium', apiCostUsd: 2, actualCredits: 20000 }),
        job({ createdAt: day(45), apiCostUsd: 99 }),
      ],
      topups: [],
    });
    expect(r.videos30d).toBe(3);
    expect(r.apiCostUsd30d).toBeCloseTo(2.4, 4);
    const std = r.byTier.find((t) => t.tier === 'standard');
    expect(std).toMatchObject({ videos: 2, avgCostPerVideoUsd: 0.2, avgCreditsPerVideo: 3000 });
    expect(std?.costPer1kCreditsUsd).toBeCloseTo(0.0667, 3);
  });

  it('matches top-ups to packs and ignores unknown amounts and old purchases', () => {
    const r = computeFinance({
      now,
      subscriptions: [],
      jobs: [],
      topups: [
        { credits: 20_000, createdAt: day(2) },
        { credits: 777, createdAt: day(2) },
        { credits: 60_000, createdAt: day(60) },
      ],
    });
    expect(r.topupNetUsd30d).toBeGreaterThan(5);
    expect(r.topupNetUsd30d).toBeLessThan(12 * 1.08);
  });

  it('flags a loss, failed renders and no subscribers; coverage is null with no spend', () => {
    const idle = computeFinance({ now, subscriptions: [], jobs: [], topups: [] });
    expect(idle.mrrCoverage).toBeNull();
    expect(idle.flags[0]).toMatch(/No paying subscribers/);

    const r = computeFinance({
      now,
      subscriptions: [],
      jobs: [job(), job({ status: 'failed', apiCostUsd: 0.5 })],
      topups: [],
      fixedCostsUsd: { hosting: 20, elevenlabs: 22 },
    });
    expect(r.fixedCostsUsd).toBe(42);
    expect(r.contributionUsd30d).toBeCloseTo(-42.6, 2);
    expect(r.flags.join(' ')).toMatch(/Spend exceeds/);
    expect(r.flags.join(' ')).toMatch(/renders failed/);
  });
});
