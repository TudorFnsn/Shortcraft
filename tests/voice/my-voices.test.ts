import { describe, expect, it, vi } from 'vitest';
import { PLANS } from '@/config/plans';
import { defaultVoiceFor, getVoice } from '@/config/voices';
import { allowedShapes, assessMargins } from '@/features/billing/margin';
import { createElevenLabsVoiceDesigner } from '@/features/providers/live/elevenlabs-voice-design';
import { runRenderJob } from '@/features/render/orchestrator';
import { SAVE_VOICE_CREDITS, VOICE_DESIGN_ROUND_CREDITS } from '@/features/render/pricing';
import { InMemoryStore } from '@/features/render/repository.memory';
import { editorView } from '@/features/render/revoice';
import { VoiceFields, resolveVoice } from '@/features/render/voice';
import { createMockVoiceDesigner, type VoiceDesigner } from '@/features/voice/designer';
import {
  InMemoryUserVoiceStore,
  canUseVoice,
  checkDescription,
  deleteVoice,
  designVoice,
  isUserVoiceId,
  publicVoice,
  renameVoice,
  saveVoice,
} from '@/features/voice/my-voices';
import { InMemoryPreviewLog, previewLine } from '@/features/voice/preview';

const DESCRIPTION = 'A warm, older British storyteller, slow and a bit gravelly.';

function setup(designer: VoiceDesigner = createMockVoiceDesigner(), credits = 10_000) {
  const store = new InMemoryStore();
  store.seedCredits('u', credits);
  store.seedCredits('other', credits);
  const voices = new InMemoryUserVoiceStore();
  return { store, voices, deps: { voices, credits: store, designer } };
}

async function designAndSave(d: ReturnType<typeof setup>, user = 'u', plan = PLANS.pro) {
  const round = await designVoice(d.deps, user, DESCRIPTION);
  if (!round.ok) throw new Error(round.error.message);
  const saved = await saveVoice(d.deps, user, plan, {
    roundId: round.value.roundId,
    sample: 1,
    name: '  Old   Tom ',
  });
  if (!saved.ok) throw new Error(saved.error.message);
  return saved.value;
}

describe('checkDescription', () => {
  it('normalizes a good description', () => {
    expect(checkDescription(`  ${DESCRIPTION}  `)).toEqual({ ok: true, value: DESCRIPTION });
  });

  it('refuses too short, too long, and real-person requests', () => {
    expect(checkDescription('deep voice').ok).toBe(false);
    expect(checkDescription('a'.repeat(501)).ok).toBe(false);
    for (const d of [
      'Make it sound like Morgan Freeman narrating',
      'The voice of a famous president, deep and slow',
      'Clone my neighbour, he has a deep friendly voice',
      'Impersonate a well known actor with a calm tone',
    ]) {
      expect(checkDescription(d).ok, d).toBe(false);
    }
  });
});

describe('designVoice', () => {
  it('charges one round and returns 3 samples without provider ids', async () => {
    const d = setup();
    const r = await designVoice(d.deps, 'u', DESCRIPTION);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.samples).toHaveLength(3);
    expect(Object.keys(r.value.samples[0]!)).toEqual(['audioDataUrl']);
    expect(r.value.credits).toBe(VOICE_DESIGN_ROUND_CREDITS);
    expect(await d.store.balance('u')).toBe(10_000 - VOICE_DESIGN_ROUND_CREDITS);
    expect(d.voices.rounds.get(r.value.roundId)?.generatedVoiceIds).toHaveLength(3);
  });

  it('refunds the round when the provider fails', async () => {
    const designer = {
      ...createMockVoiceDesigner(),
      design: vi.fn().mockRejectedValue(new Error('down')),
    };
    const d = setup(designer);
    const r = await designVoice(d.deps, 'u', DESCRIPTION);
    expect(r).toMatchObject({ ok: false, error: { code: 'provider_failed' } });
    expect(await d.store.balance('u')).toBe(10_000);
  });

  it('says what it costs when credits are short', async () => {
    const d = setup(undefined, 10);
    const r = await designVoice(d.deps, 'u', DESCRIPTION);
    expect(r).toMatchObject({ ok: false, error: { code: 'insufficient_credits' } });
    if (!r.ok) expect(r.error.message).toContain(String(VOICE_DESIGN_ROUND_CREDITS));
  });
});

