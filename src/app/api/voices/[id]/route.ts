/**
 * One saved voice (Voice Studio V4), owner-only; someone else's is a 404.
 * PATCH  /api/voices/:id { name } → 204 (rename).
 * DELETE /api/voices/:id → 204. Removes it at ElevenLabs too (frees the slot).
 *        Videos already made keep their audio; a video still rendering with it
 *        narrates with its look's default voice.
 */
import { z } from 'zod';
import { getCurrentUser } from '@/features/auth/session';
import { getVoiceDesigner } from '@/features/providers/registry';
import { NAME_MAX, deleteVoice, renameVoice } from '@/features/voice/my-voices';
import { errorStatus } from '@/features/voice/http';
import { getUserVoiceStore } from '@/features/voice/store';

const Body = z.object({
  name: z
    .string()
    .min(1)
    .max(NAME_MAX * 2),
});

export async function PATCH(request: Request, { params }: RouteContext<'/api/voices/[id]'>) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'invalid_input', issues: parsed.error.issues }, { status: 400 });
  }
  const { id } = await params;
  const res = await renameVoice(getUserVoiceStore(), user.id, id, parsed.data.name);
  if (!res.ok) {
    return Response.json(
      { error: res.error.code, message: res.error.message },
      { status: errorStatus(res.error.code) },
    );
  }
  return new Response(null, { status: 204 });
}

export async function DELETE(_request: Request, { params }: RouteContext<'/api/voices/[id]'>) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const { id } = await params;
  const res = await deleteVoice(
    { voices: getUserVoiceStore(), designer: getVoiceDesigner() },
    user.id,
    id,
  );
  if (!res.ok) {
    return Response.json(
      { error: res.error.code, message: res.error.message },
      { status: errorStatus(res.error.code) },
    );
  }
  return new Response(null, { status: 204 });
}
