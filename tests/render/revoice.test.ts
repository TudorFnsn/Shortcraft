import { describe, expect, it } from 'vitest';
import { allowedShapes, assessMargins } from '@/features/billing/margin';
import { PLANS } from '@/config/plans';
import { runRenderJob } from '@/features/render/orchestrator';
import {
  REVOICE_CREDITS_PER_USD,
  estimateJobCredits,
  estimateRevoiceCredits,
  revoiceBill,
} from '@/features/render/pricing';
import { InMemoryStore } from '@/features/render/repository.memory';
import { createRevoiceJob, maxNarrationLength, planNarration } from '@/features/render/revoice';

const scenes = [
  { idx: 0, narration: 'Octopuses have three hearts.' },
  { idx: 1, narration: 'Two pump blood to the gills.' },
  { idx: 2, narration: 'And their blood is blue.' },
];

describe('planNarration', () => {
  it('applies edits in scene order and lists only real changes', () => {
    const r = planNarration(scenes, [
      { idx: 2, narration: '  And   their blood is  BLUE. ' },
      { idx: 0, narration: 'Octopuses have three hearts.' },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.narrations).toEqual([
      'Octopuses have three hearts.',
      'Two pump blood to the gills.',
      'And their blood is BLUE.',
    ]);
    expect(r.value.changed).toEqual([{ idx: 2, narration: 'And their blood is BLUE.' }]);
  });

  it('keeps everything when there are no edits', () => {
    const r = planNarration(scenes, []);
    expect(r.ok && r.value.changed).toEqual([]);
  });

  it.each([
    [[{ idx: 7, narration: 'hi' }], /no scene 8/],
    [
      [
        { idx: 1, narration: 'a' },
        { idx: 1, narration: 'b' },
      ],
      /edited twice/,
    ],
    [[{ idx: 0, narration: '   ' }], /needs some narration/],
    [[{ idx: 0, narration: 'x'.repeat(maxNarrationLength(scenes[0]!.narration) + 1) }], /too long/],
  ])('rejects %j', (edits, message) => {
    const r = planNarration(scenes, edits);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toMatch(message);
  });

  it('allows a line to grow by 30% plus a little slack', () => {
    expect(maxNarrationLength('x'.repeat(100))).toBe(150);
  });
});

describe('re-voice pricing', () => {
  it('is far cheaper than a remake and priced at the fixed scale', () => {
    const narration = Array.from({ length: 75 }, () => 'word');
    const credits = estimateRevoiceCredits(narration);
    expect(credits).toBeLessThan(
      estimateJobCredits({ targetDurationSec: 30, modelTier: 'standard' }) / 5,
    );
    const bill = revoiceBill(30);
    expect(bill.credits).toBe(Math.ceil(bill.costUsd * REVOICE_CREDITS_PER_USD));
  });

  it('is a job shape in the margin gate, and the gate still passes', () => {
    expect(allowedShapes(PLANS.starter).some((s) => s.revoice)).toBe(true);
    const report = assessMargins();
    expect(report.ok).toBe(true);
    for (const p of report.plans) expect(p.multiple).toBeGreaterThanOrEqual(3);
  });
});

describe('re-voice end to end (mock providers)', () => {
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

  it('makes a new version that reuses the pictures and bills the fixed quote', async () => {
    const { store, deps, source } = await setup(100_000);
    const sourceScenes = await store.listScenes(source.id);
    const plan = planNarration(sourceScenes, [{ idx: 0, narration: 'A brand new opening line.' }]);
    if (!plan.ok) throw new Error(plan.error.message);
    const before = await store.balance('u');

    const child = await createRevoiceJob(store, source, sourceScenes, plan.value.narrations, {
      voiceId: 'george',
    });
    const res = await runRenderJob(deps, child.id);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const v2 = res.value;
    expect(v2.status).toBe('done');
    expect(v2.parentJobId).toBe(source.id);
    expect(v2.voiceId).toBe('george');
    expect(v2.title).toBe(source.title);
    expect(v2.outputAssetUrl).not.toBe(source.outputAssetUrl);
    expect(v2.voiceoverUrl).not.toBe(source.voiceoverUrl);

    const childScenes = await store.listScenes(v2.id);
    expect(childScenes.map((s) => s.imageUrl)).toEqual(sourceScenes.map((s) => s.imageUrl));
    expect(childScenes[0]!.narration).toBe('A brand new opening line.');

    const quote = estimateRevoiceCredits(plan.value.narrations);
    expect(v2.estimatedCredits).toBe(quote);
    expect(v2.actualCredits).toBe(quote);
    expect(await store.balance('u')).toBe(before - quote);

    // The original video is untouched.
    expect((await store.getJob(source.id))?.outputAssetUrl).toBe(source.outputAssetUrl);
  });

  it('fails without charging when the creator cannot afford it', async () => {
    const { store, deps, source } = await setup(100_000);
    const balance = await store.balance('u');
    await store.add('u', -balance, 'settle_adjust'); // empty the wallet
    const sourceScenes = await store.listScenes(source.id);
    const child = await createRevoiceJob(
      store,
      source,
      sourceScenes,
      sourceScenes.map((s) => s.narration),
      { voiceId: 'callum' },
    );
    const res = await runRenderJob(deps, child.id);
    expect(res.ok).toBe(false);
    expect((await store.getJob(child.id))?.status).toBe('failed');
    expect(await store.balance('u')).toBe(0);
  });
});
