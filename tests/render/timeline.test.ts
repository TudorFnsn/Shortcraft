import { describe, expect, it } from 'vitest';
import { END_HOLD_MS, MIN_SLOT_MS, fitSlotsToVoice } from '@/features/render/timeline';

const voiceEndingAt = (endMs: number) => [
  { word: 'first', startMs: 0, endMs: 400 },
  { word: 'last.', startMs: endMs - 300, endMs },
];
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('fitSlotsToVoice', () => {
  it('stretches the slots when the narration runs past the script plan', () => {
    // 3 × 5s planned, but the voice speaks for 17.2s: the old cut lost the ending.
    const slots = fitSlotsToVoice([5000, 5000, 5000], voiceEndingAt(17_200));
    expect(sum(slots)).toBe(17_200 + END_HOLD_MS);
    expect(slots[0]).toBeCloseTo(slots[1]!, -1);
  });

  it('trims dead air when the narration ends early', () => {
    const slots = fitSlotsToVoice([6000, 6000, 6000], voiceEndingAt(12_000));
    expect(sum(slots)).toBe(12_000 + END_HOLD_MS);
  });

  it('never ends before the last word, even at the slot floor', () => {
    const slots = fitSlotsToVoice([6000, 6000, 6000, 6000], voiceEndingAt(2000));
    expect(slots.every((ms) => ms >= MIN_SLOT_MS)).toBe(true);
    expect(sum(slots)).toBeGreaterThanOrEqual(2000 + END_HOLD_MS);
  });

  it('keeps the plan when there are no word timings', () => {
    expect(fitSlotsToVoice([4000, 6000], [])).toEqual([4000, 6000]);
  });
});
