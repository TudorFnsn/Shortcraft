/**
 * GET /api/jobs/:id/scenes — the narration of the caller's finished video,
 * scene by scene, for the voiceover editor (Voice Studio V3). Read-only.
 * Each line carries the longest length `POST /api/jobs/:id/revoice` accepts,
 * so the editor never offers what the server refuses.
 */
import { getCurrentUser } from '@/features/auth/session';
import { maxNarrationLength } from '@/features/render/revoice';
import { getStore } from '@/features/render/store';

export async function GET(_request: Request, { params }: RouteContext<'/api/jobs/[id]/scenes'>) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const store = getStore();
  const job = await store.getJob(id);
  // Someone else's video is "not found", never "forbidden": no existence leak.
  if (!job || job.userId !== user.id) return Response.json({ error: 'not_found' }, { status: 404 });
  if (job.status !== 'done') return Response.json({ error: 'not_ready' }, { status: 409 });

  const scenes = (await store.listScenes(job.id))
    .sort((a, b) => a.idx - b.idx)
    .map((s) => ({
      idx: s.idx,
      narration: s.narration,
      maxLength: maxNarrationLength(s.narration),
    }));
  return Response.json({ scenes });
}
