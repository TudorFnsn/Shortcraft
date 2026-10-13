/**
 * POST /api/jobs/:id/posted — mark or unmark the signed-in user's finished video
 * as posted, so the Library streak follows them across devices.
 * Body: { posted: boolean, postedAt?: ISO string (one-time browser import) }.
 */
import { getCurrentUser } from '@/features/auth/session';
import { decidePosted } from '@/features/render/posted';
import { getStore } from '@/features/render/store';

export async function POST(request: Request, { params }: RouteContext<'/api/jobs/[id]/posted'>) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const store = getStore();
  const body: unknown = await request.json().catch(() => null);
  const result = decidePosted(await store.getJob(id), user.id, body, new Date());
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status });

  await store.setJobPosted(id, result.postedAt);
  return Response.json({ postedAt: result.postedAt });
}
