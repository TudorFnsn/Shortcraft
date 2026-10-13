/**
 * Real videos for the landing hero's three phone frames (server-only).
 *
 * The owner lists finished render jobs in LANDING_SHOWCASE_JOB_IDS. Media lives
 * in a private bucket, so each MP4 is signed here and the URLs are cached for an
 * hour, well inside the signing TTL, so a cached page never serves a dead link.
 * Only the listed jobs are ever exposed. Anything missing, unfinished or not
 * playable falls back to the drawn theme frame.
 */
import { unstable_cache } from 'next/cache';
import { env } from '@/lib/env';
import { getStore, isSupabaseConfigured } from '@/features/render/store';
import type { RenderJobRecord } from '@/features/render/repository';
import { storagePathFromSignedUrl } from '@/features/render/watch';
import { SupabaseMediaStore } from '@/features/providers/live/media-store';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';

export interface ShowcaseVideo {
  themeId: string;
  url: string;
}

export const SHOWCASE_SLOTS = 3;
/** Signed URLs outlive the cache (1h) by a wide margin. */
export const SHOWCASE_URL_TTL_SEC = 6 * 60 * 60;
const SHOWCASE_CACHE_SEC = 60 * 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Comma-separated job ids → at most three valid UUIDs, in order, no repeats. */
export function parseShowcaseIds(raw: string | undefined): string[] {
  const ids = (raw ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter((s) => UUID.test(s));
  return [...new Set(ids)].slice(0, SHOWCASE_SLOTS);
}

/**
 * One playable video per listed job, in order. A job that is missing, not done
 * or whose output isn't in our bucket is skipped; a signing error skips that
 * slot rather than breaking the landing page.
 */
export async function showcaseVideos(
  ids: readonly string[],
  deps: {
    getJob: (id: string) => Promise<RenderJobRecord | null>;
    bucket: string;
    origin: string;
    sign: (path: string, ttlSec: number) => Promise<string>;
  },
): Promise<ShowcaseVideo[]> {
  const out = await Promise.all(
    ids.map(async (id): Promise<ShowcaseVideo | null> => {
      try {
        const job = await deps.getJob(id);
        if (!job || job.status !== 'done' || !job.outputAssetUrl) return null;
        const path = storagePathFromSignedUrl(job.outputAssetUrl, deps.bucket, deps.origin);
        if (!path) return null;
        return { themeId: job.themeId, url: await deps.sign(path, SHOWCASE_URL_TTL_SEC) };
      } catch {
        return null;
      }
    }),
  );
  return out.filter((v): v is ShowcaseVideo => v !== null);
}

const cachedShowcase = unstable_cache(
  async (raw: string): Promise<ShowcaseVideo[]> => {
    const origin = env.NEXT_PUBLIC_SUPABASE_URL;
    if (!origin) return [];
    const media = new SupabaseMediaStore(createSupabaseAdminClient(), env.SUPABASE_MEDIA_BUCKET);
    const store = getStore();
    return showcaseVideos(parseShowcaseIds(raw), {
      getJob: (id) => store.getJob(id),
      bucket: env.SUPABASE_MEDIA_BUCKET,
      origin,
      sign: (path, ttl) => media.signedUrl(path, ttl),
    });
  },
  ['landing-showcase'],
  { revalidate: SHOWCASE_CACHE_SEC },
);

/** The hero's videos, or [] in mock mode / when none are configured. */
export async function getShowcaseVideos(): Promise<ShowcaseVideo[]> {
  const raw = env.LANDING_SHOWCASE_JOB_IDS;
  if (!isSupabaseConfigured() || parseShowcaseIds(raw).length === 0) return [];
  return cachedShowcase(raw ?? '');
}
