import { describe, expect, it, vi } from 'vitest';
import { getModel } from '@/config/models';
import {
  anthropicHeaders,
  buildScriptPrompt,
  costUsdFor,
  createAnthropicScriptProvider,
  DEFAULT_SCRIPT_MODEL,
  toScriptOutput,
  type ScriptClient,
} from '@/features/providers/live/anthropic-script';
import {
  createElevenLabsVoiceProvider,
  DEFAULT_VOICE_ID,
  USD_PER_CHAR,
  wordsFromAlignment,
  type Alignment,
} from '@/features/providers/live/elevenlabs-voice';
import {
  billedMegapixels,
  createFalImageProvider,
  FAL_IMAGE_MODELS,
  IMAGE_SIZE,
} from '@/features/providers/live/fal-image';
import {
  InMemoryMediaStore,
  mediaPath,
  SupabaseMediaStore,
} from '@/features/providers/live/media-store';
import { MODELS } from '@/config/models';
import { estimateSceneCount, MAX_SCENE_SEC } from '@/features/render/pricing';

const ctx = { idempotencyKey: 'job_1:scripting:' };
const scriptInput = {
  topic: 'octopuses',
  themeId: 'fun-facts',
  targetDurationSec: 15,
  language: 'en',
};

/* ── script (Anthropic) ─────────────────────────────────────────────────── */

const scene = (narration: string, durationSec = 5) => ({
  narration,
  imagePrompt: ' an octopus ',
  motionPrompt: 'push in',
  durationSec,
});

function fakeClient(response: Record<string, unknown>) {
  const parse = vi.fn(async () => ({
    model: DEFAULT_SCRIPT_MODEL,
    stop_reason: 'end_turn',
    stop_details: null,
    usage: { input_tokens: 1000, output_tokens: 2000 },
    ...response,
  }));
  return { parse, client: { beta: { messages: { parse } } } as unknown as ScriptClient };
}

