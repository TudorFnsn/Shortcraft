/**
 * Render orchestrator — drives one job through the state machine.
 *
 * Flow: reserve credits → scripting → images → clips → voiceover → subtitles →
 * stitching → done, settling credits against real cost at the end. Any failure
 * marks the job FAILED and refunds the whole hold.
 *
 * Mocks complete inline, so this runs the entire pipeline synchronously today.
 * When live async providers land, the ASYNC branch becomes "persist provider job
 * id + return; resume from a webhook" — the state machine and credit flow here
 * are unchanged.
 */
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
import type { ProviderContext, ProviderOutcome, RenderClip } from '@/features/providers/types';
import { refundJob, reserveForJob, settleJob } from '@/features/credits/service';
import { advance } from './machine';
import { billableCredits, estimateJobCredits, fitScenesToBudget } from './pricing';
import type { PlanRepository } from '@/features/billing/entitlements';
import type { CreditRepository, RenderJobRecord, RenderRepository } from './repository';

export interface OrchestratorDeps {
  repo: RenderRepository;
  credits: CreditRepository;
  plans: PlanRepository;
}

/** Mocks always complete inline; unwrap or fail loudly until async is wired. */
function inline<T>(outcome: ProviderOutcome<T>): { output: T; costUsd: number } {
  if (outcome.kind !== 'completed') {
    throw new Error('async provider outcomes are not yet supported by the orchestrator');
  }
  return { output: outcome.output, costUsd: outcome.costUsd };
}

const modelIdFor = (kind: 'image' | 'video', tier: ModelTier) => `${kind}-${tier}`;

