/**
 * Fit the scene slots to the voiceover.
 *
 * The script guesses each scene's length before any audio exists, but the
 * renderer cuts the video at the sum of the slots — so narration that runs
 * longer than the guess loses its ending mid-sentence, and narration that runs
 * shorter leaves dead air. Once the voiceover is known, scale the slots so the
 * video ends a beat after the last spoken word.
 */
import type { WordTiming } from '@/features/providers/types';

/** Silence held after the last word so the conclusion lands instead of clipping. */
export const END_HOLD_MS = 800;

/** Shortest a scene may be squeezed to when the narration runs short. */
export const MIN_SLOT_MS = 1500;

export function fitSlotsToVoice(
  slotsMs: readonly number[],
  words: readonly WordTiming[],
): number[] {
  const lastWordEnd = words.reduce((end, w) => Math.max(end, w.endMs), 0);
  const total = slotsMs.reduce((sum, ms) => sum + ms, 0);
  // No timings (or no slots): nothing to fit to, keep the script's plan.
  if (lastWordEnd <= 0 || total <= 0) return [...slotsMs];

  const targetMs = lastWordEnd + END_HOLD_MS;
  const scale = targetMs / total;
  const scaled = slotsMs.map((ms) => Math.max(MIN_SLOT_MS, Math.round(ms * scale)));
  // Rounding and the floor can drift the sum: settle the remainder on the last
  // slot, but never below the voiceover's end.
  const drift = targetMs - scaled.reduce((sum, ms) => sum + ms, 0);
  const last = scaled.length - 1;
  scaled[last] = Math.max(MIN_SLOT_MS, scaled[last]! + drift);
  return scaled;
}
