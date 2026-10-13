import { describe, expect, it } from 'vitest';
import { computeFinance, type JobCostRow } from '@/features/finance/unit-economics';

const now = new Date('2026-10-13T00:00:00Z');
const job = (over: Partial<JobCostRow>): JobCostRow => ({
  status: 'done',
  modelTier: 'standard',
  targetDurationSec: 15,
  apiCostUsd: 0.1,
  createdAt: new Date('2026-10-10T00:00:00Z'),
  ...over,
});
const base = { now, windowDays: 30, signupsInWindow: 0, trialBurnUsd: 0.25, fixedMonthlyUsd: 0 };

describe('computeFinance', () => {
  it('counts only live subscriptions toward MRR', () => {
    const r = computeFinance({
      ...base,
      jobs: [],
      subscriptions: [
        { planId: 'pro', status: 'active' },
        { planId: 'starter', status: 'canceled' },
      ],
    });
    expect(r.payingSubscribers).toBe(1);
    expect(r.grossMrrEur).toBe(29.99);
    expect(r.netMrrUsd).toBeGreaterThan(0);
    expect(r.mrrToVariableCost).toBeNull();
  });

  it('attributes spend on failed jobs as waste and computes cost per finished video', () => {
    const r = computeFinance({
      ...base,
      subscriptions: [],
      jobs: [
        job({}),
        job({ apiCostUsd: 0.3, status: 'failed' }),
        job({ createdAt: new Date('2026-01-01') }),
      ],
    });
    expect(r.apiSpendUsd).toBe(0.4);
    expect(r.wastedOnFailedUsd).toBe(0.3);
    expect(r.costPerFinishedVideoUsd).toBe(0.4);
  });

  it('reports profit, margin and the MRR ratio net of trial burn and fixed costs', () => {
    const r = computeFinance({
      ...base,
      signupsInWindow: 4,
      fixedMonthlyUsd: 5,
      subscriptions: [{ planId: 'pro', status: 'active' }],
      jobs: [job({ apiCostUsd: 2 })],
    });
    expect(r.trialBurn30dUsd).toBe(1);
    expect(r.profit30dUsd).toBeCloseTo(r.netMrrUsd - 2 - 1 - 5, 1);
    expect(r.mrrToVariableCost).toBeCloseTo(r.netMrrUsd / 3, 1);
  });
});