export async function runRenderJob(
  deps: OrchestratorDeps,
  jobId: string,
): Promise<Result<RenderJobRecord, AppError>> {
  const { repo, credits, plans } = deps;
  const log = logger.with({ jobId });

  const job = await repo.getJob(jobId);
  if (!job) return err(appError('not_found', `render job ${jobId} not found`));
  if (job.status !== 'draft') {
    return err(appError('invalid_input', `job is already ${job.status}`));
  }

  const estimate = estimateJobCredits({
    targetDurationSec: job.targetDurationSec,
    modelTier: job.modelTier,
  });

  const reserved = await reserveForJob(credits, job.userId, jobId, estimate);
  if (!reserved.ok) {
    await repo.updateJob(jobId, { status: 'failed', error: reserved.error.code });
    return reserved;
  }
  await repo.updateJob(jobId, { estimatedCredits: estimate });

  let charged = 0;
  let apiCostUsd = 0;
  const ctx = (step: string, sceneId = ''): ProviderContext => ({
    idempotencyKey: `${jobId}:${step}:${sceneId}`,
  });

  try {
    // 1. scripting ----------------------------------------------------------
    await repo.updateJob(jobId, { status: 'scripting' });
    const script = getScriptProvider();
    const scriptInput = {
      topic: job.topic,
      themeId: job.themeId,
      targetDurationSec: job.targetDurationSec,
      language: job.language,
    };
    const scriptRes = inline(await script.run(scriptInput, ctx('scripting')));
    charged += script.costCredits(scriptInput);
    apiCostUsd += scriptRes.costUsd;
    await repo.updateJob(jobId, { title: scriptRes.output.title });
    const plannedScenes = fitScenesToBudget(scriptRes.output.scenes, job.targetDurationSec);
    const scenes = await repo.addScenes(
      jobId,
      plannedScenes.map((s) => ({
        idx: s.index,
        narration: s.narration,
        imagePrompt: s.imagePrompt,
        motionPrompt: s.motionPrompt,
        durationSec: s.durationSec,
      })),
    );

    // 2. images -------------------------------------------------------------
    await repo.updateJob(jobId, { status: advance('scripting') }); // 'images'
    const image = getImageProvider(modelIdFor('image', job.modelTier));
    for (const scene of scenes) {
      const input = { prompt: scene.imagePrompt, aspectRatio: '9:16' as const };
      const res = inline(await image.run(input, ctx('images', scene.id)));
      charged += image.costCredits(input);
      apiCostUsd += res.costUsd;
      await repo.updateScene(scene.id, { imageUrl: res.output.imageUrl });
      scene.imageUrl = res.output.imageUrl;
    }

    // 3. clips: AI video (premium) or an animated still (standard) ----------
    await repo.updateJob(jobId, { status: advance('images') }); // 'clips'
    const video = getVideoProvider(modelIdFor('video', job.modelTier));
    const clips: RenderClip[] = [];
    let cursorMs = 0;
    for (const scene of scenes) {
      if (!scene.imageUrl) throw new Error(`scene ${scene.id} missing image`);
      const input = {
        imageUrl: scene.imageUrl,
        motionPrompt: scene.motionPrompt,
        durationSec: scene.durationSec,
      };
      const res = inline(await video.run(input, ctx('clips', scene.id)));
      charged += video.costCredits(input);
      apiCostUsd += res.costUsd;
      const durationMs = scene.durationSec * 1000;
      const out = res.output;
      if (out.kind === 'video') {
        await repo.updateScene(scene.id, { videoUrl: out.videoUrl, status: 'done' });
        clips.push({ kind: 'video', videoUrl: out.videoUrl, startMs: cursorMs, durationMs });
      } else {
        await repo.updateScene(scene.id, { status: 'done' }); // the image IS the scene
        clips.push({
          kind: 'still',
          imageUrl: out.imageUrl,
          motion: out.motion,
          startMs: cursorMs,
          durationMs,
        });
      }
      cursorMs += durationMs;
    }

    // 4. voiceover ----------------------------------------------------------
    await repo.updateJob(jobId, { status: advance('clips') }); // 'voiceover'
    const voice = getVoiceProvider();
    const narration = scenes.map((s) => s.narration).join(' ');
    const voiceInput = { text: narration, voiceId: 'default', language: job.language };
    const voiceRes = inline(await voice.run(voiceInput, ctx('voiceover')));
    charged += voice.costCredits(voiceInput);
    apiCostUsd += voiceRes.costUsd;
    await repo.updateJob(jobId, {
      voiceoverUrl: voiceRes.output.audioUrl,
      words: voiceRes.output.words,
    });

    // 5. subtitles (timings already produced; burned in during render) ------
    await repo.updateJob(jobId, { status: advance('voiceover') }); // 'subtitles'

    // 6. stitching ----------------------------------------------------------
    await repo.updateJob(jobId, { status: advance('subtitles') }); // 'stitching'
    const render = getRenderProvider();
    const renderInput = {
      clips,
      voiceoverUrl: voiceRes.output.audioUrl,
      words: voiceRes.output.words,
      subtitleStyleId: 'default',
      aspectRatio: '9:16' as const,
      // Decided at render time, so a user who upgrades mid-job gets a clean video.
      brandWatermark: !(await plans.hasPaid(job.userId)),
    };
    const renderRes = inline(await render.run(renderInput, ctx('stitching')));
    charged += render.costCredits(renderInput);
    apiCostUsd += renderRes.costUsd;
    const asset = await repo.saveAsset({
      userId: job.userId,
      jobId,
      kind: 'final',
      url: renderRes.output.videoUrl,
    });

    // 7. settle + done ------------------------------------------------------
    // The hold is the ceiling: an overrun is our margin leak, never the user's debt.
    const billed = billableCredits(estimate, charged);
    if (billed < charged) {
      log.warn('metered credits exceeded the hold; capped', { charged, estimate });
    }
    await settleJob(credits, job.userId, jobId, estimate, billed);
    await repo.updateJob(jobId, {
      status: advance('stitching'), // 'done'
      outputAssetUrl: asset.url,
      actualCredits: billed,
      apiCostUsd: round4(apiCostUsd),
    });

    log.info('render job completed', { charged, billed, estimate, apiCostUsd });
    const done = await repo.getJob(jobId);
    return done ? ok(done) : err(appError('internal', 'job vanished after completion'));
  } catch (cause) {
    log.error('render job failed', { cause: String(cause) });
    await refundJob(credits, job.userId, jobId, estimate);
    await repo.updateJob(jobId, {
      status: 'failed',
      error: cause instanceof Error ? cause.message : String(cause),
      apiCostUsd: round4(apiCostUsd),
    });
    return err(appError('provider_failed', 'Video generation failed; credits refunded.', cause));
  }
}

const round4 = (n: number): number => Math.round(n * 10_000) / 10_000;

/** Re-exported so callers can validate a model id exists before enqueueing. */
export { getModel };
