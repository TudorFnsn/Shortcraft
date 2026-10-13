import { describe, expect, it, vi } from 'vitest';
import { getModel } from '@/config/models';
import { THEMES } from '@/config/themes';
import {
  THEME_DEFAULT_VOICE,
  VOICES,
  defaultVoiceFor,
  getVoice,
  themesWithoutDefaultVoice,
} from '@/config/voices';
import { createElevenLabsVoiceProvider } from '@/features/providers/live/elevenlabs-voice';
import { InMemoryMediaStore } from '@/features/providers/live/media-store';
import { runRenderJob } from '@/features/render/orchestrator';
import { InMemoryStore } from '@/features/render/repository.memory';
import { VoiceFields, resolveVoice, voiceChoice } from '@/features/render/voice';

describe('voice catalog', () => {
  it('has unique slugs and provider ids that look like ElevenLabs ids', () => {
    expect(new Set(VOICES.map((v) => v.id)).size).toBe(VOICES.length);
    expect(new Set(VOICES.map((v) => v.providerVoiceId)).size).toBe(VOICES.length);
    for (const v of VOICES) expect(v.providerVoiceId).toMatch(/^[A-Za-z0-9]{20}$/);
  });

  it('gives every look a default voice from the catalog', () => {
    expect(themesWithoutDefaultVoice()).toEqual([]);
    for (const t of THEMES) expect(VOICES.map((v) => v.id)).toContain(THEME_DEFAULT_VOICE[t.id]);
  });
});

describe('resolveVoice', () => {
  it("uses the look's default voice and settings when nothing was chosen", () => {
    const r = resolveVoice({ themeId: 'horror-story', voiceId: null, voiceSettings: null });
    expect(r.voiceId).toBe(defaultVoiceFor('horror-story'));
    expect(r.providerVoiceId).toBe(getVoice(defaultVoiceFor('horror-story')).providerVoiceId);
    expect(r.tuning).toEqual({ speed: 1, stability: 0.5 });
  });

  it('uses the chosen voice, speed and delivery', () => {
    const r = resolveVoice({
      themeId: 'fun-facts',
      voiceId: 'george',
      voiceSettings: { speed: 'slower', delivery: 'calm' },
    });
    expect(r.providerVoiceId).toBe(getVoice('george').providerVoiceId);
    expect(r.tuning).toEqual({ speed: 0.9, stability: 0.75 });
  });

  it('falls back to the look default for a voice no longer in the catalog', () => {
    const r = resolveVoice({ themeId: 'mini-doc', voiceId: 'retired', voiceSettings: null });
    expect(r.voiceId).toBe(defaultVoiceFor('mini-doc'));
  });
});

describe('voice request fields', () => {
  it('accept catalog voices and the speed/delivery words', () => {
    expect(
      VoiceFields.safeParse({ voiceId: 'callum', speed: 'faster', delivery: 'lively' }).success,
    ).toBe(true);
    expect(VoiceFields.safeParse({}).success).toBe(true);
  });

  it('reject raw provider ids and unknown values', () => {
    expect(VoiceFields.safeParse({ voiceId: getVoice('callum').providerVoiceId }).success).toBe(
      false,
    );
    expect(VoiceFields.safeParse({ voiceId: 'my-cloned-voice' }).success).toBe(false);
    expect(VoiceFields.safeParse({ speed: '2x' }).success).toBe(false);
  });

  it('store only what was chosen, filling the other setting with its default', () => {
    expect(voiceChoice({})).toEqual({});
    expect(voiceChoice({ voiceId: 'sarah' })).toEqual({ voiceId: 'sarah' });
    expect(voiceChoice({ delivery: 'calm' })).toEqual({
      voiceSettings: { speed: 'normal', delivery: 'calm' },
    });
  });
});

describe('ElevenLabs voice_settings', () => {
  it('sends speed and stability when the job has tuning, nothing extra otherwise', async () => {
    const text = 'Hi there';
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            audio_base64: Buffer.from('mp3').toString('base64'),
            alignment: {
              characters: [...text],
              character_start_times_seconds: [...text].map((_, i) => i * 0.05),
              character_end_times_seconds: [...text].map((_, i) => (i + 1) * 0.05),
            },
          }),
        ),
    );
    const provider = createElevenLabsVoiceProvider(getModel('voice-default'), {
      apiKey: () => 'xi',
      store: () => new InMemoryMediaStore(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    const ctx = { idempotencyKey: 'j:voiceover:' };
    const voiceId = getVoice('george').providerVoiceId;

    await provider.run(
      { text, voiceId, language: 'en', settings: { speed: 1.1, stability: 0.3 } },
      ctx,
    );
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/text-to-speech/${voiceId}/`);
    expect(JSON.parse(String(init.body)).voice_settings).toEqual({
      stability: 0.3,
      similarity_boost: 0.75,
      use_speaker_boost: true,
      speed: 1.1,
    });

    await provider.run({ text, voiceId, language: 'en' }, ctx);
    const [, plain] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(String(plain.body))).not.toHaveProperty('voice_settings');
  });
});

describe('render pipeline uses the chosen voice', () => {
  async function render(voice: { voiceId?: string }) {
    const store = new InMemoryStore();
    store.seedCredits('u', 100_000);
    const job = await store.createJob({
      userId: 'u',
      topic: 'why octopuses have three hearts',
      themeId: 'fun-facts',
      targetDurationSec: 12,
      language: 'en',
      modelTier: 'standard',
      ...voice,
    });
    const res = await runRenderJob({ repo: store, credits: store, plans: store }, job.id);
    if (!res.ok) throw new Error(res.error.message);
    return res.value;
  }

  it('keeps the choice on the job and narrates with it', async () => {
    const chosen = await render({ voiceId: 'callum' });
    const fallback = await render({});
    expect(chosen.status).toBe('done');
    expect(chosen.voiceId).toBe('callum');
    expect(fallback.voiceId).toBeNull();
    // Mock audio is keyed by text + provider voice, so a different voice = different audio.
    expect(chosen.voiceoverUrl).not.toBe(fallback.voiceoverUrl);
  });
});
