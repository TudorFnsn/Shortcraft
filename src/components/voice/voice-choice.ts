/**
 * The creator's voice pick on Create (Voice Studio V2). Pure, unit-tested
 * (tests/ui/voice-choice.test.ts).
 *
 * `voiceId: null` means "follow the look": the video uses the look's default
 * voice and the pill changes with the look. Once a voice is picked it stays.
 */
import {
  DEFAULT_VOICE_SETTINGS,
  defaultVoiceFor,
  getVoice,
  isVoiceId,
  type VoiceDelivery,
  type VoiceId,
  type VoiceSettings,
  type VoiceSpeed,
} from '@/config/voices';

export interface VoicePick {
  voiceId: VoiceId | null;
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

/** Where the pick starts: the creator's last video, like the other settings. */
export function initialVoice(
  lastJob: { voiceId?: string | null; voiceSettings?: VoiceSettings | null } | null,
): VoicePick {
  const id = lastJob?.voiceId;
  const settings = lastJob?.voiceSettings ?? DEFAULT_VOICE_SETTINGS;
  return {
    voiceId: id && isVoiceId(id) ? id : null,
    speed: settings.speed,
    delivery: settings.delivery,
  };
}

/** The voice the video will actually use. */
export function effectiveVoice(pick: VoicePick, themeId: string): VoiceId {
  return pick.voiceId ?? defaultVoiceFor(themeId);
}

export function voiceName(pick: VoicePick, themeId: string): string {
  return getVoice(effectiveVoice(pick, themeId)).name;
}

/**
 * Fields for `POST /api/jobs`: only what differs from the defaults, so a
 * creator who never opens the sheet sends exactly what they sent before.
 */
export function voiceRequest(pick: VoicePick): {
  voiceId?: VoiceId;
  speed?: VoiceSpeed;
  delivery?: VoiceDelivery;
} {
  return {
    ...(pick.voiceId ? { voiceId: pick.voiceId } : {}),
    ...(pick.speed !== DEFAULT_VOICE_SETTINGS.speed ? { speed: pick.speed } : {}),
    ...(pick.delivery !== DEFAULT_VOICE_SETTINGS.delivery ? { delivery: pick.delivery } : {}),
  };
}
