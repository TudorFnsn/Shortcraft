/**
 * Regression: the reserve hold must be an upper bound on the final charge for
 * every length/tier a user can pick, so a settle never pushes a balance below
 * zero. (Before this, a 15s job reserved ~1.8k but charged ~2k.)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ScriptProvider } from '@/features/providers/types';
import { InMemoryStore } from '@/features/render/repository.memory';
import { runRenderJob } from '@/features/render/orchestrator';
import { estimateJobCredits, MAX_SCENE_SEC } from '@/features/render/pricing';
import type { ModelTier } from '@/config/models';

const USER = 'user-1';

async function runExactlyFunded(targetDurationSec: number, modelTier: ModelTier) {
  const estimate = estimateJobCredits({ targetDurationSec, modelTier });
  const store = new InMemoryStore();
  store.seedCredits(USER, estimate); // just enough to start — the tightest case
  const job = await store.createJob({
    userId: USER,
    topic: 'why octopuses have three hearts',
    themeId: 'science-facts',
    targetDurationSec,
    language: 'en',
    modelTier,
  });
  const res = await runRenderJob({ repo: store, credits: store, plans: store }, job.id);
  return { res, estimate, balance: await store.balance(USER), store, jobId: job.id };
}

describe('estimate is an upper bound on the charge', () => {
  const tiers: ModelTier[] = ['standard', 'premium'];
  const durations = [6, 9, 12, 15, 20, 30, 45, 60, 90, 120];

  for (const tier of tiers) {
    for (const sec of durations) {
      it(`${sec}s ${tier}: charge <= hold and balance stays >= 0`, async () => {
        const { res, estimate, balance } = await runExactlyFunded(sec, tier);
        expect(res.ok).toBe(true);
        if (!res.ok) return;
        expect(res.value.actualCredits).toBeLessThanOrEqual(estimate);
        expect(balance).toBeGreaterThanOrEqual(0);
        expect(balance).toBe(estimate - res.value.actualCredits);
      });
    }
  }
});

describe('an over-delivering script model cannot exceed the hold', () => {
  afterEach(() => {
    vi.doUnmock('@/features/providers/registry');
    vi.resetModules();
  });

  it('clamps the scene plan and caps the bill', async () => {
    vi.resetModules();
    const registry = await vi.importActual<typeof import('@/features/providers/registry')>(
      '@/features/providers/registry',
    );
    const greedy: ScriptProvider = {
      ...registry.getScriptProvider(),
      async run(input) {
        const scenes = Array.from({ length: 20 }, (_, index) => ({
          index,
          narration: 'a very long narration '.repeat(40),
          imagePrompt: `scene ${index}`,
          motionPrompt: 'pan',
          durationSec: 30,
        }));
        return { kind: 'completed', output: { title: input.topic, scenes }, costUsd: 0.02 };
      },
    };
    vi.doMock('@/features/providers/registry', () => ({
      ...registry,
      getScriptProvider: () => greedy,
    }));
    const { runRenderJob: run } = await import('@/features/render/orchestrator');
    const { InMemoryStore: Store } = await import('@/features/render/repository.memory');

    const estimate = estimateJobCredits({ targetDurationSec: 12, modelTier: 'standard' });
    const store = new Store();
    store.seedCredits(USER, estimate);
    const job = await store.createJob({
      userId: USER,
      topic: 'greedy',
      themeId: 'science-facts',
      targetDurationSec: 12,
      language: 'en',
      modelTier: 'standard',
    });

    const res = await run({ repo: store, credits: store, plans: store }, job.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const scenes = await store.listScenes(job.id);
    expect(scenes).toHaveLength(2);
    expect(scenes.every((s) => s.durationSec <= MAX_SCENE_SEC)).toBe(true);
    expect(res.value.actualCredits).toBeLessThanOrEqual(estimate);
    expect(await store.balance(USER)).toBeGreaterThanOrEqual(0);
  });
});
