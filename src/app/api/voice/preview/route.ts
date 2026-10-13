/**
 * POST /api/voice/preview — "Hear this line" (Voice Studio V3): speaks one line
 * in a catalog voice or the caller's saved voice, free, cached and capped per
 * user (features/voice/preview.ts).
 * Body: { text, themeId, voiceId?, speed?, delivery? } → { audioUrl, cached }.
 * The line is screened like a topic first; a block costs nothing.
 */
import { z } from 'zod';
import { isThemeId } from '@/config/themes';
import { getCurrentUser } from '@/features/auth/session';
import { getPromptModerator } from '@/features/moderation/prompt-check';
import { isSupabaseConfigured } from '@/features/render/store';
import { VoiceFields, voiceChoice } from '@/features/render/voice';
import { InMemoryPreviewLog, PREVIEW_MAX_CHARS, previewLine } from '@/features/voice/preview';
import { SupabasePreviewLog } from '@/features/voice/preview.supabase';
import { isUserVoiceId } from '@/config/voices';
import { getUserVoiceStore } from '@/features/voice/store';

const Body = VoiceFields.extend({
  text: z
    .string()
    .min(1)
    .max(PREVIEW_MAX_CHARS * 2),
  themeId: z.string().refine(isThemeId, 'unknown theme'),
});

let memoryLog: InMemoryPreviewLog | null = null;

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return Response.json({ error: 'unauthorized' }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: 'invalid_input', issues: parsed.error.issues }, { status: 400 });
  }

  const moderation = await getPromptModerator().check(parsed.data.text);
  if (!moderation.ok) {
    return Response.json(
      { error: moderation.error.code, message: moderation.error.message },
      { status: 422 },
    );
  }

  // A saved voice speaks only for its owner; someone else's id reads as unknown.
  let own = null;
  if (parsed.data.voiceId && isUserVoiceId(parsed.data.voiceId)) {
    const v = await getUserVoiceStore().getVoice(parsed.data.voiceId);
    if (!v || v.userId !== user.id) {
      return Response.json({ error: 'invalid_input', message: 'Unknown voice.' }, { status: 400 });
    }
    own = v;
  }

  const log = isSupabaseConfigured()
    ? new SupabasePreviewLog()
    : (memoryLog ??= new InMemoryPreviewLog());
  const choice = voiceChoice(parsed.data);
  const res = await previewLine(
    log,
    user.id,
    {
      text: parsed.data.text,
      themeId: parsed.data.themeId,
      own,
      ...(choice.voiceId ? { voiceId: choice.voiceId } : {}),
      ...(choice.voiceSettings ? { settings: choice.voiceSettings } : {}),
    },
    new Date(),
  );
  if (!res.ok) {
    const status = res.error.code === 'rate_limited' ? 429 : 400;
    return Response.json({ error: res.error.code, message: res.error.message }, { status });
  }
  return Response.json(res.value);
}
