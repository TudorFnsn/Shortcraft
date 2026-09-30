import { describe, expect, it } from 'vitest';
import {
  billableCredits,
  estimateJobCredits,
  estimateSceneCount,
  fitScenesToBudget,
  MAX_SCENE_SEC,
} from '@/features/render/pricing';

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

describe('fitScenesToBudget', () => {
  const scene = (durationSec: number) => ({ durationSec, narration: 'x' });

  it('drops scenes beyond the estimated count', () => {
    const plan = Array.from({ length: 10 }, () => scene(6));
    expect(fitScenesToBudget(plan, 12)).toHaveLength(estimateSceneCount(12));
  });

  it('clamps over-long scenes to MAX_SCENE_SEC and keeps other fields', () => {
    const [fitted] = fitScenesToBudget([scene(30), scene(3)], 12);
    expect(fitted).toEqual({ durationSec: MAX_SCENE_SEC, narration: 'x' });
  });

  it('leaves a within-budget plan untouched', () => {
    const plan = [scene(4), scene(6)];
    expect(fitScenesToBudget(plan, 12)).toEqual(plan);
  });
});

describe('billableCredits', () => {
  it('bills the metered cost when under the hold', () => {
    expect(billableCredits(2000, 1500)).toBe(1500);
  });
  it('never bills more than the hold', () => {
    expect(billableCredits(2000, 2600)).toBe(2000);
  });
});
