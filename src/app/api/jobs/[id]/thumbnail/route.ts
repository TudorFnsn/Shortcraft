/**
 * GET /api/jobs/:id/thumbnail — the signed-in user's video thumbnail (first
 * scene image). Re-signs it on each request and redirects, like /video, so a
 * Library card's <img src> never goes stale. 409 while the image isn't made yet.
 */
import { getCurrentUser } from '@/features/auth/session';
import { getStore, isSupabaseConfigured } from '@/features/render/store';
import { THUMBNAIL_CACHE_SEC, thumbnailUrlFor } from '@/features/render/watch';
import { SupabaseMediaStore } from '@/features/providers/live/media-store';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { env } from '@/lib/env';

const STATUS = { not_found: 404, not_ready: 409, not_playable: 404 } as const;

export async function GET(_request: Request, { params }: RouteContext<'/api/jobs/[id]/thumbnail'>) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  // Mock mode has no media store; the Library shows a placeholder instead.
  if (!isSupabaseConfigured() || !env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ error: 'not_playable' }, { status: 404 });
  }

  const { id } = await params;
  const media = new SupabaseMediaStore(createSupabaseAdminClient(), env.SUPABASE_MEDIA_BUCKET);
  const store = getStore();
  const result = await thumbnailUrlFor(
    await store.getJob(id),
    user.id,
    (jobId) => store.listScenes(jobId),
    {
      bucket: env.SUPABASE_MEDIA_BUCKET,
      origin: env.NEXT_PUBLIC_SUPABASE_URL,
      sign: (path, ttlSec) => media.signedUrl(path, ttlSec),
    },
  );
  if (!result.ok) return Response.json({ error: result.reason }, { status: STATUS[result.reason] });
  return new Response(null, {
    status: 302,
    headers: {
      Location: result.url,
      'Cache-Control': `private, max-age=${THUMBNAIL_CACHE_SEC}`,
    },
  });
}
