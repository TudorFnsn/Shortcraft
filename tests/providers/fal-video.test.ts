import { describe, expect, it, vi } from 'vitest';
import { getModel } from '@/config/models';
import {
  buildFalVideoRequest,
  createFalVideoProvider,
  DEFAULT_FAL_VIDEO_MODEL,
  FAL_VIDEO_USD_PER_SEC,
} from '@/features/providers/live/fal-video';
import { InMemoryMediaStore, mediaPath } from '@/features/providers/live/media-store';

const model = getModel('video-premium');
const input = {
  imageUrl: 'https://store/scene.jpg',
  motionPrompt: 'slow dolly in',
  durationSec: 6,
};
const ctx = { idempotencyKey: 'job1:clips:s1' };
const QUEUE = `https://queue.fal.run/${DEFAULT_FAL_VIDEO_MODEL}`;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** Fakes fal's queue: submit → `pendingPolls` IN_PROGRESS statuses → COMPLETED → result. */
function fakeFal(opts: { pendingPolls?: number; result?: Response } = {}) {
  let polls = 0;
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (url === QUEUE) {
      return json({
        request_id: 'req-1',
        status_url: `${QUEUE}/requests/req-1/status`,
        response_url: `${QUEUE}/requests/req-1`,
      });
    }
    if (url.endsWith('/requests/req-1/status')) {
      polls += 1;
      return json({ status: polls > (opts.pendingPolls ?? 0) ? 'COMPLETED' : 'IN_PROGRESS' });
    }
    if (url.endsWith('/requests/req-1')) {
      return opts.result ?? json({ video: { url: 'https://v3.fal.media/files/clip.mp4' } });
    }
    if (url === 'https://v3.fal.media/files/clip.mp4') return new Response(new Uint8Array([1, 2]));
    throw new Error(`unexpected fetch ${url}`);
  });
}

const make = (fetchMock: ReturnType<typeof fakeFal>, extra = {}) => {
  const store = new InMemoryMediaStore();
  const provider = createFalVideoProvider(model, {
    apiKey: () => 'fal-test',
    store: () => store,
    fetch: fetchMock as unknown as typeof fetch,
    sleep: async () => {},
    ...extra,
  });
  return { provider, store };
};

describe('fal video adapter', () => {
  it('is what premium resolves to in live mode', () => {
    expect(model.providerId).toBe('fal:video');
  });

  it('submits to the queue, polls until done, and stores the clip', async () => {
    const fetchMock = fakeFal({ pendingPolls: 2 });
    const { provider, store } = make(fetchMock);
    const out = await provider.run(input, ctx);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(QUEUE);
    expect((init.headers as Record<string, string>).authorization).toBe('Key fal-test');
    expect(JSON.parse(String(init.body))).toMatchObject({
      prompt: 'slow dolly in',
      image_url: 'https://store/scene.jpg',
      duration: '5',
      generate_audio: false,
    });
    // 3 status checks (2 pending + done), then the result.
    expect(fetchMock.mock.calls.filter(([u]) => String(u).endsWith('/status'))).toHaveLength(3);

    const path = mediaPath('clips', ctx.idempotencyKey, 'mp4');
    expect(store.objects.get(path)?.contentType).toBe('video/mp4');
    expect(out).toEqual({
      kind: 'completed',
      output: { kind: 'video', videoUrl: `memory://${path}`, durationSec: 5 },
      costUsd: 5 * (FAL_VIDEO_USD_PER_SEC[DEFAULT_FAL_VIDEO_MODEL] ?? 0),
    });
  });

  it('charges credits per scene second, not per billed clip second', () => {
    const { provider } = make(fakeFal());
    expect(provider.costCredits(input)).toBe(6 * model.creditsPerUnit);
  });

  it('fails the step (so the job refunds) when fal reports a failed generation', async () => {
    const { provider } = make(fakeFal({ result: json({ detail: 'content policy' }, 422) }));
    await expect(provider.run(input, ctx)).rejects.toThrow(/fal video failed: 422.*content policy/);
  });

  it('times out instead of waiting forever', async () => {
    let t = 0;
    const { provider } = make(fakeFal({ pendingPolls: 1_000 }), {
      now: () => (t += 60_000),
      timeoutMs: 5 * 60_000,
    });
    await expect(provider.run(input, ctx)).rejects.toThrow(/timed out/);
  });

  it('builds per-family requests: Kling clips are 5s or 10s, others per second in 9:16', () => {
    expect(buildFalVideoRequest(DEFAULT_FAL_VIDEO_MODEL, { ...input, durationSec: 3 })).toEqual(
      expect.objectContaining({ billedSec: 5 }),
    );
    const generic = buildFalVideoRequest('fal-ai/veo3.1/fast/image-to-video', input);
    expect(generic.billedSec).toBe(6);
    expect(generic.body).toMatchObject({ duration: 6, aspect_ratio: '9:16' });
  });
});