describe('saveVoice', () => {
  it('keeps the chosen sample, charges the save price and hides the provider id', async () => {
    const d = setup();
    const voice = await designAndSave(d);
    expect(isUserVoiceId(voice.id)).toBe(true);
    expect(voice.name).toBe('Old Tom');
    expect(voice.providerVoiceId).toMatch(/^mockvoice_/);
    expect(publicVoice(voice)).not.toHaveProperty('providerVoiceId');
    expect(await d.store.balance('u')).toBe(
      10_000 - VOICE_DESIGN_ROUND_CREDITS - SAVE_VOICE_CREDITS,
    );
  });

  it("refuses someone else's round, a missing sample, and a second save", async () => {
    const d = setup();
    const round = await designVoice(d.deps, 'u', DESCRIPTION);
    if (!round.ok) throw new Error();
    const roundId = round.value.roundId;
    const plan = PLANS.pro;
    expect(await saveVoice(d.deps, 'other', plan, { roundId, sample: 0, name: 'x' })).toMatchObject(
      {
        error: { code: 'not_found' },
      },
    );
    expect(await saveVoice(d.deps, 'u', plan, { roundId, sample: 3, name: 'x' })).toMatchObject({
      error: { code: 'not_found' },
    });
    expect((await saveVoice(d.deps, 'u', plan, { roundId, sample: 0, name: 'A' })).ok).toBe(true);
    expect(await saveVoice(d.deps, 'u', plan, { roundId, sample: 2, name: 'B' })).toMatchObject({
      error: { code: 'invalid_input' },
    });
  });

  it("stops at the plan's saved-voice limit before charging", async () => {
    const d = setup();
    await designAndSave(d, 'u', PLANS.starter);
    const round = await designVoice(d.deps, 'u', DESCRIPTION);
    if (!round.ok) throw new Error();
    const before = await d.store.balance('u');
    const r = await saveVoice(d.deps, 'u', PLANS.starter, {
      roundId: round.value.roundId,
      sample: 0,
      name: 'Second',
    });
    expect(r).toMatchObject({ ok: false, error: { code: 'plan_limit' } });
    expect(await d.store.balance('u')).toBe(before);
  });

  it('refunds and frees the provider voice when storing it fails', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const d = setup({ ...createMockVoiceDesigner(), remove });
    d.voices.insertVoice = vi.fn().mockRejectedValue(new Error('db down'));
    const round = await designVoice(d.deps, 'u', DESCRIPTION);
    if (!round.ok) throw new Error();
    const r = await saveVoice(d.deps, 'u', PLANS.pro, {
      roundId: round.value.roundId,
      sample: 0,
      name: 'Tom',
    });
    expect(r).toMatchObject({ ok: false, error: { code: 'provider_failed' } });
    expect(remove).toHaveBeenCalledWith(expect.stringMatching(/^mockvoice_/));
    expect(await d.store.balance('u')).toBe(10_000 - VOICE_DESIGN_ROUND_CREDITS);
  });
});

describe('rename and delete', () => {
  it('are owner-only; delete removes the voice at the provider too', async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const d = setup({ ...createMockVoiceDesigner(), remove });
    const voice = await designAndSave(d);

    expect(await renameVoice(d.voices, 'other', voice.id, 'Mine')).toMatchObject({
      error: { code: 'not_found' },
    });
    expect((await renameVoice(d.voices, 'u', voice.id, ' Narrator ')).ok).toBe(true);
    expect((await d.voices.getVoice(voice.id))?.name).toBe('Narrator');

    expect(await deleteVoice(d.deps, 'other', voice.id)).toMatchObject({
      error: { code: 'not_found' },
    });
    expect((await deleteVoice(d.deps, 'u', voice.id)).ok).toBe(true);
    expect(remove).toHaveBeenCalledWith(voice.providerVoiceId);
    expect(await d.voices.getVoice(voice.id)).toBeNull();
  });
});

