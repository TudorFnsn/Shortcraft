/**
 * "Watch" for a finished video. The job row stores the signed URL the render
 * step got back, which expires after 24h, so a creator returning the next day
 * hit a dead link. Instead we recover the object's storage path from that URL
 * and mint a fresh short-lived URL on every click, after checking ownership.
 */
import type { RenderJobRecord } from './repository';

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

export type WatchResult =
  { ok: true; url: string } | { ok: false; reason: 'not_found' | 'not_ready' | 'not_playable' };

/**
 * Fresh URL for `job`'s final video, or why there isn't one. Someone else's job
 * is `not_found` (never confirm it exists).
 */
export async function watchUrlFor(
  job: RenderJobRecord | null,
  userId: string,
  storage: {
    bucket: string;
    origin: string;
    sign: (path: string, ttlSec: number) => Promise<string>;
  },
): Promise<WatchResult> {
  if (!job || job.userId !== userId) return { ok: false, reason: 'not_found' };
  if (job.status !== 'done' || !job.outputAssetUrl) return { ok: false, reason: 'not_ready' };

  const path = storagePathFromSignedUrl(job.outputAssetUrl, storage.bucket, storage.origin);
  if (!path) return { ok: false, reason: 'not_playable' };
  return { ok: true, url: await storage.sign(path, WATCH_URL_TTL_SEC) };
}
