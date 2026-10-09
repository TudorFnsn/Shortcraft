import { describe, expect, it, vi } from 'vitest';
import type { RenderJobRecord } from '@/features/render/repository';
import {
  downloadFilename,
  storagePathFromSignedUrl,
  watchUrlFor,
  WATCH_URL_TTL_SEC,
} from '@/features/render/watch';
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
    sign: vi.fn((path: string, ttl: number, opts?: { downloadAs?: string }) =>
      store.signedUrl(path, ttl, opts),
    ),
  };

  it('re-signs the owner’s finished video with a short TTL', async () => {
    const result = await watchUrlFor(job(), 'user-1', storage);
    expect(result).toEqual({ ok: true, url: 'memory://renders/job-1_render.mp4' });
    expect(storage.sign).toHaveBeenCalledWith('renders/job-1_render.mp4', WATCH_URL_TTL_SEC);
  });

  it('plain watch asks for no download filename', async () => {
    storage.sign.mockClear();
    await watchUrlFor(job(), 'user-1', storage, { download: false });
    expect(storage.sign.mock.calls[0]).toEqual(['renders/job-1_render.mp4', WATCH_URL_TTL_SEC]);
  });

  it('download signs the video with a filename from the title', async () => {
    storage.sign.mockClear();
    const result = await watchUrlFor(job({ title: 'Why Cats Purr' }), 'user-1', storage, {
      download: true,
    });
    expect(result.ok).toBe(true);
    expect(storage.sign).toHaveBeenCalledWith('renders/job-1_render.mp4', WATCH_URL_TTL_SEC, {
      downloadAs: 'why-cats-purr.mp4',
    });
  });

  it('never signs a download for someone else’s job', async () => {
    storage.sign.mockClear();
    expect(await watchUrlFor(job(), 'user-2', storage, { download: true })).toEqual({
      ok: false,
      reason: 'not_found',
    });
    expect(storage.sign).not.toHaveBeenCalled();
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

describe('downloadFilename', () => {
  it.each([
    [{ title: 'Why Octopuses Have 3 Hearts!', topic: 'x' }, 'why-octopuses-have-3-hearts.mp4'],
    [{ title: null, topic: 'office drama' }, 'office-drama.mp4'],
    [{ title: 'Café crème — à la française', topic: 'x' }, 'cafe-creme-a-la-francaise.mp4'],
    [{ title: '  --Hello, World--  ', topic: 'x' }, 'hello-world.mp4'],
    [{ title: '東京の夜 🌃', topic: 'x' }, 'shortcraft-video.mp4'],
    [{ title: '', topic: '' }, 'shortcraft-video.mp4'],
    [{ title: 'a/../b"; rm -rf', topic: 'x' }, 'a-b-rm-rf.mp4'],
  ])('%o -> %s', (input, expected) => {
    expect(downloadFilename(input)).toBe(expected);
  });

  it('caps long titles at 60 characters without a trailing dash', () => {
    const name = downloadFilename({ title: 'word '.repeat(40), topic: 'x' });
    const slug = name.replace(/\.mp4$/, '');
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
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