describe('anthropic script adapter', () => {
  const model = getModel('script-default');

  it('calls Claude Sonnet 5.5 with structured output + refusal fallbacks and normalizes the script', async () => {
    const { parse, client } = fakeClient({
      parsed_output: {
        title: ' Octo facts ',
        scenes: [scene(' Three hearts. '), scene('Blue blood', 9)],
      },
    });
    const provider = createAnthropicScriptProvider(model, { client });
    const res = await provider.run(scriptInput, ctx);

    expect(res.kind).toBe('completed');
    if (res.kind !== 'completed') return;
    expect(res.output.title).toBe('Octo facts');
    expect(res.output.scenes).toEqual([
      {
        index: 0,
        narration: 'Three hearts.',
        imagePrompt: 'an octopus',
        motionPrompt: 'push in',
        durationSec: 5,
      },
      {
        index: 1,
        narration: 'Blue blood',
        imagePrompt: 'an octopus',
        motionPrompt: 'push in',
        durationSec: MAX_SCENE_SEC,
      },
    ]);
    // $2/M in + $10/M out
    expect(res.costUsd).toBeCloseTo(0.002 + 0.02);

    const params = (parse.mock.calls as unknown as [Record<string, unknown>][])[0]![0];
    expect(params.model).toBe('claude-sonnet-5-5');
    expect(params.fallbacks).toBe('default');
    expect(params.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(params).not.toHaveProperty('thinking'); // budget_tokens / disabled would 400
    expect(params).not.toHaveProperty('tool_choice');
  });

  it('fails the step on a refusal, max_tokens or unparseable output', async () => {
    for (const response of [
      { stop_reason: 'refusal', stop_details: { category: 'general_harms' }, parsed_output: null },
      { stop_reason: 'max_tokens', parsed_output: null },
      { parsed_output: null },
      { parsed_output: { title: 't', scenes: [scene('  ')] } },
    ]) {
      const { client } = fakeClient(response);
      await expect(
        createAnthropicScriptProvider(model, { client }).run(scriptInput, ctx),
      ).rejects.toThrow();
    }
  });

  it('prices the model that actually served the request (fallbacks can switch it)', () => {
    expect(costUsdFor('claude-sonnet-5-5', { input_tokens: 1e6, output_tokens: 0 })).toBe(2);
    expect(costUsdFor('claude-opus-5-5', { input_tokens: 0, output_tokens: 1e6 })).toBe(20);
    expect(costUsdFor('some-new-model', { input_tokens: 0, output_tokens: 1e6 })).toBe(20); // conservative
  });

  it('asks for the scene count the credit estimate paid for', () => {
    const { user } = buildScriptPrompt(scriptInput);
    expect(user).toContain(`exactly ${estimateSceneCount(15)} scenes`);
    expect(user).toContain('Fun Facts');
    expect(() => toScriptOutput({ title: '', scenes: [] })).toThrow();
  });

  it('keeps the catalog cost budget above a typical Sonnet 5.5 script', () => {
    // ~2k in / 3k out (incl. thinking) must stay inside the $0.04 the margin gate assumes.
    expect(
      costUsdFor(DEFAULT_SCRIPT_MODEL, { input_tokens: 2000, output_tokens: 3000 }),
    ).toBeLessThanOrEqual(model.costUsdPerUnit);
  });
});

describe('anthropic client headers', () => {
  it('names the workspace only when one is configured', () => {
    expect(anthropicHeaders('wrkspc_123')).toEqual({ 'anthropic-workspace-id': 'wrkspc_123' });
    expect(anthropicHeaders(undefined)).toEqual({});
  });
});

/* ── voice (ElevenLabs) ─────────────────────────────────────────────────── */

const align = (text: string, perChar = 0.05): Alignment => ({
  characters: [...text],
  character_start_times_seconds: [...text].map((_, i) => i * perChar),
  character_end_times_seconds: [...text].map((_, i) => (i + 1) * perChar),
});

describe('elevenlabs voice adapter', () => {
  const model = getModel('voice-default');

  it('groups character timings into words', () => {
    expect(wordsFromAlignment(align('Hi  there!'))).toEqual([
      { word: 'Hi', startMs: 0, endMs: 100 },
      { word: 'there!', startMs: 200, endMs: 500 },
    ]);
  });

  it('synthesizes, stores the MP3 under an idempotent key and returns word timings', async () => {
    const text = 'Octopuses have three hearts';
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            audio_base64: Buffer.from('mp3-bytes').toString('base64'),
            alignment: align(text),
          }),
        ),
    );
    const store = new InMemoryMediaStore();
    const provider = createElevenLabsVoiceProvider(model, {
      apiKey: () => 'xi-test',
      store: () => store,
      fetch: fetchMock as unknown as typeof fetch,
    });

    const res = await provider.run({ text, voiceId: 'default', language: 'en' }, ctx);
    expect(res.kind).toBe('completed');
    if (res.kind !== 'completed') return;
    expect(res.output.words.map((w) => w.word)).toEqual(['Octopuses', 'have', 'three', 'hearts']);
    expect(res.output.durationMs).toBe(Math.round(text.length * 50));
    expect(res.costUsd).toBeCloseTo(text.length * USD_PER_CHAR);
    expect(res.output.audioUrl).toBe('memory://voiceover/job_1_scripting_.mp3');
    expect([...store.objects.values()][0]?.contentType).toBe('audio/mpeg');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(`/text-to-speech/${DEFAULT_VOICE_ID}/with-timestamps`);
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('xi-test');
    expect(JSON.parse(String(init.body))).toEqual({ text, model_id: 'eleven_flash_v2_5' });

    // Same step retried → same object key (overwrite, not a second file).
    await provider.run({ text, voiceId: 'default', language: 'en' }, ctx);
    expect(store.objects.size).toBe(1);
  });

  it('throws on an HTTP error or a response without audio, so the job fails and refunds', async () => {
    const store = new InMemoryMediaStore();
    for (const response of [
      new Response('quota exceeded', { status: 401 }),
      new Response(JSON.stringify({ audio_base64: '', alignment: null })),
    ]) {
      const provider = createElevenLabsVoiceProvider(model, {
        apiKey: () => 'k',
        store: () => store,
        fetch: (async () => response) as unknown as typeof fetch,
      });
      await expect(
        provider.run({ text: 'hi', voiceId: 'default', language: 'en' }, ctx),
      ).rejects.toThrow();
    }
    expect(store.objects.size).toBe(0);
  });
});

