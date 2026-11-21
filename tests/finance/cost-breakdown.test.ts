import { describe, expect, it } from 'vitest';
import { addStepCost, summarizeBreakdowns } from '@/features/finance/cost-breakdown';
import { InMemoryStore } from '@/features/render/repository.memory';
import { runRenderJob } from '@/features/render/orchestrator';
import { isMissingColumn } from '@/features/render/repository.supabase';

describe('addStepCost', () => {
  it('records a step with its provider, money, credits and units', () => {
    const b = addStepCost({}, 'script', 'anthropic', [
      { credits: 120, usd: 0.016, usage: { inputTokens: 800, outputTokens: 1400 } },
    ]);
    expect(b.script).toEqual({
      provider: 'anthropic',
      usd: 0.016,
      credits: 120,
      calls: 1,
      usage: { inputTokens: 800, outputTokens: 1400 },
    });
  });

  it('accumulates a step metered more than once (clips landing over several polls)', () => {
    let b = addStepCost({}, 'clips', 'fal', [{ credits: 6000, usd: 0.35, usage: { clipSec: 5 } }]);
    b = addStepCost(b, 'clips', 'fal', [
      { credits: 6000, usd: 0.35, usage: { clipSec: 5 } },
      { credits: 6000, usd: 0.35, usage: { clipSec: 5 } },
    ]);
    expect(b.clips).toMatchObject({ usd: 1.05, credits: 18000, calls: 3, usage: { clipSec: 15 } });
  });

  it('does not mutate the breakdown it is given and keeps other steps', () => {
    const before = addStepCost({}, 'voice', 'elevenlabs', [{ credits: 50, usd: 0.01 }]);
    const after = addStepCost(before, 'render', 'inhouse', [{ credits: 10, usd: 0.01 }]);
    expect(Object.keys(before)).toEqual(['voice']);
    expect(Object.keys(after)).toEqual(['voice', 'render']);
    expect(after.voice?.usage).toEqual({});
  });
});

describe('summarizeBreakdowns', () => {
  it('sums steps across jobs, ranks by spend and skips jobs without one', () => {
    const a = addStepCost(
      addStepCost({}, 'clips', 'fal', [{ credits: 0, usd: 1.75, usage: { clipSec: 25 } }]),
      'script',
      'anthropic',
      [{ credits: 0, usd: 0.02, usage: { inputTokens: 700 } }],
    );
    const b = addStepCost({}, 'script', 'anthropic', [
      { credits: 0, usd: 0.02, usage: { inputTokens: 900 } },
    ]);
    const s = summarizeBreakdowns([a, b, null, {}, undefined]);
    expect(s.jobsWithBreakdown).toBe(2);
    expect(s.usd).toBe(1.79);
    expect(s.steps.map((t) => t.step)).toEqual(['clips', 'script']);
    expect(s.steps[1]).toMatchObject({
      jobs: 2,
      usd: 0.04,
      usdPerJob: 0.02,
      providers: ['anthropic'],
      usage: { inputTokens: 1600 },
    });
    expect(s.steps[0]?.share).toBe(0.978);
  });
});

describe('render orchestrator records the per-step cost', () => {
  it('splits the job total across script, images, clips, voice and render', async () => {
    const store = new InMemoryStore();
    store.seedCredits('user-1', 100_000);
    const job = await store.createJob({
      userId: 'user-1',
      topic: 'a cat CEO runs a startup',
      themeId: 'office-drama',
      targetDurationSec: 12,
      language: 'en',
      modelTier: 'standard',
    });
    const res = await runRenderJob({ repo: store, credits: store, plans: store }, job.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const b = res.value.costBreakdown;
    expect(Object.keys(b).sort()).toEqual(['clips', 'images', 'render', 'script', 'voice']);
    const scenes = await store.listScenes(job.id);
    expect(b.images?.calls).toBe(scenes.length);
    const usd = Object.values(b).reduce((n, s) => n + s.usd, 0);
    expect(usd).toBeCloseTo(res.value.apiCostUsd, 4);
    const credits = Object.values(b).reduce((n, s) => n + s.credits, 0);
    expect(credits).toBe(res.value.chargedCredits);
  });
});

describe('isMissingColumn', () => {
  it('recognises a database that predates 0014', () => {
    const msg = "Could not find the 'cost_breakdown' column of 'render_jobs' in the schema cache";
    expect(isMissingColumn({ code: 'PGRST204', message: msg }, 'cost_breakdown')).toBe(true);
    expect(isMissingColumn({ code: '42703', message: msg }, 'cost_breakdown')).toBe(true);
    expect(isMissingColumn({ code: '23505', message: msg }, 'cost_breakdown')).toBe(false);
    expect(isMissingColumn({ code: 'PGRST204', message: "'title'" }, 'cost_breakdown')).toBe(false);
  });
});
