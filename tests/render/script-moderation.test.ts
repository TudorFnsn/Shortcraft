/**
 * A script model can write image/video prompts the user's topic never asked
 * for. The orchestrator must screen them after scripting: the job fails with the
 * whole hold refunded, and no image (or any later step) is ever generated.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ImageProvider, ScriptProvider } from '@/features/providers/types';
import { estimateJobCredits } from '@/features/render/pricing';

const USER = 'user-1';

async function runWithScript(imagePrompts: string[]) {
  vi.resetModules();
  const registry = await vi.importActual<typeof import('@/features/providers/registry')>(
    '@/features/providers/registry',
  );
  const script: ScriptProvider = {
    ...registry.getScriptProvider(),
    async run(input) {
      const scenes = imagePrompts.map((imagePrompt, index) => ({
        index,
        narration: `scene ${index + 1}`,
        imagePrompt,
        motionPrompt: 'slow push-in',
        durationSec: 4,
      }));
      return { kind: 'completed', output: { title: input.topic, scenes }, costUsd: 0.004 };
    },
  };
  const imageCalls: string[] = [];
  const realImage = registry.getImageProvider('image-standard');
  const image: ImageProvider = {
    ...realImage,
    async run(input, ctx) {
      imageCalls.push(input.prompt);
      return realImage.run(input, ctx);
    },
  };
  vi.doMock('@/features/providers/registry', () => ({
    ...registry,
    getScriptProvider: () => script,
    getImageProvider: () => image,
  }));
  const { runRenderJob } = await import('@/features/render/orchestrator');
  const { InMemoryStore } = await import('@/features/render/repository.memory');

  const store = new InMemoryStore();
  const start = 50_000;
  store.seedCredits(USER, start);
  const job = await store.createJob({
    userId: USER,
    topic: 'a dancer chases her dream',
    themeId: 'motivation',
    targetDurationSec: 12,
    language: 'en',
    modelTier: 'standard',
  });
  const res = await runRenderJob({ repo: store, credits: store, plans: store }, job.id);
  return { res, store, jobId: job.id, start, imageCalls };
}

describe('generated scene prompts are moderated before any image is made', () => {
  afterEach(() => {
    vi.doUnmock('@/features/providers/registry');
    vi.resetModules();
  });

  it('fails a job whose script asks for an explicit image, refunds it, and generates nothing', async () => {
    const { res, store, jobId, start, imageCalls } = await runWithScript([
      'a dancer warming up in an empty studio',
      // Over budget (12s → 2 scenes): extras go from the middle, the last scene stays.
      'applause from the crowd',
      'a nude woman posing on the stage',
    ]);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('provider_failed');
    const job = await store.getJob(jobId);
    expect(job?.status).toBe('failed');
    expect(job?.error).toBe('moderation_blocked: scene 2 prompt (sexual_explicit)');
    expect(job?.error).not.toContain('nude');
    expect(job?.apiCostUsd).toBeCloseTo(0.004);
    expect(await store.listScenes(jobId)).toHaveLength(0);
    expect(imageCalls).toHaveLength(0);
    expect(await store.balance(USER)).toBe(start);
  });

  it('lets a clean script through to a finished video', async () => {
    const { res, store, start, imageCalls } = await runWithScript([
      'a dancer warming up in an empty studio',
      'spotlight on the stage',
      'applause from the crowd',
    ]);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe('done');
    expect(imageCalls.length).toBeGreaterThan(0);
    expect(await store.balance(USER)).toBe(start - res.value.actualCredits);
    expect(res.value.actualCredits).toBeLessThanOrEqual(
      estimateJobCredits({ targetDurationSec: 12, modelTier: 'standard' }),
    );
  });
});