describe('using a saved voice', () => {
  it('request fields accept catalog and u_ ids, never a raw provider id', () => {
    expect(
      VoiceFields.safeParse({ voiceId: 'u_0b7c3c8e-6f0e-4a1b-9c1d-2a3b4c5d6e7f' }).success,
    ).toBe(true);
    expect(VoiceFields.safeParse({ voiceId: getVoice('george').providerVoiceId }).success).toBe(
      false,
    );
    expect(VoiceFields.safeParse({ voiceId: 'u_not-a-uuid' }).success).toBe(false);
  });

  it('canUseVoice: catalog voices for everyone, saved voices only for their owner', async () => {
    const d = setup();
    const voice = await designAndSave(d);
    expect(await canUseVoice(d.voices, 'other', 'george')).toBe(true);
    expect(await canUseVoice(d.voices, 'other', undefined)).toBe(true);
    expect(await canUseVoice(d.voices, 'u', voice.id)).toBe(true);
    expect(await canUseVoice(d.voices, 'other', voice.id)).toBe(false);
  });

  it('resolveVoice uses the looked-up saved voice, else the look default', () => {
    const job = { themeId: 'mini-doc', voiceId: 'u_x', voiceSettings: null };
    expect(resolveVoice(job, { id: 'u_x', providerVoiceId: 'prov' })).toMatchObject({
      voiceId: 'u_x',
      providerVoiceId: 'prov',
    });
    expect(resolveVoice(job).voiceId).toBe(defaultVoiceFor('mini-doc'));
  });

  async function render(d: ReturnType<typeof setup>, userId: string, voiceId: string) {
    const job = await d.store.createJob({
      userId,
      topic: 'why octopuses have three hearts',
      themeId: 'fun-facts',
      targetDurationSec: 12,
      language: 'en',
      modelTier: 'standard',
      voiceId,
    });
    const res = await runRenderJob(
      { repo: d.store, credits: d.store, plans: d.store, voices: d.voices },
      job.id,
    );
    if (!res.ok) throw new Error(res.error.message);
    return res.value;
  }

  it('narrates with the saved voice; a deleted or foreign one falls back to the default', async () => {
    const d = setup(undefined, 100_000);
    d.store.seedCredits('other', 100_000);
    const voice = await designAndSave(d);
    const own = await render(d, 'u', voice.id);
    const foreign = await render(d, 'other', voice.id);
    const catalog = await render(d, 'u', defaultVoiceFor('fun-facts'));
    expect(own.status).toBe('done');
    expect(own.voiceoverUrl).not.toBe(catalog.voiceoverUrl);
    expect(foreign.voiceoverUrl).toBe(catalog.voiceoverUrl);

    await deleteVoice(d.deps, 'u', voice.id);
    const deleted = await render(d, 'u', voice.id);
    expect(deleted.status).toBe('done');
    expect(deleted.voiceoverUrl).toBe(catalog.voiceoverUrl);
    // The editor keeps showing the saved voice the video was made with.
    expect(editorView(own, []).voiceId).toBe(voice.id);
  });

  it('previews a line in a saved voice', async () => {
    const log = new InMemoryPreviewLog();
    const req = { text: 'Hello there.', themeId: 'fun-facts' };
    const own = await previewLine(
      log,
      'u',
      { ...req, voiceId: 'u_x', own: { id: 'u_x', providerVoiceId: 'prov' } },
      new Date(),
    );
    const plain = await previewLine(log, 'u', req, new Date());
    expect(own.ok && plain.ok && own.value.audioUrl !== plain.value.audioUrl).toBe(true);
  });
});

describe('ElevenLabs voice designer', () => {
  it('designs, saves and deletes through the text-to-voice API', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/text-to-voice/design')) {
        return Response.json({
          previews: [0, 1, 2].map((i) => ({
            audio_base_64: Buffer.from(`a${i}`).toString('base64'),
            generated_voice_id: `gen${i}`,
            media_type: 'audio/mpeg',
          })),
        });
      }
      if (url.endsWith('/text-to-voice')) return Response.json({ voice_id: 'saved1' });
      if (init?.method === 'DELETE') return new Response(null, { status: 404 });
      return new Response('?', { status: 500 });
    });
    const designer = createElevenLabsVoiceDesigner({
      apiKey: () => 'k',
      fetch: fetchMock as unknown as typeof fetch,
    });

    const { samples } = await designer.design(DESCRIPTION);
    expect(samples.map((s) => s.generatedVoiceId)).toEqual(['gen0', 'gen1', 'gen2']);
    expect(samples[0]!.audioDataUrl).toMatch(/^data:audio\/mpeg;base64,/);
    const designBody = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body));
    expect(designBody.voice_description).toBe(DESCRIPTION);
    expect(designBody.text.length).toBeGreaterThanOrEqual(100);

    expect(await designer.save('gen1', 'Tom', DESCRIPTION)).toBe('saved1');
    await expect(designer.remove('saved1')).resolves.toBeUndefined(); // 404 = already gone
  });

  it('names the missing permission on a 401', async () => {
    const designer = createElevenLabsVoiceDesigner({
      apiKey: () => 'k',
      fetch: (async () => new Response('no', { status: 401 })) as unknown as typeof fetch,
    });
    await expect(designer.design(DESCRIPTION)).rejects.toThrow(/Voices permission/);
  });
});

describe('margin gate', () => {
  it('includes one voice design round per plan, at or above the floor', () => {
    for (const plan of Object.values(PLANS)) {
      expect(allowedShapes(plan).filter((s) => s.voiceDesign)).toHaveLength(1);
    }
    expect(assessMargins().ok).toBe(true);
  });
});
