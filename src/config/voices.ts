/**
 * Voice catalog (Voice Studio V1): the narrator voices a creator can pick, the
 * default voice per look, and the speed / delivery presets.
 *
 * Voices are ElevenLabs "premade" voices, usable by every account with no
 * custom-voice slot. Our own slugs are what the app stores and the API
 * accepts; the provider id never leaves the server, and the API never takes a
 * raw provider id (TheMasterPlan §8: voice misuse). `scripts/voice-previews.mts`
 * checks every id still exists at ElevenLabs and records the preview samples
 * in `public/voices/<slug>.mp3`.
 */
import { THEMES } from './themes';

export interface CatalogVoice {
  /** Our stable id, stored on jobs and sent by the client. */
  id: string;
  name: string;
  /** Two words, shown under the name. */
  character: string;
  /** ElevenLabs premade voice id. */
  providerVoiceId: string;
}

export const VOICES = [
  {
    id: 'brian',
    name: 'Brian',
    character: 'Deep narrator',
    providerVoiceId: 'nPczCjzI2devNBz1zQrb',
  },
  {
    id: 'george',
    name: 'George',
    character: 'Warm storyteller',
    providerVoiceId: 'JBFqnCBsd6RMkjVDRZzb',
  },
  {
    id: 'sarah',
    name: 'Sarah',
    character: 'Soft, reassuring',
    providerVoiceId: 'EXAVITQu4vr4xnSDxMaL',
  },
  {
    id: 'jessica',
    name: 'Jessica',
    character: 'Bright, expressive',
    providerVoiceId: 'cgSgspJ2msm6clMCkdW9',
  },
  {
    id: 'will',
    name: 'Will',
    character: 'Friendly, upbeat',
    providerVoiceId: 'bIHbv24MWmeRgasZH58o',
  },
  {
    id: 'callum',
    name: 'Callum',
    character: 'Gravelly, intense',
    providerVoiceId: 'N2lVS1w4EtoT3dr4eOWO',
  },
  {
    id: 'daniel',
    name: 'Daniel',
    character: 'Calm, authoritative',
    providerVoiceId: 'onwK4e9ZLuTAKqWW03F9',
  },
  {
    id: 'charlie',
    name: 'Charlie',
    character: 'Casual, laid-back',
    providerVoiceId: 'IKne3meq5aSn9XLyUdCD',
  },
] as const satisfies readonly CatalogVoice[];

export type VoiceId = (typeof VOICES)[number]['id'];

export const isVoiceId = (id: string): id is VoiceId => VOICES.some((v) => v.id === id);

/**
 * A creator's own designed voice (Voice Studio V4): `u_<uuid>`. Who owns it
 * is checked on the server (features/voice/my-voices.ts `canUseVoice`).
 */
const USER_VOICE_ID = /^u_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const isUserVoiceId = (id: string): boolean => USER_VOICE_ID.test(id);

export function getVoice(id: VoiceId): CatalogVoice {
  return VOICES.find((v) => v.id === id)!;
}

/** The voice a look uses until the creator picks another. Every theme must have one (tested). */
export const THEME_DEFAULT_VOICE: Record<string, VoiceId> = {
  'office-drama': 'jessica',
  'horror-story': 'callum',
  'fun-facts': 'will',
  'life-hack': 'charlie',
  motivation: 'brian',
  'mini-doc': 'daniel',
  'comedy-skit': 'will',
  'story-time': 'george',
};

/** Fallback for a theme added without a default (the test catches it first). */
export const FALLBACK_VOICE: VoiceId = 'brian';

export function defaultVoiceFor(themeId: string): VoiceId {
  return THEME_DEFAULT_VOICE[themeId] ?? FALLBACK_VOICE;
}

export const VOICE_SPEEDS = ['slower', 'normal', 'faster'] as const;
export type VoiceSpeed = (typeof VOICE_SPEEDS)[number];

export const VOICE_DELIVERIES = ['calm', 'natural', 'lively'] as const;
export type VoiceDelivery = (typeof VOICE_DELIVERIES)[number];

/** What a job stores: the creator's choice, in our own words (not provider numbers). */
export interface VoiceSettings {
  speed: VoiceSpeed;
  delivery: VoiceDelivery;
}

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = { speed: 'normal', delivery: 'natural' };

/**
 * Provider numbers for a choice. `speed` is ElevenLabs' speaking-rate factor
 * (0.7–1.2); lower `stability` sounds more varied and lively, higher calmer
 * and more even. Kept modest: past ±10% speed, voices start to sound off.
 */
export const SPEED_FACTOR: Record<VoiceSpeed, number> = {
  slower: 0.9,
  normal: 1.0,
  faster: 1.1,
};

export const DELIVERY_STABILITY: Record<VoiceDelivery, number> = {
  calm: 0.75,
  natural: 0.5,
  lively: 0.3,
};

/** Every theme id has a default voice; exported for the catalog test. */
export const themesWithoutDefaultVoice = (): string[] =>
  THEMES.map((t) => t.id).filter((id) => !(id in THEME_DEFAULT_VOICE));
