/**
 * Voice Design port (Voice Studio V4): turn a description into 3 sample
 * voices, keep one as a permanent voice, and delete it again. ElevenLabs in
 * live mode (`providers/live/elevenlabs-voice-design.ts`), a deterministic
 * mock otherwise, so the whole flow runs and is tested with no API key.
 */
import { createHash } from 'node:crypto';

export interface DesignedSample {
  /** The provider's id for this sample; pass it back to `save`. */
  generatedVoiceId: string;
  /** The sample audio as a data URL, played straight in the browser. */
  audioDataUrl: string;
}

export interface VoiceDesigner {
  design(description: string): Promise<{ samples: DesignedSample[]; costUsd: number }>;
  /** Keeps one sample as a permanent voice. Returns the provider voice id. */
  save(generatedVoiceId: string, name: string, description: string): Promise<string>;
  /** Deletes a saved voice at the provider. A voice that is already gone is fine. */
  remove(providerVoiceId: string): Promise<void>;
}

/** The sentence every sample speaks: long enough for ElevenLabs' 100-character minimum. */
export const SAMPLE_TEXT =
  "Here's a story worth hearing. Stay with me until the end, because the last part is the one nobody expects.";

const h = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 20);

export function createMockVoiceDesigner(): VoiceDesigner {
  return {
    async design(description) {
      const samples = [0, 1, 2].map((i) => ({
        generatedVoiceId: `mockgen_${h(`${description}:${i}`)}`,
        audioDataUrl: `data:audio/mpeg;base64,${Buffer.from(`mock-${i}`).toString('base64')}`,
      }));
      return { samples, costUsd: 0 };
    },
    async save(generatedVoiceId) {
      return `mockvoice_${h(generatedVoiceId)}`;
    },
    async remove() {},
  };
}
