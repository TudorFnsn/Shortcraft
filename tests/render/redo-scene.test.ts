import { describe, expect, it } from 'vitest';
import { allowedShapes, assessMargins } from '@/features/billing/margin';
import { PLANS } from '@/config/plans';
import { runRenderJob } from '@/features/render/orchestrator';
import {
  REVOICE_CREDITS_PER_USD,
  estimateJobCredits,
  estimateSceneRedoCredits,
  sceneRedoBill,
} from '@/features/render/pricing';
import { InMemoryStore } from '@/features/render/repository.memory';
import {
  MAX_IMAGE_PROMPT_CHARS,
  createSceneRedoJob,
  isSceneRedo,
  planSceneRedo,
} from '@/features/render/redo-scene';
import { createRevoiceJob } from '@/features/render/revoice';

const scenes = [
  { idx: 0, imagePrompt: 'an octopus in a reef', durationSec: 5 },
  { idx: 1, imagePrompt: 'a heart diagram', durationSec: 4 },
];

describe('planSceneRedo', () => {
  it('keeps the description when none is given and prices the scene', () => {
    const r = planSceneRedo({ modelTier: 'standard' }, scenes, { idx: 1 });
    expect(r.ok && r.value).toEqual({
      idx: 1,
      imagePrompt: 'a heart diagram',
      promptChanged: false,
      credits: estimateSceneRedoCredits('standard', 4),
    });
  });

  it('takes a new description, whitespace collapsed', () => {
    const r = planSceneRedo({ modelTier: 'standard' }, scenes, {
      idx: 0,
      imagePrompt: '  a  blue octopus ',
    });
    expect(r.ok && r.value.imagePrompt).toBe('a blue octopus');
    expect(r.ok && r.value.promptChanged).toBe(true);
  });

  it.each([
    [{ idx: 5 }, /no scene 6/],
    [{ idx: 0, imagePrompt: '   ' }, /Describe the picture/],
    [{ idx: 0, imagePrompt: 'x'.repeat(MAX_IMAGE_PROMPT_CHARS + 1) }, /under 1000/],
  ])('rejects %j', (redo, message) => {
    const r = planSceneRedo({ modelTier: 'standard' }, scenes, redo);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(message);
  });
});

describe('scene redo pricing', () => {
  it('is priced at the fixed scale and far cheaper than a remake', () => {
    const bill = sceneRedoBill('standard', 6);
    expect(bill.credits).toBe(Math.ceil(bill.costUsd * REVOICE_CREDITS_PER_USD));
    expect(bill.credits).toBeLessThan(
      estimateJobCredits({ targetDurationSec: 15, modelTier: 'standard' }) / 5,
    );
    expect(estimateSceneRedoCredits('premium', 6)).toBeLessThan(
      estimateJobCredits({ targetDurationSec: 15, modelTier: 'premium' }) / 2,
    );
  });

  it('prices a Premium scene by its length, capped at the longest scene', () => {
    expect(estimateSceneRedoCredits('premium', 3)).toBeLessThan(
      estimateSceneRedoCredits('premium', 6),
    );
    expect(estimateSceneRedoCredits('premium', 60)).toBe(estimateSceneRedoCredits('premium', 6));
  });

  it('is a job shape in the margin gate at every allowed tier, and the gate still passes', () => {
    const tiers = (id: keyof typeof PLANS) =>
      allowedShapes(PLANS[id])
        .filter((s) => s.sceneRedo)
        .map((s) => s.modelTier);
    expect(tiers('starter')).toEqual(PLANS.starter.limits.modelTiers);
    expect(tiers('pro')).toEqual(PLANS.pro.limits.modelTiers);
    const report = assessMargins();
    expect(report.ok).toBe(true);
    for (const p of report.plans) expect(p.multiple).toBeGreaterThanOrEqual(3);
  });
});

