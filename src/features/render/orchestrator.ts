/**
 * Render orchestrator — drives a job through the state machine, one step at a time.
 *
 * Flow: reserve credits → scripting → images → clips → voiceover → subtitles →
 * stitching → done, settling credits against the metered charge at the end. Any
 * failure marks the job FAILED and refunds the whole hold.
 *
 * Resumable: `advanceJob` does the next unit of work for the job's current
 * status and persists everything it learned (scenes, urls, credits charged, API
 * cost, in-flight provider jobs), so the next call can run in another request.
 * AI clips are the reason: a Premium clip takes minutes, so the clips step
 * submits every scene, then each later call polls them until all are done.
 *
 * A lease makes a step exclusive: the background run after POST /api/jobs and
 * the cron sweep can both try to advance a job, but only the lease holder runs,
 * so no step (and no provider call we pay for) executes twice concurrently.
 * `driveJob` loops `advanceJob` for a time budget; `runRenderJob` drives to the
 * end (tests, scripts, mock mode).
 */
import { randomUUID } from 'node:crypto';
import { getModel, type ModelTier } from '@/config/models';
import { logger } from '@/lib/logger';
import { appError, err, ok, type AppError, type Result } from '@/lib/result';
import {
  getImageProvider,
  getRenderProvider,
  getScriptProvider,
  getVideoProvider,
  getVoiceProvider,
} from '@/features/providers/registry';
import type {
  ProviderContext,
  ProviderOutcome,
  RenderClip,
  VideoOutput,
} from '@/features/providers/types';
import { refundJob, reserveForJob, settleJob } from '@/features/credits/service';
import { advance, isTerminal, type RenderStatus } from './machine';
import { billableCredits, estimateJobCredits, fitScenesToBudget } from './pricing';
import type { PlanRepository } from '@/features/billing/entitlements';
import type {
  CreditRepository,
  RenderJobRecord,
  RenderRepository,
  SceneRecord,
} from './repository';

export interface OrchestratorDeps {
  repo: RenderRepository;
  credits: CreditRepository;
  plans: PlanRepository;
}

/** Long enough for the slowest single step (a 60s render), short enough to recover fast. */
export const LEASE_MS = 3 * 60_000;
/** How often a waiting job re-checks its in-flight AI clips. */
export const POLL_MS = 5_000;

export interface StepOutcome {
  job: RenderJobRecord;
  /** True while provider jobs are still running: call again after a pause. */
  waiting: boolean;
  /** Another worker holds the lease; nothing was done. */
  busy?: boolean;
}

/** Steps that must finish inline (script, images, voice, render). */
function inline<T>(outcome: ProviderOutcome<T>): { output: T; costUsd: number } {
  if (outcome.kind !== 'completed') {
    throw new Error('this step expects its provider to complete inline');
  }
  return { output: outcome.output, costUsd: outcome.costUsd };
}

const modelIdFor = (kind: 'image' | 'video', tier: ModelTier) => `${kind}-${tier}`;
const sum = (items: { credits: number; usd: number }[]): [number, number] => [
  items.reduce((n, i) => n + i.credits, 0),
  items.reduce((n, i) => n + i.usd, 0),
];
const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

/**
 * Records metered credits + API cost on the job. Called once per step with the
 * step's totals (never from parallel branches, whose writes could land out of order).
 */
function meter(repo: RenderRepository, job: RenderJobRecord) {
  return async (credits: number, costUsd: number) => {
    job.chargedCredits += credits;
    job.apiCostUsd = round4(job.apiCostUsd + costUsd);
    await repo.updateJob(job.id, {
      chargedCredits: job.chargedCredits,
      apiCostUsd: job.apiCostUsd,
    });
  };
}

/** Advance the job by one step under its lease. */
export async function advanceJob(
  deps: OrchestratorDeps,
  jobId: string,
): Promise<Result<StepOutcome, AppError>> {
  const owner = randomUUID();
  const claimed = await deps.repo.claimJob(jobId, owner, LEASE_MS);
  const job = await deps.repo.getJob(jobId);
  if (!job) return err(appError('not_found', `render job ${jobId} not found`));
  if (!claimed) return ok({ job, waiting: true, busy: true });
  try {
    return await step(deps, job);
  } finally {
    await deps.repo.releaseJob(jobId, owner);
  }
}

