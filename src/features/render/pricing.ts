/**
 * Up-front credit estimate for a job, used to place the reserve hold before we
 * know the exact scene list. The orchestrator settles against the real per-step
 * costs afterwards, refunding any over-hold.
 */
import { defaultModelFor, type ModelTier } from '@/config/models';

export interface JobEstimateInput {
  targetDurationSec: number;
  modelTier: ModelTier;
}

/** Same heuristic the script step uses, so the estimate tracks reality closely. */
export function estimateSceneCount(targetDurationSec: number): number {
  return Math.max(2, Math.round(targetDurationSec / 6));
}

export function estimateJobCredits(input: JobEstimateInput): number {
  const scenes = estimateSceneCount(input.targetDurationSec);
  const secPerScene = Math.max(1, Math.round(input.targetDurationSec / scenes));

  const script = defaultModelFor('script');
  const image = defaultModelFor('image', input.modelTier);
  const video = defaultModelFor('video', input.modelTier);
  const voice = defaultModelFor('voice');
  const render = defaultModelFor('render');

  const perScene =
    image.creditsPerUnit + video.creditsPerUnit * secPerScene + voice.creditsPerUnit * secPerScene;

  return script.creditsPerUnit + scenes * perScene + render.creditsPerUnit;
}
