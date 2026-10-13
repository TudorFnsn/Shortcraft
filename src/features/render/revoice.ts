/**
 * Re-voice (Voice Studio V3): make a new version of a finished video with
 * edited narration and/or another voice, reusing its images and clips.
 *
 * The new version is a child job (`parent_job_id`) with copies of the source
 * scenes (images, clips, durations) and the new narration. It starts at the
 * `voiceover` step, so only the voice and the final cut run, at the fixed
 * re-voice price (`estimateRevoiceCredits`). The original video is untouched.
 */
import { appError, err, ok, type AppError, type Result } from '@/lib/result';
import type { VoiceSettings } from '@/config/voices';
import type { RenderJobRecord, RenderRepository, SceneRecord } from './repository';

/** A scene's narration may grow by this much (so the voice and the hold stay bounded)… */
export const NARRATION_GROWTH = 1.3;
/** …plus this many characters, so a very short line can still be fixed. */
export const NARRATION_SLACK_CHARS = 20;

export interface NarrationEdit {
  idx: number;
  narration: string;
}

export const maxNarrationLength = (original: string): number =>
  Math.ceil(original.length * NARRATION_GROWTH) + NARRATION_SLACK_CHARS;

/**
 * The narration of every scene after the edits, in scene order. Pure.
 * Rejects edits to scenes that don't exist, duplicate edits, empty lines and
 * lines that grow past `maxNarrationLength`.
 */
export function planNarration(
  scenes: readonly Pick<SceneRecord, 'idx' | 'narration'>[],
  edits: readonly NarrationEdit[],
): Result<{ narrations: string[]; changed: NarrationEdit[] }, AppError> {
  const byIdx = new Map(scenes.map((s) => [s.idx, s]));
  const seen = new Set<number>();
  const next = new Map<number, string>();
  for (const e of edits) {
    const scene = byIdx.get(e.idx);
    if (!scene) return err(appError('invalid_input', `There is no scene ${e.idx + 1}.`));
    if (seen.has(e.idx))
      return err(appError('invalid_input', `Scene ${e.idx + 1} is edited twice.`));
    seen.add(e.idx);
    const text = e.narration.replace(/\s+/g, ' ').trim();
    if (!text) return err(appError('invalid_input', `Scene ${e.idx + 1} needs some narration.`));
    if (text.length > maxNarrationLength(scene.narration)) {
      return err(
        appError(
          'invalid_input',
          `Scene ${e.idx + 1} is too long for this video; shorten it to ${maxNarrationLength(scene.narration)} characters.`,
        ),
      );
    }
    next.set(e.idx, text);
  }
  const ordered = [...scenes].sort((a, b) => a.idx - b.idx);
  const changed = ordered
    .filter((s) => next.has(s.idx) && next.get(s.idx) !== s.narration)
    .map((s) => ({ idx: s.idx, narration: next.get(s.idx)! }));
  return ok({ narrations: ordered.map((s) => next.get(s.idx) ?? s.narration), changed });
}

/** Writes the child job and its copied scenes. Returns the new draft job. */
export async function createRevoiceJob(
  repo: RenderRepository,
  source: RenderJobRecord,
  sourceScenes: readonly SceneRecord[],
  narrations: readonly string[],
  voice: { voiceId?: string; voiceSettings?: VoiceSettings },
): Promise<RenderJobRecord> {
  const ordered = [...sourceScenes].sort((a, b) => a.idx - b.idx);
  const job = await repo.createJob({
    userId: source.userId,
    topic: source.topic,
    themeId: source.themeId,
    targetDurationSec: source.targetDurationSec,
    language: source.language,
    modelTier: source.modelTier,
    parentJobId: source.id,
    // A new voice choice wins; otherwise keep the source's voice.
    voiceId: voice.voiceId ?? source.voiceId ?? undefined,
    voiceSettings: voice.voiceSettings ?? source.voiceSettings ?? undefined,
  });
  if (source.title) await repo.updateJob(job.id, { title: source.title });
  const copies = await repo.addScenes(
    job.id,
    ordered.map((s, i) => ({
      idx: s.idx,
      narration: narrations[i]!,
      imagePrompt: s.imagePrompt,
      motionPrompt: s.motionPrompt,
      durationSec: s.durationSec,
    })),
  );
  // The pictures and clips are reused as they are: the scene is already rendered.
  await Promise.all(
    copies.map((copy) => {
      const from = ordered.find((s) => s.idx === copy.idx)!;
      return repo.updateScene(copy.id, {
        imageUrl: from.imageUrl,
        videoUrl: from.videoUrl,
        clipDurationMs: from.clipDurationMs,
        status: 'done',
      });
    }),
  );
  return { ...job, title: source.title };
}
