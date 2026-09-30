/**
 * Up-front credit estimate for a job, used to place the reserve hold before we
 * know the exact scene list.
 *
 * The estimate is an UPPER BOUND on what a job can charge: the orchestrator fits
 * the script's scene plan inside the same budget (`fitScenesToBudget`) and caps
 * the final charge at the hold (`billableCredits`), so a settle can only ever
 * refund — never push a balance below zero.
 */
import { defaultModelFor, type ModelTier } from '@/config/models';

export interface JobEstimateInput {
  targetDurationSec: number;
  modelTier: ModelTier;
}

/** Longest clip a single scene may request. The estimate prices every scene at this. */
export const MAX_SCENE_SEC = 6;

/** Same heuristic the script step uses, so the estimate tracks reality closely. */
export function estimateSceneCount(targetDurationSec: number): number {
  return Math.max(2, Math.round(targetDurationSec / MAX_SCENE_SEC));
}

export function estimateJobCredits(input: JobEstimateInput): number {
  const scenes = estimateSceneCount(input.targetDurationSec);

  const script = defaultModelFor('script');
  const image = defaultModelFor('image', input.modelTier);
  const video = defaultModelFor('video', input.modelTier);
  const voice = defaultModelFor('voice');
  const render = defaultModelFor('render');

  // Price every scene at its maximum length; voiceover is budgeted to cover the
  // whole runtime. Anything beyond this is capped at settle time.
  const perScene =
    image.creditsPerUnit +
    video.creditsPerUnit * MAX_SCENE_SEC +
    voice.creditsPerUnit * MAX_SCENE_SEC;

  return script.creditsPerUnit + scenes * perScene + render.creditsPerUnit;
}

/**
 * Clamp a script's scene plan to what the estimate paid for: at most
 * `estimateSceneCount` scenes, each at most MAX_SCENE_SEC long. Guards the hold
 * against a script model that over-delivers.
 */
export function fitScenesToBudget<S extends { durationSec: number }>(
  scenes: readonly S[],
  targetDurationSec: number,
): S[] {
  return scenes
    .slice(0, estimateSceneCount(targetDurationSec))
    .map((s) => ({ ...s, durationSec: Math.min(s.durationSec, MAX_SCENE_SEC) }));
}

/** What the user is actually billed: the metered cost, never more than the hold. */
export function billableCredits(estimate: number, metered: number): number {
  return Math.min(estimate, metered);
}
