/**
 * GET /api/jobs/:id/scenes — what the voiceover editor needs to open a finished
 * video (Voice Studio V3): each scene's narration with the longest line the
 * re-voice API accepts, the voice in use, and the re-voice quote for the
 * current text. Pictures come from /api/jobs/:id/thumbnail?scene=<idx>.
 * Owner-only; someone else's job is a 404.
 */
import { getCurrentUser } from '@/features/auth/session';
import { getStore } from '@/features/render/store';
import { editorView } from '@/features/render/revoice';

export async function GET(_request: Request, { params }: RouteContext<'/api/jobs/[id]/scenes'>) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const store = getStore();
  const job = await store.getJob(id);
  if (!job || job.userId !== user.id) return Response.json({ error: 'not_found' }, { status: 404 });
  return Response.json(editorView(job, await store.listScenes(job.id)));
}