describe('scene redo end to end (mock providers)', () => {
  async function setup(credits: number) {
    const store = new InMemoryStore();
    store.seedCredits('u', credits);
    const deps = { repo: store, credits: store, plans: store };
    const source = await store.createJob({
      userId: 'u',
      topic: 'why octopuses have three hearts',
      themeId: 'fun-facts',
      targetDurationSec: 12,
      language: 'en',
      modelTier: 'standard',
    });
    const done = await runRenderJob(deps, source.id);
    if (!done.ok) throw new Error(done.error.message);
    return { store, deps, source: done.value };
  }

  it('redraws one scene, reuses the rest and the voiceover, and bills the fixed quote', async () => {
    const { store, deps, source } = await setup(100_000);
    const sourceScenes = await store.listScenes(source.id);
    const plan = planSceneRedo(source, sourceScenes, {
      idx: 1,
      imagePrompt: 'a glowing blue octopus heart',
    });
    if (!plan.ok) throw new Error(plan.error.message);
    const before = await store.balance('u');

    const child = await createSceneRedoJob(store, source, sourceScenes, plan.value);
    expect(isSceneRedo(child, await store.listScenes(child.id))).toBe(true);
    const res = await runRenderJob(deps, child.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const v2 = res.value;
    expect(v2.status).toBe('done');
    expect(v2.parentJobId).toBe(source.id);
    expect(v2.title).toBe(source.title);
    expect(v2.voiceoverUrl).toBe(source.voiceoverUrl); // not re-narrated
    expect(v2.words).toEqual(source.words);
    expect(v2.outputAssetUrl).not.toBe(source.outputAssetUrl);

    const childScenes = (await store.listScenes(v2.id)).sort((a, b) => a.idx - b.idx);
    const ordered = [...sourceScenes].sort((a, b) => a.idx - b.idx);
    childScenes.forEach((s, i) => {
      if (s.idx === 1) {
        expect(s.imagePrompt).toBe('a glowing blue octopus heart');
        expect(s.imageUrl).not.toBe(ordered[i]!.imageUrl);
      } else {
        expect(s.imageUrl).toBe(ordered[i]!.imageUrl);
      }
      expect(s.narration).toBe(ordered[i]!.narration);
      expect(s.status).toBe('done');
    });

    expect(v2.estimatedCredits).toBe(plan.value.credits);
    expect(v2.actualCredits).toBe(plan.value.credits);
    expect(await store.balance('u')).toBe(before - plan.value.credits);

    // The original video is untouched.
    const original = await store.getJob(source.id);
    expect(original?.outputAssetUrl).toBe(source.outputAssetUrl);
    expect((await store.listScenes(source.id)).map((s) => s.imagePrompt)).toEqual(
      sourceScenes.map((s) => s.imagePrompt),
    );
  });

  it('fails without charging when the creator cannot afford it', async () => {
    const { store, deps, source } = await setup(100_000);
    const balance = await store.balance('u');
    await store.add('u', -balance, 'settle_adjust');
    const sourceScenes = await store.listScenes(source.id);
    const child = await createSceneRedoJob(store, source, sourceScenes, {
      idx: 0,
      imagePrompt: sourceScenes[0]!.imagePrompt,
    });
    const res = await runRenderJob(deps, child.id);
    expect(res.ok).toBe(false);
    expect((await store.getJob(child.id))?.status).toBe('failed');
    expect(await store.balance('u')).toBe(0);
  });

  it('leaves re-voice children on the re-voice path', async () => {
    const { store, deps, source } = await setup(100_000);
    const sourceScenes = await store.listScenes(source.id);
    const child = await createRevoiceJob(
      store,
      source,
      sourceScenes,
      sourceScenes.map((s) => s.narration),
      { voiceId: 'george' },
    );
    expect(isSceneRedo(child, await store.listScenes(child.id))).toBe(false);
    const res = await runRenderJob(deps, child.id);
    expect(res.ok && res.value.voiceoverUrl).not.toBe(source.voiceoverUrl);
  });
});
