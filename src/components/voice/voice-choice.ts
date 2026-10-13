/**
 * The creator's voice pick on Create and in the editor (Voice Studio V2–V4).
 * Pure, unit-tested (tests/ui/voice-choice.test.ts).
 *
 * `voiceId: null` means "follow the look": the video uses the look's default
 * voice and the pill changes with the look. Once a voice is picked it stays.
 * A picked voice is a catalog slug or one of the creator's saved voices
 * (`u_<uuid>`, V4).
 */
import {
  DEFAULT_VOICE_SETTINGS,
  defaultVoiceFor,
  getVoice,
  isUserVoiceId,
  isVoiceId,
  type VoiceDelivery,
  type VoiceSettings,
  type VoiceSpeed,
} from '@/config/voices';

/** A saved voice as the UI sees it (`GET /api/voices`; no provider id). */
export interface MyVoice {
  id: string;
  name: string;
  description: string;
}

export interface VoicePick {
  voiceId: string | null;
  speed: VoiceSpeed;
  delivery: VoiceDelivery;
}

export const SPEED_LABEL: Record<VoiceSpeed, string> = {
  slower: 'Slower',
  normal: 'Normal',
  faster: 'Faster',
};

export const DELIVERY_LABEL: Record<VoiceDelivery, string> = {
  calm: 'Calm',
  natural: 'Natural',
  lively: 'Lively',
};

/** A voice the creator can pick right now: a catalog voice or one of their own. */
export function isPickable(id: string, mine: readonly MyVoice[]): boolean {
  return isVoiceId(id) || (isUserVoiceId(id) && mine.some((v) => v.id === id));
}

/** Where the pick starts: the creator's last video, like the other settings. */
export function initialVoice(
  lastJob: { voiceId?: string | null; voiceSettings?: VoiceSettings | null } | null,
  mine: readonly MyVoice[] = [],
): VoicePick {
  const id = lastJob?.voiceId;
  const settings = lastJob?.voiceSettings ?? DEFAULT_VOICE_SETTINGS;
  return {
    // A deleted saved voice or a retired catalog voice: follow the look again.
    voiceId: id && isPickable(id, mine) ? id : null,
    speed: settings.speed,
    delivery: settings.delivery,
  };
}

/** The voice the video will actually use. */
export function effectiveVoice(pick: VoicePick, themeId: string): string {
  return pick.voiceId ?? defaultVoiceFor(themeId);
}

/** Display name of a catalog or saved voice ("Your voice" if it's gone). */
export function nameOf(id: string, mine: readonly MyVoice[]): string {
  if (isVoiceId(id)) return getVoice(id).name;
  return mine.find((v) => v.id === id)?.name ?? 'Your voice';
}

export function voiceName(pick: VoicePick, themeId: string, mine: readonly MyVoice[] = []): string {
  return nameOf(effectiveVoice(pick, themeId), mine);
}

/**
 * Fields for `POST /api/jobs`: only what differs from the defaults, so a
 * creator who never opens the sheet sends exactly what they sent before.
 */
export function voiceRequest(pick: VoicePick): {
  voiceId?: string;
  speed?: VoiceSpeed;
  delivery?: VoiceDelivery;
} {
  return {
    ...(pick.voiceId ? { voiceId: pick.voiceId } : {}),
    ...(pick.speed !== DEFAULT_VOICE_SETTINGS.speed ? { speed: pick.speed } : {}),
    ...(pick.delivery !== DEFAULT_VOICE_SETTINGS.delivery ? { delivery: pick.delivery } : {}),
  };
}

/** The line a saved voice speaks when its ▶ is pressed (free, cached preview). */
export const SAMPLE_LINE = 'Here’s a quick fact you probably didn’t know, in thirty seconds.';
