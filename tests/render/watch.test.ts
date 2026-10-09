import { describe, expect, it, vi } from 'vitest';
import type { RenderJobRecord } from '@/features/render/repository';
import { storagePathFromSignedUrl, watchUrlFor, WATCH_URL_TTL_SEC } from '@/features/render/watch';
import { InMemoryMediaStore } from '@/features/providers/live/media-store';

const ORIGIN = 'https://abc.supabase.co';
const SIGNED = `${ORIGIN}/storage/v1/object/sign/media/renders/job-1_render.mp4?token=expired`;

function job(patch: Partial<RenderJobRecord> = {}): RenderJobRecord {
  return {
    id: 'job-1',
    userId: 'user-1',
    status: 'done',
    topic: 't',
    themeId: 'office-drama',
    targetDurationSec: 15,
    language: 'en',
    modelTier: 'standard',
    title: null,
    voiceoverUrl: null,
    words: null,
    outputAssetUrl: SIGNED,
    estimatedCredits: 0,
    chargedCredits: 0,
    actualCredits: 0,
    apiCostUsd: 0,
    error: null,
    createdAt: '',
    updatedAt: '',
    ...patch,
  };
}

describe('storagePathFromSignedUrl', () => {
  it('extracts the object path from our signed URL', () => {
    expect(storagePathFromSignedUrl(SIGNED, 'media', ORIGIN)).toBe('renders/job-1_render.mp4');
  });

  it('decodes percent-encoded paths', () => {
    const url = `${ORIGIN}/storage/v1/object/sign/media/renders/a%20b.mp4?token=x`;
    expect(storagePathFromSignedUrl(url, 'media', `${ORIGIN}/`)).toBe('renders/a b.mp4');
  });

  it.each([
    ['another origin', SIGNED.replace('abc', 'evil')],
    ['another bucket', SIGNED.replace('/sign/media/', '/sign/other/')],
    ['a public, not signed, URL', SIGNED.replace('/sign/', '/public/')],
    ['plain http', SIGNED.replace('https:', 'http:')],
    ['a mock URL', 'mock://render/job-1.mp4'],
    ['garbage', 'not a url'],
    ['an encoded climb out of the bucket', `${ORIGIN}/storage/v1/object/sign/media/%2E%2E/x.mp4`],
    ['an empty path', `${ORIGIN}/storage/v1/object/sign/media/`],
    ['bad percent-encoding', `${ORIGIN}/storage/v1/object/sign/media/%E0%A4%A.mp4`],
  ])('rejects %s', (_label, url) => {
    expect(storagePathFromSignedUrl(url, 'media', ORIGIN)).toBeNull();
  });
});

describe('watchUrlFor', () => {
  const store = new InMemoryMediaStore();
  store.objects.set('renders/job-1_render.mp4', {
    bytes: new Uint8Array(),
    contentType: 'video/mp4',
  });
  const storage = {
    bucket: 'media',
    origin: ORIGIN,
    sign: vi.fn((path: string, ttl: number) => store.signedUrl(path, ttl)),
  };

  it('re-signs the owner’s finished video with a short TTL', async () => {
    const result = await watchUrlFor(job(), 'user-1', storage);
    expect(result).toEqual({ ok: true, url: 'memory://renders/job-1_render.mp4' });
    expect(storage.sign).toHaveBeenCalledWith('renders/job-1_render.mp4', WATCH_URL_TTL_SEC);
  });

  it('treats a missing job and someone else’s job the same', async () => {
    storage.sign.mockClear();
    expect(await watchUrlFor(null, 'user-1', storage)).toEqual({ ok: false, reason: 'not_found' });
    expect(await watchUrlFor(job(), 'user-2', storage)).toEqual({ ok: false, reason: 'not_found' });
    expect(storage.sign).not.toHaveBeenCalled();
  });

  it('is not ready until the job is done with an output', async () => {
    expect(await watchUrlFor(job({ status: 'stitching' }), 'user-1', storage)).toEqual({
      ok: false,
      reason: 'not_ready',
    });
    expect(await watchUrlFor(job({ outputAssetUrl: null }), 'user-1', storage)).toEqual({
      ok: false,
      reason: 'not_ready',
    });
  });

  it('refuses outputs that are not in our bucket (mock renders)', async () => {
    const mock = job({ outputAssetUrl: 'mock://render/job-1.mp4' });
    expect(await watchUrlFor(mock, 'user-1', storage)).toEqual({
      ok: false,
      reason: 'not_playable',
    });
  });
});

describe('InMemoryMediaStore.signedUrl', () => {
  it('only signs objects that exist', async () => {
    const store = new InMemoryMediaStore();
    await expect(store.signedUrl('nope.mp4', 60)).rejects.toThrow(/not found/);
    await store.put('a.mp4', new Uint8Array(), 'video/mp4');
    await expect(store.signedUrl('a.mp4', 60)).resolves.toBe('memory://a.mp4');
  });
});
