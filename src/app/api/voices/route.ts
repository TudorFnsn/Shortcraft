/**
 * My voices (Voice Studio V4).
 *
 * GET  /api/voices → { voices: [{ id, name, description, createdAt }], limit,
 *      prices: { designRound, save } }. `id` is `u_<uuid>`: pass it as
 *      `voiceId` to POST /api/jobs, re-voice or the line preview.
 * POST /api/voices { roundId, sample (0–2), name } → 201 { voice }. Keeps one
 *      sample of a paid design round (POST /api/voices/design) for
 *      SAVE_VOICE_CREDITS; 403 `plan_limit` at the plan's saved-voice limit,
 *      404 when the round isn't the caller's or the sample is gone.
 */
import { z } from 'zod';
import { PLANS } from '@/config/plans';
import { getCurrentUser } from '@/features/auth/session';
import { getVoiceDesigner } from '@/features/providers/registry';
import { SAVE_VOICE_CREDITS, VOICE_DESIGN_ROUND_CREDITS } from '@/features/render/pricing';
import { getStore } from '@/features/render/store';
import { NAME_MAX, publicVoice, saveVoice } from '@/features/voice/my-voices';
import { getUserVoiceStore } from '@/features/voice/store';
import { errorStatus } from '@/features/voice/http';

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const plan = PLANS[await getStore().planOf(user.id)];
  const voices = await getUserVoiceStore().listVoices(user.id);
  return Response.json({
    voices: voices.map(publicVoice),
    limit: plan.limits.savedVoices,
    prices: { designRound: VOICE_DESIGN_ROUND_CREDITS, save: SAVE_VOICE_CREDITS },
  });
}

const Body = z.object({
  roundId: z.string().uuid(),
  sample: z.number().int().min(0).max(9),
  name: z
    .string()
    .min(1)
    .max(NAME_MAX * 2),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'invalid_input', issues: parsed.error.issues }, { status: 400 });
  }

  const store = getStore();
  const plan = PLANS[await store.planOf(user.id)];
  const res = await saveVoice(
    { voices: getUserVoiceStore(), credits: store, designer: getVoiceDesigner() },
    user.id,
    plan,
    parsed.data,
  );
  if (!res.ok) {
    return Response.json(
      { error: res.error.code, message: res.error.message },
      { status: errorStatus(res.error.code) },
    );
  }
  return Response.json({ voice: publicVoice(res.value) }, { status: 201 });
}

/** Saving creates the voice at ElevenLabs; leave room for a slow provider. */
export const maxDuration = 60;