/* ── media store (Supabase Storage) ─────────────────────────────────────── */

describe('SupabaseMediaStore', () => {
  const fakeAdmin = (upload: unknown, signed: unknown) => {
    const bucket = {
      upload: vi.fn(async () => upload),
      createSignedUrl: vi.fn(async () => signed),
    };
    const from = vi.fn(() => bucket);
    return {
      bucket,
      from,
      admin: { storage: { from } } as unknown as ConstructorParameters<
        typeof SupabaseMediaStore
      >[0],
    };
  };

  it('upserts into the private bucket and returns a signed URL', async () => {
    const { bucket, from, admin } = fakeAdmin(
      { error: null },
      { data: { signedUrl: 'https://signed' }, error: null },
    );
    const url = await new SupabaseMediaStore(admin, 'media').put(
      'a.mp3',
      new Uint8Array([1]),
      'audio/mpeg',
    );
    expect(url).toBe('https://signed');
    expect(from).toHaveBeenCalledWith('media');
    expect(bucket.upload).toHaveBeenCalledWith('a.mp3', expect.any(Uint8Array), {
      contentType: 'audio/mpeg',
      upsert: true,
    });
  });

  it('throws when the upload or signing fails', async () => {
    const failedUpload = fakeAdmin({ error: { message: 'bucket not found' } }, null);
    await expect(
      new SupabaseMediaStore(failedUpload.admin, 'media').put('a', new Uint8Array(), 'x'),
    ).rejects.toThrow('bucket not found');
    const failedSign = fakeAdmin({ error: null }, { data: null, error: { message: 'denied' } });
    await expect(
      new SupabaseMediaStore(failedSign.admin, 'media').put('a', new Uint8Array(), 'x'),
    ).rejects.toThrow('denied');
  });

  it('asks Supabase for an attachment only when a download name is given', async () => {
    const { bucket, admin } = fakeAdmin(null, { data: { signedUrl: 'https://s' }, error: null });
    const store = new SupabaseMediaStore(admin, 'media');
    await store.signedUrl('r.mp4', 60);
    await store.signedUrl('r.mp4', 60, { downloadAs: 'cats.mp4' });
    expect(bucket.createSignedUrl).toHaveBeenNthCalledWith(1, 'r.mp4', 60, undefined);
    expect(bucket.createSignedUrl).toHaveBeenNthCalledWith(2, 'r.mp4', 60, {
      download: 'cats.mp4',
    });
  });
});

/* ── image (fal.ai FLUX) ────────────────────────────────────────────────── */

const imageCtx = { idempotencyKey: 'job_1:images:scene_0' };

function falFetch(
  response: Record<string, unknown> | Response,
  download: () => Response = () =>
    new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } }),
) {
  return vi.fn(async (url: string) => {
    if (url.startsWith('https://fal.run/')) {
      return response instanceof Response ? response : new Response(JSON.stringify(response));
    }
    return download();
  });
}

const falImage = {
  url: 'https://v3.fal.media/files/abc.jpg',
  width: 720,
  height: 1280,
  content_type: 'image/jpeg',
};

