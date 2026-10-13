/**
 * Which voice a job is narrated with (Voice Studio V1). Pure, unit-tested.
 * The job stores our catalog slug + the creator's settings in plain words;
 * this turns them into the provider's voice id and tuning numbers.
 */
import { z } from 'zod';
import {
  DEFAULT_VOICE_SETTINGS,
  VOICE_DELIVERIES,
  VOICE_SPEEDS,
  DELIVERY_STABILITY,
  SPEED_FACTOR,
  defaultVoiceFor,
  getVoice,
  isUserVoiceId,
  isVoiceId,
  type VoiceDelivery,
  type VoiceSettings,
  type VoiceSpeed,
} from '@/config/voices';
import type { VoiceTuning } from '@/features/providers/types';
import type { RenderJobRecord } from './repository';

export interface ResolvedVoice {
  /** Catalog slug actually used (the look's default when none was chosen). */
  voiceId: string;
  providerVoiceId: string;
  tuning: VoiceTuning;
}

export function tuningFor(settings: VoiceSettings): VoiceTuning {
  return {
    speed: SPEED_FACTOR[settings.speed],
    stability: DELIVERY_STABILITY[settings.delivery],
  };
}

/** A creator's saved voice, as the resolver needs it (looked up by the caller). */
export interface OwnVoice {
  id: string;
  providerVoiceId: string;
}

/**
 * `own` is the job's saved voice when `job.voiceId` is a `u_` id the caller
 * looked up and the job's owner still has; otherwise (deleted voice, retired
 * catalog slug) the look's default narrates instead of failing a paid render.
 */
export function resolveVoice(
  job: Pick<RenderJobRecord, 'themeId' | 'voiceId' | 'voiceSettings'>,
  own: OwnVoice | null = null,
): ResolvedVoice {
  const tuning = tuningFor(job.voiceSettings ?? DEFAULT_VOICE_SETTINGS);
  if (own && job.voiceId === own.id) {
    return { voiceId: own.id, providerVoiceId: own.providerVoiceId, tuning };
  }
  const voiceId =
    job.voiceId && isVoiceId(job.voiceId) ? job.voiceId : defaultVoiceFor(job.themeId);
  return {
    voiceId,
    providerVoiceId: getVoice(voiceId).providerVoiceId,
    tuning,
  };
}

/**
 * The voice fields a new job stores: only what the creator chose. Nothing
 * chosen = nothing stored, so job creation keeps working before migration 0010
 * and the job follows its look's default voice.
 */
export function voiceChoice(b: {
  voiceId?: string;
  speed?: VoiceSpeed;
  delivery?: VoiceDelivery;
}): {
  voiceId?: string;
  voiceSettings?: VoiceSettings;
} {
  return {
    ...(b.voiceId ? { voiceId: b.voiceId } : {}),
    ...(b.speed || b.delivery
      ? {
          voiceSettings: {
            speed: b.speed ?? DEFAULT_VOICE_SETTINGS.speed,
            delivery: b.delivery ?? DEFAULT_VOICE_SETTINGS.delivery,
          },
        }
      : {}),
  };
}

/**
 * Request fields for a voice choice (`POST /api/jobs`, later the re-voice
 * editor, previews). A catalog slug or a saved voice's `u_` id; never a raw
 * provider voice id, so nobody can narrate with a voice we didn't vet. The
 * route must still check a `u_` id belongs to the caller (`canUseVoice`).
 */
export const VoiceFields = z.object({
  voiceId: z
    .string()
    .refine((id) => isVoiceId(id) || isUserVoiceId(id), 'unknown voice')
    .optional(),
  speed: z.enum(VOICE_SPEEDS).optional(),
  delivery: z.enum(VOICE_DELIVERIES).optional(),
});
