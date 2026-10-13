/**
 * "Hear this line" (Voice Studio V3): speak one line in a voice, free for the
 * creator. The same line in the same voice and settings is generated once and
 * shared (cache key), and each creator gets at most PREVIEWS_PER_DAY fresh
 * generations per 24 hours, which bounds our ElevenLabs spend (~$0.001 each).
 */
import { createHash } from 'node:crypto';
import { DEFAULT_VOICE_SETTINGS, type VoiceSettings } from '@/config/voices';
import { getVoiceProvider } from '@/features/providers/registry';
import { appError, err, ok, type AppError, type Result } from '@/lib/result';
import { resolveVoice } from '@/features/render/voice';

export const PREVIEWS_PER_DAY = 20;
/** Longest line a preview speaks (a scene's narration fits comfortably). */
export const PREVIEW_MAX_CHARS = 300;
/** Cached audio is reused this long; its signed URL lives 24h. */
export const PREVIEW_CACHE_MS = 20 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface PreviewLog {
  /** A cached preview's audio URL created after `since`, or null. */
  findCached(cacheKey: string, since: Date): Promise<string | null>;
  /** Fresh previews this user generated after `since`. */
  countSince(userId: string, since: Date): Promise<number>;
  record(userId: string, cacheKey: string, audioUrl: string): Promise<void>;
}

export interface PreviewRequest {
  text: string;
  /** Catalog slug; omitted = the look's default for `themeId`. */
  voiceId?: string;
  themeId: string;
  settings?: VoiceSettings;
}

export function previewCacheKey(text: string, voiceId: string, settings: VoiceSettings): string {
  return createHash('sha256')
    .update(JSON.stringify([text, voiceId, settings.speed, settings.delivery]))
    .digest('hex');
}

export async function previewLine(
  log: PreviewLog,
  userId: string,
  req: PreviewRequest,
  now: Date,
): Promise<Result<{ audioUrl: string; cached: boolean }, AppError>> {
  const text = req.text.replace(/\s+/g, ' ').trim();
  if (!text) return err(appError('invalid_input', 'Type a line to hear.'));
  if (text.length > PREVIEW_MAX_CHARS) {
    return err(appError('invalid_input', `A preview is at most ${PREVIEW_MAX_CHARS} characters.`));
  }
  const settings = req.settings ?? DEFAULT_VOICE_SETTINGS;
  const voice = resolveVoice({
    themeId: req.themeId,
    voiceId: req.voiceId ?? null,
    voiceSettings: settings,
  });
  const key = previewCacheKey(text, voice.voiceId, settings);

  const cached = await log.findCached(key, new Date(now.getTime() - PREVIEW_CACHE_MS));
  if (cached) return ok({ audioUrl: cached, cached: true });

  if ((await log.countSince(userId, new Date(now.getTime() - DAY_MS))) >= PREVIEWS_PER_DAY) {
    return err(
      appError(
        'rate_limited',
        `You've heard ${PREVIEWS_PER_DAY} new lines today. Previews come back tomorrow.`,
      ),
    );
  }

  const res = await getVoiceProvider().run(
    { text, voiceId: voice.providerVoiceId, language: 'en', settings: voice.tuning },
    { idempotencyKey: `preview:${key}` },
  );
  if (res.kind !== 'completed') throw new Error('voice previews expect an inline provider');
  await log.record(userId, key, res.output.audioUrl);
  return ok({ audioUrl: res.output.audioUrl, cached: false });
}

/** In-memory log for tests and mock mode (per server process). */
export class InMemoryPreviewLog implements PreviewLog {
  readonly rows: { userId: string; cacheKey: string; audioUrl: string; at: Date }[] = [];
  constructor(private readonly clock: () => Date = () => new Date()) {}

  async findCached(cacheKey: string, since: Date) {
    return (
      this.rows.filter((r) => r.cacheKey === cacheKey && r.at > since).at(-1)?.audioUrl ?? null
    );
  }
  async countSince(userId: string, since: Date) {
    return this.rows.filter((r) => r.userId === userId && r.at > since).length;
  }
  async record(userId: string, cacheKey: string, audioUrl: string) {
    this.rows.push({ userId, cacheKey, audioUrl, at: this.clock() });
  }
}
