/**
 * Live voice adapter: ElevenLabs text-to-speech with character timestamps.
 *
 * One `with-timestamps` call per job returns the MP3 (base64) plus per-character
 * start/end times. We group characters into words for burned-in captions, store
 * the audio in the media store, and complete inline (TTS for a short video takes
 * seconds), so poll/webhook are never used.
 *
 * Model: eleven_flash_v2_5 — the catalog prices voice at Flash rates
 * ($0.05 per 1k characters). Voice: ELEVENLABS_VOICE_ID, or a stock voice.
 */
import type { ModelSpec } from '@/config/models';
import { estimateSpeechSeconds } from '../mocks';
import type {
  ProviderContext,
  ProviderJob,
  VoiceInput,
  VoiceOutput,
  VoiceProvider,
  WebhookPayload,
  WordTiming,
} from '../types';
import { mediaPath, type MediaStore } from './media-store';

export const ELEVENLABS_MODEL = 'eleven_flash_v2_5';
/** ElevenLabs stock voice used until the owner picks one (ELEVENLABS_VOICE_ID). */
export const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';
/** Flash list price: $0.05 per 1,000 characters. */
export const USD_PER_CHAR = 0.05 / 1000;

const ENDPOINT = 'https://api.elevenlabs.io/v1/text-to-speech';

export interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

interface TimestampsResponse {
  audio_base64: string;
  alignment: Alignment | null;
  normalized_alignment?: Alignment | null;
}

/** Group a character alignment into words (split on whitespace). */
export function wordsFromAlignment(a: Alignment): WordTiming[] {
  const words: WordTiming[] = [];
  let current = '';
  let start = 0;
  let end = 0;
  const flush = () => {
    if (current) words.push({ word: current, startMs: start, endMs: end });
    current = '';
  };
  a.characters.forEach((ch, i) => {
    if (/\s/.test(ch)) return flush();
    const s = Math.round((a.character_start_times_seconds[i] ?? 0) * 1000);
    const e = Math.round((a.character_end_times_seconds[i] ?? 0) * 1000);
    if (!current) start = s;
    current += ch;
    end = e;
  });
  flush();
  return words;
}

const notAsync = () => {
  throw new Error('the voice adapter completes inline; poll/webhook is never used');
};

export function createElevenLabsVoiceProvider(
  model: ModelSpec,
  deps: {
    apiKey: () => string;
    store: () => MediaStore;
    voiceId?: string;
    fetch?: typeof fetch;
  },
): VoiceProvider {
  const doFetch = deps.fetch ?? fetch;

  return {
    id: model.providerId,
    kind: 'voice',
    costCredits: (input) => estimateSpeechSeconds(input.text) * model.creditsPerUnit,

    async run(input: VoiceInput, ctx: ProviderContext) {
      const voiceId =
        input.voiceId && input.voiceId !== 'default'
          ? input.voiceId
          : (deps.voiceId ?? DEFAULT_VOICE_ID);
      const res = await doFetch(
        `${ENDPOINT}/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
        {
          method: 'POST',
          headers: { 'xi-api-key': deps.apiKey(), 'content-type': 'application/json' },
          body: JSON.stringify({ text: input.text, model_id: ELEVENLABS_MODEL }),
        },
      );
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 300);
        throw new Error(`ElevenLabs TTS failed: ${res.status} ${detail}`);
      }
      const body = (await res.json()) as TimestampsResponse;
      const alignment = body.alignment ?? body.normalized_alignment;
      if (!body.audio_base64 || !alignment) {
        throw new Error('ElevenLabs TTS returned no audio or alignment');
      }

      const words = wordsFromAlignment(alignment);
      const lastEnd = alignment.character_end_times_seconds.at(-1) ?? 0;
      const bytes = Uint8Array.from(Buffer.from(body.audio_base64, 'base64'));
      // Keyed by the step's idempotency key, so a retry overwrites, not duplicates.
      const audioUrl = await deps
        .store()
        .put(mediaPath('voiceover', ctx.idempotencyKey, 'mp3'), bytes, 'audio/mpeg');

      const output: VoiceOutput = {
        audioUrl,
        durationMs: Math.round(lastEnd * 1000),
        words,
      };
      return { kind: 'completed', output, costUsd: input.text.length * USD_PER_CHAR };
    },

    poll: async (_job: ProviderJob) => notAsync(),
    parseWebhook: async (_payload: WebhookPayload) => notAsync(),
  };
}
