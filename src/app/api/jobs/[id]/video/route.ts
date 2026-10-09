/**
 * GET /api/jobs/:id/video — open the signed-in user's finished video.
 * Re-signs the stored MP4 on every click and redirects to it, so the gallery's
 * Watch link keeps working after the render's original 24h URL has expired.
 * `?download=1` signs it as an attachment so the browser saves the MP4.
 */
import { getCurrentUser } from '@/features/auth/session';
import { getStore, isSupabaseConfigured } from '@/features/render/store';
import { watchUrlFor } from '@/features/render/watch';
import { SupabaseMediaStore } from '@/features/providers/live/media-store';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import { env } from '@/lib/env';

const STATUS = { not_found: 404, not_ready: 409, not_playable: 404 } as const;

export async function GET(request: Request, { params }: RouteContext<'/api/jobs/[id]/video'>) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });
  // Mock mode has no media store, so there is nothing playable to sign.
  if (!isSupabaseConfigured() || !env.NEXT_PUBLIC_SUPABASE_URL) {
    return Response.json({ error: 'not_playable' }, { status: 404 });
  }

  const { id } = await params;
  const media = new SupabaseMediaStore(createSupabaseAdminClient(), env.SUPABASE_MEDIA_BUCKET);
  const download = new URL(request.url).searchParams.get('download') === '1';
  const result = await watchUrlFor(
    await getStore().getJob(id),
    user.id,
    {
      bucket: env.SUPABASE_MEDIA_BUCKET,
      origin: env.NEXT_PUBLIC_SUPABASE_URL,
      sign: (path, ttlSec, opts) => media.signedUrl(path, ttlSec, opts),
    },
    { download },
  );
  if (!result.ok) return Response.json({ error: result.reason }, { status: STATUS[result.reason] });
  return Response.redirect(result.url, 302);
}