async function step(
  deps: OrchestratorDeps,
  job: RenderJobRecord,
): Promise<Result<StepOutcome, AppError>> {
  const { repo, credits } = deps;
  const log = logger.with({ jobId: job.id, status: job.status });
  if (isTerminal(job.status)) return ok({ job, waiting: false });

  if (job.status === 'draft') {
    const estimate = estimateJobCredits({
      targetDurationSec: job.targetDurationSec,
      modelTier: job.modelTier,
    });
    const reserved = await reserveForJob(credits, job.userId, job.id, estimate);
    if (!reserved.ok) {
      await repo.updateJob(job.id, { status: 'failed', error: reserved.error.code });
      return reserved;
    }
    await repo.updateJob(job.id, { estimatedCredits: estimate, status: 'scripting' });
    return ok({ job: { ...job, estimatedCredits: estimate, status: 'scripting' }, waiting: false });
  }

  try {
    const waiting = await runStep(deps, job);
    const next = waiting ? job.status : nextStatus(job.status);
    // 'done' is written by the stitching step itself, before the settle.
    if (!waiting && next !== 'done') await repo.updateJob(job.id, { status: next });
    if (next === 'done') log.info('render job completed', { apiCostUsd: job.apiCostUsd });
    return ok({ job: { ...job, status: next }, waiting });
  } catch (cause) {
    log.error('render job failed', { cause: String(cause) });
    await refundJob(credits, job.userId, job.id, job.estimatedCredits);
    await repo.updateJob(job.id, {
      status: 'failed',
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return err(appError('provider_failed', 'Video generation failed; credits refunded.', cause));
  }
}

const nextStatus = (s: RenderStatus): RenderStatus => advance(s);

/** Does the work for `job.status`. Returns true while waiting on providers. */
async function runStep(deps: OrchestratorDeps, job: RenderJobRecord): Promise<boolean> {
  const { repo } = deps;
  const charge = meter(repo, job);
  const ctx = (stepName: string, sceneId = ''): ProviderContext => ({
    idempotencyKey: `${job.id}:${stepName}:${sceneId}`,
  });

  switch (job.status) {
    case 'scripting': {
      // A retried step must not script (and add scenes) twice.
      if ((await repo.listScenes(job.id)).length > 0) return false;
      const script = getScriptProvider();
      const input = {
        topic: job.topic,
        themeId: job.themeId,
        targetDurationSec: job.targetDurationSec,
        language: job.language,
      };
      const res = inline(await script.run(input, ctx('scripting')));
      await repo.updateJob(job.id, { title: res.output.title });
      const planned = fitScenesToBudget(res.output.scenes, job.targetDurationSec);
      await repo.addScenes(
        job.id,
        planned.map((s) => ({
          idx: s.index,
          narration: s.narration,
          imagePrompt: s.imagePrompt,
          motionPrompt: s.motionPrompt,
          durationSec: s.durationSec,
        })),
      );
      await charge(script.costCredits(input), res.costUsd);
      return false;
    }

    case 'images': {
      const image = getImageProvider(modelIdFor('image', job.modelTier));
      const todo = (await repo.listScenes(job.id)).filter((s) => !s.imageUrl);
      const costs = await Promise.all(
        todo.map(async (scene) => {
          const input = { prompt: scene.imagePrompt, aspectRatio: '9:16' as const };
          const res = inline(await image.run(input, ctx('images', scene.id)));
          await repo.updateScene(scene.id, { imageUrl: res.output.imageUrl });
          return { credits: image.costCredits(input), usd: res.costUsd };
        }),
      );
      await charge(...sum(costs));
      return false;
    }

    case 'clips': {
      // Submit every scene that hasn't started; poll the ones in flight. In
      // parallel, so a video waits about as long as its slowest clip.
      const video = getVideoProvider(modelIdFor('video', job.modelTier));
      const todo = (await repo.listScenes(job.id)).filter((s) => s.status !== 'done');
      const results = await Promise.all(
        todo.map(async (scene): Promise<{ pending: boolean; credits: number; usd: number }> => {
          if (!scene.imageUrl) throw new Error(`scene ${scene.id} missing image`);
          const input = {
            imageUrl: scene.imageUrl,
            motionPrompt: scene.motionPrompt,
            durationSec: scene.durationSec,
          };
          let output: VideoOutput;
          let costUsd: number;
          if (scene.videoJob) {
            const res = await video.poll({ providerId: video.id, providerJobId: scene.videoJob });
            if (res.status === 'pending') return { pending: true, credits: 0, usd: 0 };
            if (res.status === 'failed') throw new Error(`scene ${scene.idx}: ${res.reason}`);
            ({ output, costUsd } = res);
          } else {
            const res = await video.run(input, ctx('clips', scene.id));
            if (res.kind === 'async') {
              await repo.updateScene(scene.id, { videoJob: res.job.providerJobId });
              return { pending: true, credits: 0, usd: 0 };
            }
            ({ output, costUsd } = res);
          }
          await repo.updateScene(scene.id, {
            status: 'done',
            videoJob: null,
            ...(output.kind === 'video'
              ? { videoUrl: output.videoUrl, clipDurationMs: output.durationSec * 1000 }
              : {}), // a still: the scene image IS the clip
          });
          return { pending: false, credits: video.costCredits(input), usd: costUsd };
        }),
      );
      await charge(...sum(results));
      return results.some((r) => r.pending);
    }

    case 'voiceover': {
      const voice = getVoiceProvider();
      const scenes = await repo.listScenes(job.id);
      const input = {
        text: scenes.map((s) => s.narration).join(' '),
        voiceId: 'default',
        language: job.language,
      };
      const res = inline(await voice.run(input, ctx('voiceover')));
      await repo.updateJob(job.id, {
        voiceoverUrl: res.output.audioUrl,
        words: res.output.words,
      });
      await charge(voice.costCredits(input), res.costUsd);
      return false;
    }

    case 'subtitles':
      // Timings came with the voiceover; captions are burned in while stitching.
      return false;

    case 'stitching': {
      const fresh = await repo.getJob(job.id);
      if (!fresh?.voiceoverUrl) throw new Error('voiceover missing at stitching');
      const clips = await buildClips(job, await repo.listScenes(job.id));
      const render = getRenderProvider();
      const input = {
        clips,
        voiceoverUrl: fresh.voiceoverUrl,
        words: fresh.words ?? [],
        subtitleStyleId: 'default',
        aspectRatio: '9:16' as const,
        // Decided at render time, so a user who upgrades mid-job gets a clean video.
        brandWatermark: !(await deps.plans.hasPaid(job.userId)),
      };
      const res = inline(await render.run(input, ctx('stitching')));
      await charge(render.costCredits(input), res.costUsd);
      const asset = await repo.saveAsset({
        userId: job.userId,
        jobId: job.id,
        kind: 'final',
        url: res.output.videoUrl,
      });

      // The hold is the ceiling: an overrun is our margin leak, never the user's debt.
      const billed = billableCredits(job.estimatedCredits, job.chargedCredits);
      if (billed < job.chargedCredits) {
        logger.warn('metered credits exceeded the hold; capped', {
          jobId: job.id,
          charged: job.chargedCredits,
          estimate: job.estimatedCredits,
        });
      }
      // Settle LAST: a failure before it refunds the hold, so nothing may fail after it
      // (a refund on top of a settle would hand the video out for free).
      await repo.updateJob(job.id, {
        outputAssetUrl: asset.url,
        actualCredits: billed,
        status: 'done',
      });
      await settleJob(deps.credits, job.userId, job.id, job.estimatedCredits, billed);
      return false;
    }

    default:
      throw new Error(`no step for status "${job.status}"`);
  }
}

/** Scene → render clip: an AI clip when the scene has one, else its animated still. */
async function buildClips(job: RenderJobRecord, scenes: SceneRecord[]): Promise<RenderClip[]> {
  // The still's camera move is a pure function of the scene (local, free).
  const still = getVideoProvider(modelIdFor('video', 'standard'));
  const clips: RenderClip[] = [];
  let startMs = 0;
  for (const scene of scenes) {
    const durationMs = scene.durationSec * 1000;
    if (scene.videoUrl) {
      clips.push({
        kind: 'video',
        videoUrl: scene.videoUrl,
        startMs,
        durationMs,
        ...(scene.clipDurationMs ? { sourceDurationMs: scene.clipDurationMs } : {}),
      });
    } else {
      if (!scene.imageUrl) throw new Error(`scene ${scene.id} missing image`);
      const res = inline(
        await still.run(
          {
            imageUrl: scene.imageUrl,
            motionPrompt: scene.motionPrompt,
            durationSec: scene.durationSec,
          },
          { idempotencyKey: `${job.id}:still:${scene.id}` },
        ),
      );
      if (res.output.kind !== 'still') throw new Error('expected an animated still');
      clips.push({
        kind: 'still',
        imageUrl: res.output.imageUrl,
        motion: res.output.motion,
        startMs,
        durationMs,
      });
    }
    startMs += durationMs;
  }
  return clips;
}

/**
 * Advance until the job finishes, the budget runs out, or another worker holds
 * it. Returns the last step's result. Whatever is left, the cron sweep resumes.
 */
export async function driveJob(
  deps: OrchestratorDeps,
  jobId: string,
  opts: { budgetMs?: number; pollMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Result<StepOutcome, AppError>> {
  const deadline = Date.now() + (opts.budgetMs ?? Number.POSITIVE_INFINITY);
  const pollMs = opts.pollMs ?? POLL_MS;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (;;) {
    const res = await advanceJob(deps, jobId);
    if (!res.ok || res.value.busy || isTerminal(res.value.job.status)) return res;
    if (res.value.waiting) {
      if (Date.now() + pollMs >= deadline) return res;
      await sleep(pollMs);
    } else if (Date.now() >= deadline) {
      return res;
    }
  }
}

/** Drive a job to the end (tests, scripts, mock mode). */
export async function runRenderJob(
  deps: OrchestratorDeps,
  jobId: string,
  opts: { pollMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<Result<RenderJobRecord, AppError>> {
  const job = await deps.repo.getJob(jobId);
  if (!job) return err(appError('not_found', `render job ${jobId} not found`));
  if (job.status !== 'draft') return err(appError('invalid_input', `job is already ${job.status}`));
  const res = await driveJob(deps, jobId, opts);
  if (!res.ok) return res;
  const done = await deps.repo.getJob(jobId);
  if (!done) return err(appError('internal', 'job vanished'));
  return done.status === 'done'
    ? ok(done)
    : err(appError('internal', `job stopped at "${done.status}"`));
}

/** Re-exported so callers can validate a model id exists before enqueueing. */
export { getModel };
