/**
 * POST /api/voices/design { description } → { roundId, samples: [{ audioDataUrl }], credits }
 * (Voice Studio V4). One paid round of 3 designed sample voices
 * (VOICE_DESIGN_ROUND_CREDITS; refunded if the provider fails). The
 * description is screened like a topic and must describe a type of voice,
 * not a real person. Keep a sample with POST /api/voices { roundId, sample, name }.
 */
import { z } from 'zod';
import { getCurrentUser } from '@/features/auth/session';
import { getPromptModerator } from '@/features/moderation/moderator';
import { getVoiceDesigner } from '@/features/providers/registry';
import { getStore } from '@/features/render/store';
import { DESCRIPTION_MAX, designVoice } from '@/features/voice/my-voices';
import { errorStatus } from '@/features/voice/http';
import { getUserVoiceStore } from '@/features/voice/store';
import { logger } from '@/lib/logger';

const Body = z.object({
  description: z
    .string()
    .min(1)
    .max(DESCRIPTION_MAX * 2),
});

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'invalid_input', issues: parsed.error.issues }, { status: 400 });
  }

  // Screened before anything is held: a blocked description is free.
  const moderation = await getPromptModerator().check(parsed.data.description);
  if (!moderation.ok) {
    logger.warn('voice description blocked', {
      userId: user.id,
      category: moderation.error.category,
    });
    return Response.json(
      { error: moderation.error.code, message: moderation.error.message },
      { status: 422 },
    );
  }

  const res = await designVoice(
    { voices: getUserVoiceStore(), credits: getStore(), designer: getVoiceDesigner() },
    user.id,
    parsed.data.description,
  );
  if (!res.ok) {
    return Response.json(
      { error: res.error.code, message: res.error.message },
      { status: errorStatus(res.error.code) },
    );
  }
  return Response.json(res.value);
}

/** Voice Design takes several seconds per round. */
export const maxDuration = 60;
