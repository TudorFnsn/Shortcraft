import { describe, expect, it } from 'vitest';
import { computeFinance, DAY_MS, netUsdFromEurCents } from '@/features/finance/unit-economics';
import { REVENUE_ASSUMPTIONS } from '@/features/billing/margin';

const NOW = new Date('2026-10-14T06:00:00Z');
const job = (status: string, days: number, cost: number, credits = 1000) => ({
  status,
  createdAt: new Date(NOW.getTime() - days * DAY_MS),
  apiCostUsd: cost,
  actualCredits: credits,
});
const base = { now: NOW, subscriptions: [], jobs: [], fixedCosts: [] };

describe('computeFinance', () => {
  it('has no ratios on an empty business', () => {
    const r = computeFinance(base);
    expect(r.mrrNetUsd).toBe(0);
    expect(r.arpuNetUsd).toBeNull();
    expect(r.grossMarginPct).toBeNull();
    expect(r.apiCostPerVideoUsd).toBeNull();
  });

  it('counts only live subscriptions on known plans', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'starter', status: 'canceled' },
        { planId: 'ghost', status: 'active' },
      ],
    });
    expect(r.subscribers).toBe(1);
    expect(r.mrrNetUsd).toBeCloseTo(netUsdFromEurCents(2999, REVENUE_ASSUMPTIONS), 6);
  });

  it('computes cost per video, margin and break-even; failed jobs still cost', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [job('done', 1, 0.1), job('done', 2, 0.3), job('failed', 3, 0.2), job('done', 40, 9)],
      fixedCosts: [
        { id: 'a', label: 'a', monthlyUsd: 10, source: '' },
        { id: 'b', label: 'b', monthlyUsd: null, source: '' },
      ],
    });
    expect(r.videosFinished).toBe(2);
    expect(r.apiCostUsd).toBeCloseTo(0.6);
    expect(r.failedCostUsd).toBeCloseTo(0.2);
    expect(r.apiCostPerVideoUsd).toBeCloseTo(0.3);
    expect(r.fixedCostsUnknown).toEqual(['b']);
    expect(r.breakEvenMrrUsd).toBeCloseTo(10 + 0.6);
    expect(r.monthlyNetUsd).toBeCloseTo(r.mrrNetUsd - 0.6 - 10);
  });
});
