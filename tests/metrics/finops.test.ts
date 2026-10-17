import { describe, expect, it } from 'vitest';
import { computeFinops, type FinopsInput } from '@/features/metrics/finops';
import { DAY_MS } from '@/features/metrics/north-star';

const NOW = new Date('2026-10-17T06:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * DAY_MS);
const empty: FinopsInput = { subscriptions: [], topUps: [], jobs: [], fixedCostsUsd: {}, now: NOW };
const job = (over: Partial<FinopsInput['jobs'][number]> = {}) => ({
  status: 'done',
  modelTier: 'standard',
  apiCostUsd: 0.1,
  actualCredits: 2000,
  createdAt: daysAgo(1),
  ...over,
});

describe('computeFinops', () => {
  it('is all zeros / nulls with no data', () => {
    const r = computeFinops(empty);
    expect(r.mrr.subscribers).toBe(0);
    expect(r.revenueToApiCost).toBeNull();
    expect(r.costPer1kCreditsUsd).toBeNull();
    expect(r.videos.avgCostPerDoneUsd).toBeNull();
    expect(r.alerts).toEqual([]);
  });

  it('counts only live subscriptions on known plans in MRR', () => {
    const r = computeFinops({
      ...empty,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'ghost', status: 'active' },
        { planId: 'starter', status: 'past_due' },
      ],
    });
    expect(r.mrr.byPlan).toEqual({ pro: 1, starter: 1 });
    expect(r.mrr.grossEur).toBe(44.98);
    expect(r.mrr.netUsd).toBeGreaterThan(0);
  });

  it('matches top-ups to packs inside the window and flags unknown sizes', () => {
    const r = computeFinops({
      ...empty,
      topUps: [
        { credits: 20_000, createdAt: daysAgo(2) },
        { credits: 20_000, createdAt: daysAgo(45) },
        { credits: 777, createdAt: daysAgo(1) },
      ],
    });
    expect(r.topUps.count).toBe(1);
    expect(r.topUps.unmatched).toBe(1);
    expect(r.alerts.some((a) => a.includes('top-up'))).toBe(true);
  });

  it('sums API cost by tier, ignores old jobs and reports waste on failures', () => {
    const r = computeFinops({
      ...empty,
      jobs: [
        job(),
        job({ modelTier: 'premium', apiCostUsd: 1 }),
        job({ status: 'failed', apiCostUsd: 0.4 }),
        job({ createdAt: daysAgo(60), apiCostUsd: 99 }),
      ],
    });
    expect(r.apiCostUsd.total).toBe(1.5);
    expect(r.apiCostUsd.byTier).toEqual({ standard: 0.5, premium: 1 });
    expect(r.apiCostUsd.wastedOnFailed).toBe(0.4);
    expect(r.videos).toEqual({ done: 2, failed: 1, avgCostPerDoneUsd: 0.55 });
    expect(r.costPer1kCreditsUsd).toBe(0.25);
  });

  it('alerts when revenue is under the margin gate or cash margin is negative', () => {
    const r = computeFinops({
      ...empty,
      subscriptions: [{ planId: 'starter', status: 'active' }],
      jobs: [job({ apiCostUsd: 20 })],
      fixedCostsUsd: { hosting: 20 },
    });
    expect(r.revenueToApiCost).toBeLessThan(3);
    expect(r.cashMarginUsd).toBeLessThan(0);
    expect(r.alerts.length).toBeGreaterThanOrEqual(2);
  });
});
