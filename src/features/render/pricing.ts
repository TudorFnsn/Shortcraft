/**
 * Up-front credit estimate for a job, used to place the reserve hold before we
 * know the exact scene list.
 *
 * The estimate is an UPPER BOUND on what a job can charge: the orchestrator fits
 * the script's scene plan inside the same budget (`fitScenesToBudget`) and caps
 * the final charge at the hold (`billableCredits`), so a settle can only ever
 * refund — never push a balance below zero.
 */
import { MODELS, defaultModelFor, type ModelSpec, type ModelTier } from '@/config/models';
import { estimateSpeechSeconds } from '@/features/providers/mocks';

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
 * against a script model that over-delivers. Extra scenes come out of the
 * middle, never the end: the last scene is the video's conclusion.
 */
export function fitScenesToBudget<S extends { durationSec: number; index?: number }>(
  scenes: readonly S[],
  targetDurationSec: number,
): S[] {
  const max = estimateSceneCount(targetDurationSec);
  const kept = scenes.length > max ? [...scenes.slice(0, max - 1), scenes.at(-1)!] : scenes;
  return kept.map((s, i) => ({
    ...s,
    ...(s.index === undefined ? {} : { index: i }),
    durationSec: Math.min(s.durationSec, MAX_SCENE_SEC),
  }));
}

/** What the user is actually billed: the metered cost, never more than the hold. */
export function billableCredits(estimate: number, metered: number): number {
  return Math.min(estimate, metered);
}

/**
 * Re-voice pricing (Voice Studio V3): a re-voiced copy only runs the voice and
 * the final cut, so it is priced from their API cost at a fixed credit scale
 * instead of per-step credits. Voice and render are the steps with the most
 * API cost per credit, so standard rates would fail the 3x margin gate on Pro;
 * 13,000 credits per $ clears it on every plan (margin.ts checks re-voice as
 * its own job shape). The price is known up front (the text is known), so it
 * is a fixed quote: the hold is what the creator pays.
 */
export const REVOICE_CREDITS_PER_USD = 13_000;

export interface RevoiceBill {
  credits: number;
  costUsd: number;
}

export function revoiceBill(
  speechSeconds: number,
  models: readonly ModelSpec[] = MODELS,
): RevoiceBill {
  const voice = models.find((m) => m.kind === 'voice');
  const render = models.find((m) => m.kind === 'render');
  if (!voice || !render) throw new Error('re-voice needs a voice and a render model');
  const costUsd = speechSeconds * voice.costUsdPerUnit + render.costUsdPerUnit;
  return { credits: Math.ceil(costUsd * REVOICE_CREDITS_PER_USD), costUsd };
}

/** Credits to re-voice a video whose scenes will say `narrations`. */
export function estimateRevoiceCredits(narrations: readonly string[]): number {
  return revoiceBill(estimateSpeechSeconds(narrations.join(' '))).credits;
}

/**
 * Designed voices (Voice Studio V4). A design round asks ElevenLabs Voice
 * Design for 3 samples; it is billed by the characters of the sample text, so
 * its cost is an estimate until measured (`scripts/voice-design-smoke.mts`).
 * Priced on the same fixed scale as re-voice, so it can never break the margin
 * gate. Saving a voice costs us nothing per use but takes one of our
 * ElevenLabs custom-voice slots, a scarce plan resource: that price is a
 * product decision (owner, 2026-10-13), not cost-plus.
 */
export const VOICE_DESIGN_COST_USD_ESTIMATE = 0.025;
export const VOICE_DESIGN_ROUND_CREDITS = Math.ceil(
  VOICE_DESIGN_COST_USD_ESTIMATE * REVOICE_CREDITS_PER_USD,
);
export const SAVE_VOICE_CREDITS = 1_500;