describe('fal image adapter', () => {
  const model = getModel('image-standard');

  it('every catalog image model has a fal mapping', () => {
    for (const m of MODELS.filter((x) => x.kind === 'image')) {
      expect(FAL_IMAGE_MODELS[m.providerId]).toBeDefined();
    }
  });

  it('bills per megapixel rounded up', () => {
    expect(billedMegapixels(IMAGE_SIZE.width, IMAGE_SIZE.height)).toBe(1);
    expect(billedMegapixels(1080, 1920)).toBe(3);
  });

  it('generates a 9:16 image, copies it into the media store and reports cost', async () => {
    const fetchMock = falFetch({ images: [falImage], has_nsfw_concepts: [false] });
    const store = new InMemoryMediaStore();
    const provider = createFalImageProvider(model, {
      apiKey: () => 'fal-test',
      store: () => store,
      fetch: fetchMock as unknown as typeof fetch,
    });

    const res = await provider.run(
      { prompt: 'an octopus', aspectRatio: '9:16', seed: 7 },
      imageCtx,
    );
    expect(res.kind).toBe('completed');
    if (res.kind !== 'completed') return;
    expect(res.output).toEqual({
      imageUrl: 'memory://images/job_1_images_scene_0.jpg',
      width: 720,
      height: 1280,
    });
    expect(res.costUsd).toBeCloseTo(model.costUsdPerUnit);
    expect(provider.costCredits({ prompt: 'x', aspectRatio: '9:16' })).toBe(model.creditsPerUnit);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://fal.run/fal-ai/flux/schnell');
    expect((init.headers as Record<string, string>).authorization).toBe('Key fal-test');
    expect(JSON.parse(String(init.body))).toMatchObject({
      prompt: 'an octopus',
      image_size: IMAGE_SIZE,
      num_images: 1,
      enable_safety_checker: true,
      seed: 7,
    });
    expect(fetchMock.mock.calls[1]?.[0]).toBe(falImage.url);

    // Same step retried → same object key (overwrite, not a second file).
    await provider.run({ prompt: 'an octopus', aspectRatio: '9:16' }, imageCtx);
    expect(store.objects.size).toBe(1);
  });

  it('routes the premium tier to FLUX dev', async () => {
    const fetchMock = falFetch({ images: [falImage] });
    const provider = createFalImageProvider(getModel('image-premium'), {
      apiKey: () => 'k',
      store: () => new InMemoryMediaStore(),
      fetch: fetchMock as unknown as typeof fetch,
    });
    await provider.run({ prompt: 'p', aspectRatio: '9:16' }, imageCtx);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://fal.run/fal-ai/flux/dev');
  });

  it('throws (so the job fails and refunds) on HTTP errors, no image, a flagged image or a failed download', async () => {
    const store = new InMemoryMediaStore();
    for (const fetchMock of [
      falFetch(new Response('unauthorized', { status: 401 })),
      falFetch({ images: [] }),
      falFetch({ images: [falImage], has_nsfw_concepts: [true] }),
      falFetch({ images: [falImage] }, () => new Response('gone', { status: 404 })),
    ]) {
      const provider = createFalImageProvider(model, {
        apiKey: () => 'k',
        store: () => store,
        fetch: fetchMock as unknown as typeof fetch,
      });
      await expect(provider.run({ prompt: 'p', aspectRatio: '9:16' }, imageCtx)).rejects.toThrow();
    }
    expect(store.objects.size).toBe(0);
  });

  it('refuses a provider id with no fal model', () => {
    expect(() =>
      createFalImageProvider(
        { ...model, providerId: 'fal:unknown' },
        {
          apiKey: () => 'k',
          store: () => new InMemoryMediaStore(),
        },
      ),
    ).toThrow(/No fal model/);
  });
});

describe('media paths', () => {
  it('are unique per step and safe for object storage', () => {
    expect(mediaPath('images', 'a1b2-c3:images:scene 1', 'jpg')).toBe(
      'images/a1b2-c3_images_scene_1.jpg',
    );
    // Different jobs never share a path (the old 8-hex hash could collide).
    const paths = new Set(
      Array.from({ length: 5000 }, (_, i) => mediaPath('voiceover', `job_${i}:voiceover:`, 'mp3')),
    );
    expect(paths.size).toBe(5000);
  });
});
