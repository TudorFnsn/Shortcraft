/**
 * Live Voice Design adapter (ElevenLabs "text to voice"): a description in, 3
 * sample voices out (each a generated voice id + audio); saving one makes it a
 * permanent voice on our ElevenLabs account (one custom-voice slot each).
 *
 * The API key needs the Voices permission (create + delete), not just Text to
 * Speech. `scripts/voice-design-smoke.mts` checks the whole flow against the
 * real API: design → save → delete.
 */
import type { DesignedSample, VoiceDesigner } from '@/features/voice/designer';
import { SAMPLE_TEXT } from '@/features/voice/designer';

const API = 'https://api.elevenlabs.io/v1';
/** ElevenLabs' voice design model (multilingual). */
export const VOICE_DESIGN_MODEL = 'eleven_multilingual_ttv_v2';

interface DesignResponse {
  previews?: { audio_base_64?: string; generated_voice_id?: string; media_type?: string }[];
}

export function createElevenLabsVoiceDesigner(deps: {
  apiKey: () => string;
  fetch?: typeof fetch;
}): VoiceDesigner {
  const doFetch = deps.fetch ?? fetch;
  const call = async (path: string, init: RequestInit) => {
    const res = await doFetch(`${API}${path}`, {
      ...init,
      headers: { 'xi-api-key': deps.apiKey(), 'content-type': 'application/json' },
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      const hint = res.status === 401 ? ' (does the API key have the Voices permission?)' : '';
      throw new Error(`ElevenLabs ${path} failed: ${res.status}${hint} ${detail}`);
    }
    return res;
  };

  return {
    async design(description) {
      const res = await call('/text-to-voice/design', {
        method: 'POST',
        body: JSON.stringify({
          voice_description: description,
          model_id: VOICE_DESIGN_MODEL,
          text: SAMPLE_TEXT,
        }),
      });
      const body = (await res.json()) as DesignResponse;
      const samples: DesignedSample[] = (body.previews ?? [])
        .filter((p) => p.audio_base_64 && p.generated_voice_id)
        .map((p) => ({
          generatedVoiceId: p.generated_voice_id!,
          audioDataUrl: `data:${p.media_type ?? 'audio/mpeg'};base64,${p.audio_base_64}`,
        }));
      if (samples.length === 0) throw new Error('ElevenLabs voice design returned no samples');
      // Billed by the characters of the sample text, at multilingual rates (~$0.20 / 1k).
      return { samples, costUsd: (SAMPLE_TEXT.length / 1000) * 0.2 };
    },

    async save(generatedVoiceId, name, description) {
      const res = await call('/text-to-voice', {
        method: 'POST',
        body: JSON.stringify({
          voice_name: name,
          voice_description: description,
          generated_voice_id: generatedVoiceId,
          labels: { source: 'shortcraft' },
        }),
      });
      const body = (await res.json()) as { voice_id?: string };
      if (!body.voice_id) throw new Error('ElevenLabs did not return a voice id');
      return body.voice_id;
    },

    async remove(providerVoiceId) {
      const res = await doFetch(`${API}/voices/${encodeURIComponent(providerVoiceId)}`, {
        method: 'DELETE',
        headers: { 'xi-api-key': deps.apiKey() },
      });
      // Already deleted at ElevenLabs is fine; anything else must surface.
      if (!res.ok && res.status !== 404) {
        throw new Error(`ElevenLabs voice delete failed: ${res.status}`);
      }
    },
  };
}
