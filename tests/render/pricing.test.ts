import { describe, expect, it } from 'vitest';
import { estimateJobCredits, estimateSceneCount } from '@/features/render/pricing';

describe('estimateSceneCount', () => {
  it('never goes below 2 scenes', () => {
    expect(estimateSceneCount(3)).toBe(2);
  });
  it('scales roughly one scene per 6 seconds', () => {
    expect(estimateSceneCount(30)).toBe(5);
    expect(estimateSceneCount(60)).toBe(10);
  });
});

describe('estimateJobCredits', () => {
  it('is positive and grows with duration', () => {
    const short = estimateJobCredits({ targetDurationSec: 12, modelTier: 'standard' });
    const long = estimateJobCredits({ targetDurationSec: 60, modelTier: 'standard' });
    expect(short).toBeGreaterThan(0);
    expect(long).toBeGreaterThan(short);
  });

  it('premium tier costs more than standard for the same duration', () => {
    const standard = estimateJobCredits({ targetDurationSec: 30, modelTier: 'standard' });
    const premium = estimateJobCredits({ targetDurationSec: 30, modelTier: 'premium' });
    expect(premium).toBeGreaterThan(standard);
  });
});
