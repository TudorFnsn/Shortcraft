import { describe, expect, it, vi } from 'vitest';
import type { RenderInput } from '@/features/providers/types';

// Record every render input while keeping the real (mock-mode) provider.
const renders: RenderInput[] = [];
vi.mock('@/features/providers/registry', async (importActual) => {
  const actual = await importActual<typeof import('@/features/providers/registry')>();
  return {
    ...actual,
    getRenderProvider: (...args: Parameters<typeof actual.getRenderProvider>) => {
      const provider = actual.getRenderProvider(...args);
      return {
        ...provider,
        run: (input: RenderInput, ctx: Parameters<typeof provider.run>[1]) => {
          renders.push(input);
          return provider.run(input, ctx);
        },
      };
    },
  };
});

const { InMemoryStore } = await import('@/features/render/repository.memory');
const { runRenderJob } = await import('@/features/render/orchestrator');

const USER = 'user-1';

async function renderFor(setup: (store: InstanceType<typeof InMemoryStore>) => Promise<void>) {
  const store = new InMemoryStore();
  store.seedCredits(USER, 100_000); // trial grant
  await setup(store);
  const job = await store.createJob({
    userId: USER,
    topic: 'a cat CEO runs a startup',
    themeId: 'office-drama',
    targetDurationSec: 12,
    language: 'en',
    modelTier: 'standard',
  });
  renders.length = 0;
  const res = await runRenderJob({ repo: store, credits: store, plans: store }, job.id);
  expect(res.ok).toBe(true);
  expect(renders).toHaveLength(1);
  return renders[0]!;
}

describe('"Made with Shortcraft" watermark', () => {
  it('is on for free-trial users who have never paid', async () => {
    const input = await renderFor(async () => {});
    expect(input.brandWatermark).toBe(true);
  });

  it('is off once the user has a subscription grant', async () => {
    const input = await renderFor(async (s) => {
      await s.add(USER, 30_000, 'monthly_grant');
    });
    expect(input.brandWatermark).toBe(false);
  });

  it('is off for top-up buyers without a subscription', async () => {
    const input = await renderFor(async (s) => {
      await s.add(USER, 20_000, 'topup');
    });
    expect(input.brandWatermark).toBe(false);
  });

  it('stays off after a subscription lapses (they paid once)', async () => {
    const input = await renderFor(async (s) => {
      await s.add(USER, 30_000, 'monthly_grant');
      s.setSubscription(USER, 'starter', 'canceled');
    });
    expect(input.brandWatermark).toBe(false);
  });

  it('is not switched off by refunds or settle adjustments', async () => {
    const input = await renderFor(async (s) => {
      await s.add(USER, 500, 'refund');
      await s.add(USER, 100, 'settle_adjust');
    });
    expect(input.brandWatermark).toBe(true);
  });
});
