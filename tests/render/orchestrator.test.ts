import { describe, expect, it } from 'vitest';
import { InMemoryStore } from '@/features/render/repository.memory';
import { runRenderJob } from '@/features/render/orchestrator';
import { estimateJobCredits } from '@/features/render/pricing';
import type { NewScene, SceneRecord } from '@/features/render/repository';

const USER = 'user-1';

function storeWithCredits(amount: number): InMemoryStore {
  const store = new InMemoryStore();
  store.seedCredits(USER, amount);
  return store;
}

async function draftJob(store: InMemoryStore) {
  return store.createJob({
    userId: USER,
    topic: 'a cat CEO runs a startup',
    themeId: 'office-drama',
    targetDurationSec: 12,
    language: 'en',
    modelTier: 'standard',
  });
}

describe('runRenderJob — happy path', () => {
  it('drives a job to done and produces a final asset', async () => {
    const store = storeWithCredits(100_000);
    const job = await draftJob(store);

    const res = await runRenderJob({ repo: store, credits: store }, job.id);

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.status).toBe('done');
    expect(res.value.outputAssetUrl).toMatch(/^mock:\/\/render\//);
    expect(res.value.title).toContain('cat CEO');
    expect(res.value.actualCredits).toBeGreaterThan(0);
    expect(res.value.apiCostUsd).toBeGreaterThan(0);
  });

  it('settles so balance = start - actual credits', async () => {
    const start = 100_000;
    const store = storeWithCredits(start);
    const job = await draftJob(store);

    const res = await runRenderJob({ repo: store, credits: store }, job.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const balance = await store.balance(USER);
    expect(balance).toBe(start - res.value.actualCredits);
  });

  it('reserves the estimate, which is >= the actual charge', async () => {
    const store = storeWithCredits(100_000);
    const job = await draftJob(store);
    const estimate = estimateJobCredits({ targetDurationSec: 12, modelTier: 'standard' });

    const res = await runRenderJob({ repo: store, credits: store }, job.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.value.estimatedCredits).toBe(estimate);
    expect(estimate).toBeGreaterThanOrEqual(res.value.actualCredits);
  });

  it('persists per-scene image and video urls', async () => {
    const store = storeWithCredits(100_000);
    const job = await draftJob(store);
    await runRenderJob({ repo: store, credits: store }, job.id);

    const scenes = await store.listScenes(job.id);
    expect(scenes.length).toBeGreaterThanOrEqual(2);
    for (const scene of scenes) {
      expect(scene.imageUrl).toMatch(/^mock:\/\/image\//);
      expect(scene.videoUrl).toMatch(/^mock:\/\/video\//);
      expect(scene.status).toBe('done');
    }
  });
});

describe('runRenderJob — insufficient credits', () => {
  it('fails before any work and leaves the balance untouched', async () => {
    const store = storeWithCredits(100); // far too little
    const job = await draftJob(store);

    const res = await runRenderJob({ repo: store, credits: store }, job.id);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('insufficient_credits');
    expect(await store.balance(USER)).toBe(100);

    const after = await store.getJob(job.id);
    expect(after?.status).toBe('failed');
  });
});

describe('runRenderJob — mid-pipeline failure', () => {
  it('marks the job failed and refunds the whole hold', async () => {
    // Store that blows up right after the credits are reserved.
    class FailAtScenes extends InMemoryStore {
      async addScenes(_jobId: string, _scenes: NewScene[]): Promise<SceneRecord[]> {
        throw new Error('provider exploded');
      }
    }
    const start = 100_000;
    const store = new FailAtScenes();
    store.seedCredits(USER, start);
    const job = await draftJob(store);

    const res = await runRenderJob({ repo: store, credits: store }, job.id);

    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe('provider_failed');

    // Reserve (-estimate) then refund (+estimate) nets to zero.
    expect(await store.balance(USER)).toBe(start);
    const after = await store.getJob(job.id);
    expect(after?.status).toBe('failed');
    expect(after?.error).toContain('provider exploded');
  });
});
