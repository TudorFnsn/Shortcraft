import { describe, expect, it } from 'vitest';
import { breakEvenSubscribers, computeFinance } from '@/features/metrics/finance';

const now = new Date('2026-10-16T00:00:00Z');
const job = (o: Partial<Parameters<typeof computeFinance>[0][number]> = {}) => ({
  status: 'done',
  modelTier: 'standard',
  targetDurationSec: 15,
  actualCredits: 2000,
  apiCostUsd: 0.1,
  createdAt: '2026-10-10T00:00:00Z',
  ...o,
});

describe('computeFinance', () => {
  it('averages cost per finished video by tier and ignores jobs outside the window', () => {
    const r = computeFinance(
      [job(), job({ apiCostUsd: 0.2 }), job({ createdAt: '2026-08-01T00:00:00Z' })],
      { items: {} },
      now,
    );
    expect(r.tiers).toHaveLength(1);
    expect(r.tiers[0]).toMatchObject({
      videos: 2,
      avgCostPerVideoUsd: 0.15,
      costPer1kCreditsUsd: 0.075,
    });
  });

  it('counts failed-job cost separately and reports unknown fixed costs as unknown, not zero', () => {
    const r = computeFinance(
      [job({ status: 'failed', apiCostUsd: 0.5 })],
      { items: { vercel: 20, resend: null } },
      now,
    );
    expect(r.failedCostUsd).toBe(0.5);
    expect(r.tiers).toHaveLength(0);
    expect(r.knownFixedMonthlyUsd).toBe(20);
    expect(r.unknownFixedItems).toEqual(['resend']);
  });
});

describe('breakEvenSubscribers', () => {
  it('rounds up and returns null when a subscriber loses money', () => {
    expect(breakEvenSubscribers(100, 12, 2)).toBe(10);
    expect(breakEvenSubscribers(100, 2, 3)).toBeNull();
  });
});
