import { describe, expect, it } from 'vitest';
import { computeUnitEconomics, type JobRow } from '@/features/metrics/unit-economics';

const now = new Date('2026-10-19T00:00:00Z');
const job = (over: Partial<JobRow>): JobRow => ({
  status: 'done',
  modelTier: 'standard',
  targetDurationSec: 15,
  actualCredits: 2000,
  apiCostUsd: 0.1,
  createdAt: new Date('2026-10-18T00:00:00Z'),
  ...over,
});

describe('computeUnitEconomics', () => {
  it('splits finished jobs by tier and prices a video and 1k credits', () => {
    const r = computeUnitEconomics(
      [
        job({}),
        job({ apiCostUsd: 0.3 }),
        job({ modelTier: 'premium', apiCostUsd: 1.5, actualCredits: 25_000 }),
      ],
      now,
      30,
    );
    const std = r.tiers.find((t) => t.tier === 'standard');
    expect(std).toMatchObject({ videos: 2, avgCostPerVideoUsd: 0.2, costPer1kCreditsUsd: 0.1 });
    expect(r.tiers.find((t) => t.tier === 'premium')?.avgCostPerSecondUsd).toBe(0.1);
  });

  it('counts failed-job spend as pure loss and ignores rows outside the window', () => {
    const r = computeUnitEconomics(
      [
        job({ status: 'failed', apiCostUsd: 0.5 }),
        job({ createdAt: new Date('2026-01-01T00:00:00Z') }),
      ],
      now,
      30,
    );
    expect(r).toMatchObject({ finished: 0, failed: 1, failedCostUsd: 0.5, totalApiCostUsd: 0.5 });
  });
});
