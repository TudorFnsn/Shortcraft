/**
 * "Watch" for a finished video. The job row stores the signed URL the render
 * step got back, which expires after 24h, so a creator returning the next day
 * hit a dead link. Instead we recover the object's storage path from that URL
 * and mint a fresh short-lived URL on every click, after checking ownership.
 */
import type { SignedUrlOptions } from '@/features/providers/live/media-store';
import type { RenderJobRecord, SceneRecord } from './repository';

/** Long enough to watch or download, short enough that a shared link dies. */
export const WATCH_URL_TTL_SEC = 60 * 60;

/**
 * Object path inside `bucket` from a Supabase Storage signed URL
 * (`<origin>/storage/v1/object/sign/<bucket>/<path>?token=…`). Returns null for
 * anything else: another origin, another bucket, mock URLs, or a path that
 * tries to climb out of the bucket.
 */
export function storagePathFromSignedUrl(
  url: string,
  bucket: string,
  storageOrigin: string,
): string | null {
  let parsed: URL;
  let origin: string;
  try {
    parsed = new URL(url);
    origin = new URL(storageOrigin).origin;
  } catch {
    return null;
  }
  if (parsed.protocol !== 'https:' || parsed.origin !== origin) return null;

  const prefix = `/storage/v1/object/sign/${bucket}/`;
  if (!parsed.pathname.startsWith(prefix)) return null;

  let path: string;
  try {
    path = decodeURIComponent(parsed.pathname.slice(prefix.length));
  } catch {
    return null;
  }
  const segments = path.split('/');
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null;
  return path;
}

const DOWNLOAD_FALLBACK = 'shortcraft-video';
const DOWNLOAD_MAX_SLUG = 60;

/**
 * Filename for "Download": an ASCII slug of the title (or topic), so it is safe
 * in a Content-Disposition header on every OS. Accents are folded ("café" ->
 * "cafe"); anything left that isn't a letter or digit becomes a dash.
 */
export function downloadFilename(job: Pick<RenderJobRecord, 'title' | 'topic'>): string {
  const slug = (job.title ?? job.topic ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, DOWNLOAD_MAX_SLUG)
    .replace(/-+$/, '');
  return `${slug || DOWNLOAD_FALLBACK}.mp4`;
}

export type WatchResult =
  { ok: true; url: string } | { ok: false; reason: 'not_found' | 'not_ready' | 'not_playable' };

/**
 * Fresh URL for `job`'s final video, or why there isn't one. Someone else's job
 * is `not_found` (never confirm it exists). `download` makes the URL save the
 * file (named by downloadFilename) instead of playing it.
 */
export async function watchUrlFor(
  job: RenderJobRecord | null,
  userId: string,
  storage: {
    bucket: string;
    origin: string;
    sign: (path: string, ttlSec: number, opts?: SignedUrlOptions) => Promise<string>;
  },
  { download = false }: { download?: boolean } = {},
): Promise<WatchResult> {
  if (!job || job.userId !== userId) return { ok: false, reason: 'not_found' };
  if (job.status !== 'done' || !job.outputAssetUrl) return { ok: false, reason: 'not_ready' };

  const path = storagePathFromSignedUrl(job.outputAssetUrl, storage.bucket, storage.origin);
  if (!path) return { ok: false, reason: 'not_playable' };
  const url = download
    ? await storage.sign(path, WATCH_URL_TTL_SEC, { downloadAs: downloadFilename(job) })
    : await storage.sign(path, WATCH_URL_TTL_SEC);
  return { ok: true, url };
}

/**
 * How long a browser may reuse the thumbnail redirect. Shorter than the signed
 * URL's TTL, so a cached redirect never points at an expired URL.
 */
export const THUMBNAIL_CACHE_SEC = 30 * 60;

/**
 * Fresh URL for `job`'s thumbnail: the first scene's image, re-signed like the
 * video. It exists as soon as that image is generated, so the Library can show a
 * card while the rest of the video is still rendering. Scenes are only loaded
 * after the ownership check.
 */
export async function thumbnailUrlFor(
  job: RenderJobRecord | null,
  userId: string,
  loadScenes: (jobId: string) => Promise<SceneRecord[]>,
  storage: {
    bucket: string;
    origin: string;
    sign: (path: string, ttlSec: number) => Promise<string>;
  },
): Promise<WatchResult> {
  if (!job || job.userId !== userId) return { ok: false, reason: 'not_found' };

  const scenes = await loadScenes(job.id);
  const first = scenes.reduce<SceneRecord | null>(
    (min, s) => (min === null || s.idx < min.idx ? s : min),
    null,
  );
  if (!first?.imageUrl) return { ok: false, reason: 'not_ready' };

  const path = storagePathFromSignedUrl(first.imageUrl, storage.bucket, storage.origin);
  if (!path) return { ok: false, reason: 'not_playable' };
  return { ok: true, url: await storage.sign(path, WATCH_URL_TTL_SEC) };
}
