import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS } from '@/features/metrics/finance';

const now = new Date('2026-10-14T00:00:00Z');
const ago = (days: number) => new Date(now.getTime() - days * DAY_MS);

describe('computeFinance', () => {
  it('reports zero revenue without dividing by it', () => {
    const r = computeFinance({ now, subscriptions: [], jobs: [] });
    expect(r.mrrEur).toBe(0);
    expect(r.grossMargin).toBeNull();
    expect(r.costPerVideoUsd).toBeNull();
    expect(r.creditsPerApiUsd).toBeNull();
  });

  it('counts only live subscriptions on sold plans', () => {
    const r = computeFinance({
      now,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'starter', status: 'trialing' },
        { planId: 'pro', status: 'canceled' },
        { planId: 'ghost', status: 'active' },
      ],
      jobs: [],
    });
    expect(r.payingSubscribers).toBe(2);
    expect(r.mrrEur).toBeCloseTo(29.99 + 14.99, 2);
    expect(r.netMrrUsd).toBeGreaterThan(0);
    expect(r.netMrrUsd).toBeLessThan(r.mrrEur * 1.08);
  });

  it('windows API cost to 30 days and prices failures and fixed costs', () => {
    const r = computeFinance({
      now,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [
        { status: 'done', createdAt: ago(2), apiCostUsd: 1, chargedCredits: 26_000 },
        { status: 'failed', createdAt: ago(3), apiCostUsd: 0.5, chargedCredits: 0 },
        { status: 'done', createdAt: ago(45), apiCostUsd: 99, chargedCredits: 1 },
      ],
      fixedCosts: [{ name: 'ElevenLabs', monthlyUsd: 5 }],
    });
    expect(r.apiCostUsd30d).toBe(1.5);
    expect(r.failedCostUsd30d).toBe(0.5);
    expect(r.videosDone30d).toBe(1);
    expect(r.costPerVideoUsd).toBe(1.5);
    expect(r.monthlyProfitUsd).toBeCloseTo(r.netMrrUsd - 1.5 - 5, 2);
    expect(r.grossMargin).toBeCloseTo((r.netMrrUsd - 1.5) / r.netMrrUsd, 5);
  });
});
