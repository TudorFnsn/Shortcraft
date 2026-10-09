import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getModel } from '@/config/models';
import type { VideoInput, VideoProvider } from '@/features/providers/types';
import { InMemoryStore } from '@/features/render/repository.memory';
import { advanceJob, driveJob, LEASE_MS, runRenderJob } from '@/features/render/orchestrator';
import { estimateJobCredits } from '@/features/render/pricing';

/**
 * A Premium video provider that behaves like fal's queue: `run` only submits,
 * and each clip is ready after `pollsUntilDone` polls (or fails, if told to).
 */
const fake = vi.hoisted(() => ({
  pollsUntilDone: 2,
  failWith: null as string | null,
  submitted: 0,
  polls: new Map<string, number>(),
}));

vi.mock('@/features/providers/registry', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/features/providers/registry')>();
  const model = getModel('video-premium');
  const asyncVideo: VideoProvider = {
    id: 'fake:async-video',
    kind: 'video',
    costCredits: (input: VideoInput) => Math.ceil(input.durationSec) * model.creditsPerUnit,
    async run(_input, ctx) {
      fake.submitted += 1;
      return {
        kind: 'async',
        job: {
          providerId: 'fake:async-video',
          providerJobId: JSON.stringify({ key: ctx.idempotencyKey }),
        },
      };
    },
    async poll(job) {
      const { key } = JSON.parse(job.providerJobId) as { key: string };
      const n = (fake.polls.get(key) ?? 0) + 1;
      fake.polls.set(key, n);
      if (n < fake.pollsUntilDone) return { status: 'pending' };
      if (fake.failWith) return { status: 'failed', reason: fake.failWith };
      return {
        status: 'succeeded',
        output: { kind: 'video', videoUrl: `mock://video/${key}.mp4`, durationSec: 5 },
        costUsd: 0.35,
      };
    },
    parseWebhook: async () => {
      throw new Error('unused');
    },
  };
  return {
    ...real,
    getVideoProvider: (modelId?: string) =>
      modelId === 'video-premium' ? asyncVideo : real.getVideoProvider(modelId),
  };
});

const USER = 'user-1';
const START = 200_000;

async function setup() {
  const store = new InMemoryStore();
  store.seedCredits(USER, START);
  const job = await store.createJob({
    userId: USER,
    topic: 'a lighthouse keeper befriends a whale',
    themeId: 'fun-facts',
    targetDurationSec: 12,
    language: 'en',
    modelTier: 'premium',
  });
  return { store, job, deps: { repo: store, credits: store, plans: store } };
}

beforeEach(() => {
  fake.pollsUntilDone = 2;
  fake.failWith = null;
  fake.submitted = 0;
  fake.polls.clear();
});

describe('async pipeline', () => {
  it('advances one step per call and waits on in-flight AI clips', async () => {
    const { store, job, deps } = await setup();
    fake.pollsUntilDone = 1; // ready on the first poll
    const statuses: string[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await advanceJob(deps, job.id);
      if (!res.ok) throw new Error(res.error.message);
      statuses.push(res.value.job.status);
    }
    // draft → scripting → images → clips, then the clips step submits and waits.
    expect(statuses).toEqual(['scripting', 'images', 'clips', 'clips']);

    const scenes = await store.listScenes(job.id);
    expect(fake.submitted).toBe(scenes.length); // every scene at once
    for (const s of scenes) expect(s.videoJob).toBeTruthy();
    // Nothing for the clips is charged until they exist.
    const charged = (await store.getJob(job.id))?.chargedCredits ?? 0;

    const res = await advanceJob(deps, job.id); // the clips land on this poll
    expect(res.ok && res.value.job.status).toBe('voiceover');
    const after = await store.listScenes(job.id);
    for (const s of after) {
      expect(s.status).toBe('done');
      expect(s.videoJob).toBeNull();
      expect(s.videoUrl).toMatch(/^mock:\/\/video\//);
      expect(s.clipDurationMs).toBe(5000);
    }
    expect((await store.getJob(job.id))?.chargedCredits).toBeGreaterThan(charged);
  });

  it('drives to done across polls and settles from the persisted charge', async () => {
    const { store, job, deps } = await setup();
    const sleep = vi.fn(async () => {});
    const res = await runRenderJob(deps, job.id, { sleep });
    if (!res.ok) throw new Error(res.error.message);

    expect(res.value.status).toBe('done');
    expect(sleep).toHaveBeenCalled(); // it really waited on the clips
    const estimate = estimateJobCredits({ targetDurationSec: 12, modelTier: 'premium' });
    expect(res.value.estimatedCredits).toBe(estimate);
    expect(res.value.actualCredits).toBe(Math.min(estimate, res.value.chargedCredits));
    expect(await store.balance(USER)).toBe(START - res.value.actualCredits);
    // Real clip cost recorded: 0.35 per scene on top of the mocked steps.
    const scenes = await store.listScenes(job.id);
    expect(res.value.apiCostUsd).toBeGreaterThanOrEqual(0.35 * scenes.length);
  });

  it('stops at the time budget and lets a later run pick up where it left off', async () => {
    const { store, job, deps } = await setup();
    fake.pollsUntilDone = 4;
    // A budget too short to wait out a poll: it runs the fast steps, then stops at the clips.
    const first = await driveJob(deps, job.id, {
      budgetMs: 1_000,
      pollMs: 5_000,
      sleep: async () => {},
    });
    expect(first.ok && first.value.waiting).toBe(true);
    expect((await store.getJob(job.id))?.status).toBe('clips');

    // e.g. the cron sweep, in another request: no resubmission, just polling.
    const submittedBefore = fake.submitted;
    const second = await driveJob(deps, job.id, { sleep: async () => {} });
    expect(second.ok && second.value.job.status).toBe('done');
    expect(fake.submitted).toBe(submittedBefore);
  });

  it('refunds the whole hold when a clip fails', async () => {
    const { store, job, deps } = await setup();
    fake.failWith = 'content policy violation';
    const res = await runRenderJob(deps, job.id, { sleep: async () => {} });

    expect(res.ok).toBe(false);
    expect(await store.balance(USER)).toBe(START);
    const failed = await store.getJob(job.id);
    expect(failed?.status).toBe('failed');
    expect(failed?.error).toContain('content policy violation');
  });

  it('lets only the lease holder advance a job', async () => {
    const { store, job, deps } = await setup();
    expect(await store.claimJob(job.id, 'cron-worker', LEASE_MS)).toBe(true);

    const res = await advanceJob(deps, job.id);
    expect(res.ok && res.value.busy).toBe(true);
    expect((await store.getJob(job.id))?.status).toBe('draft'); // nothing happened

    await store.releaseJob(job.id, 'cron-worker');
    const next = await advanceJob(deps, job.id);
    expect(next.ok && next.value.job.status).toBe('scripting');
  });

  it('lists stalled jobs for the cron sweep, skipping leased and finished ones', async () => {
    const { store, job, deps } = await setup();
    await advanceJob(deps, job.id); // → scripting
    expect((await store.listStalledJobs(0, 10)).map((j) => j.id)).toEqual([job.id]);
    expect(await store.listStalledJobs(60_000, 10)).toEqual([]); // touched just now

    await store.claimJob(job.id, 'someone', LEASE_MS);
    expect(await store.listStalledJobs(0, 10)).toEqual([]);
    await store.releaseJob(job.id, 'someone');

    await driveJob(deps, job.id, { sleep: async () => {} });
    expect((await store.getJob(job.id))?.status).toBe('done');
    expect(await store.listStalledJobs(0, 10)).toEqual([]);
  });
});
