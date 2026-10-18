/**
 * Redo one scene (Studio): make a new version of a finished video where one
 * scene gets a new picture (and, on Premium, a new AI clip), optionally from an
 * edited picture description.
 *
 * Same mechanism as re-voice: a child job (`parent_job_id`) with copies of the
 * source scenes. Every other scene keeps its picture/clip, and the child also
 * keeps the source's voiceover and word timings, so only the redone scene and
 * the final cut run, at the fixed price (`estimateSceneRedoCredits`). The child
 * starts at `images`; the images and clips steps only touch scenes that aren't
 * done, and the voiceover step skips a child that already has one.
 */
import { appError, err, ok, type AppError, type Result } from '@/lib/result';
import { estimateSceneRedoCredits } from './pricing';
import type { RenderJobRecord, RenderRepository, SceneRecord } from './repository';

/** Longest picture description a creator may write for a redone scene. */
export const MAX_IMAGE_PROMPT_CHARS = 1000;

export interface SceneRedo {
  idx: number;
  /** A new picture description; omitted = the same description, a fresh picture. */
  imagePrompt?: string;
}

export interface PlannedRedo {
  idx: number;
  imagePrompt: string;
  /** True when the creator wrote a new description (it must be screened). */
  promptChanged: boolean;
  credits: number;
}

/** Validates a redo against the source's scenes and prices it. Pure. */
export function planSceneRedo(
  source: Pick<RenderJobRecord, 'modelTier'>,
  scenes: readonly Pick<SceneRecord, 'idx' | 'imagePrompt' | 'durationSec'>[],
  redo: SceneRedo,
): Result<PlannedRedo, AppError> {
  const scene = scenes.find((s) => s.idx === redo.idx);
  if (!scene) return err(appError('invalid_input', `There is no scene ${redo.idx + 1}.`));
  const edited = redo.imagePrompt?.replace(/\s+/g, ' ').trim();
  if (edited !== undefined && !edited) {
    return err(appError('invalid_input', `Describe the picture for scene ${redo.idx + 1}.`));
  }
  if (edited && edited.length > MAX_IMAGE_PROMPT_CHARS) {
    return err(
      appError(
        'invalid_input',
        `Keep the picture description under ${MAX_IMAGE_PROMPT_CHARS} characters.`,
      ),
    );
  }
  const imagePrompt = edited ?? scene.imagePrompt;
  return ok({
    idx: scene.idx,
    imagePrompt,
    promptChanged: imagePrompt !== scene.imagePrompt,
    credits: estimateSceneRedoCredits(source.modelTier, scene.durationSec),
  });
}

/** True for a child job that redoes scenes: some of its copied scenes aren't rendered. */
export const isSceneRedo = (
  job: Pick<RenderJobRecord, 'parentJobId'>,
  scenes: readonly Pick<SceneRecord, 'status'>[],
): boolean => job.parentJobId !== null && scenes.some((s) => s.status !== 'done');

/** The fixed price a scene-redo child holds (and bills). */
export function sceneRedoCredits(
  job: Pick<RenderJobRecord, 'modelTier'>,
  scenes: readonly Pick<SceneRecord, 'status' | 'durationSec'>[],
): number {
  return scenes
    .filter((s) => s.status !== 'done')
    .reduce((n, s) => n + estimateSceneRedoCredits(job.modelTier, s.durationSec), 0);
}

/** Writes the child job and its copied scenes. Returns the new draft job. */
export async function createSceneRedoJob(
  repo: RenderRepository,
  source: RenderJobRecord,
  sourceScenes: readonly SceneRecord[],
  redo: Pick<PlannedRedo, 'idx' | 'imagePrompt'>,
): Promise<RenderJobRecord> {
  if (!source.voiceoverUrl) throw new Error('a scene redo needs the source voiceover');
  const ordered = [...sourceScenes].sort((a, b) => a.idx - b.idx);
  const job = await repo.createJob({
    userId: source.userId,
    topic: source.topic,
    themeId: source.themeId,
    targetDurationSec: source.targetDurationSec,
    language: source.language,
    modelTier: source.modelTier,
    parentJobId: source.id,
    voiceId: source.voiceId ?? undefined,
    voiceSettings: source.voiceSettings ?? undefined,
  });
  // The narration is unchanged, so the voiceover and its captions are reused.
  await repo.updateJob(job.id, {
    title: source.title,
    voiceoverUrl: source.voiceoverUrl,
    words: source.words,
  });
  const copies = await repo.addScenes(
    job.id,
    ordered.map((s) => ({
      idx: s.idx,
      narration: s.narration,
      imagePrompt: s.idx === redo.idx ? redo.imagePrompt : s.imagePrompt,
      motionPrompt: s.motionPrompt,
      durationSec: s.durationSec,
    })),
  );
  // Every other scene is reused as it is; the redone one stays pending, with no picture.
  await Promise.all(
    copies
      .filter((copy) => copy.idx !== redo.idx)
      .map((copy) => {
        const from = ordered.find((s) => s.idx === copy.idx)!;
        return repo.updateScene(copy.id, {
          imageUrl: from.imageUrl,
          videoUrl: from.videoUrl,
          clipDurationMs: from.clipDurationMs,
          status: 'done',
        });
      }),
  );
  return {
    ...job,
    title: source.title,
    voiceoverUrl: source.voiceoverUrl,
    words: source.words,
  };
}
