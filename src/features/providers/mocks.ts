/**
 * Deterministic mock providers.
 *
 * Every mock COMPLETES inline with a stable fake asset URL derived from its
 * input, so the full render pipeline runs end-to-end in ~1s with no network and
 * no API keys. Same input => same output, which makes pipeline tests reliable.
 *
 * Providers are model-bound (constructed for a ModelSpec) so `costCredits`
 * reflects the selected tier's price.
 */
import type { ModelSpec } from '@/config/models';
import type {
  ImageInput,
  ImageOutput,
  ImageProvider,
  Provider,
  ProviderContext,
  ProviderJob,
  RenderInput,
  RenderOutput,
  RenderProvider,
  ScriptInput,
  ScriptOutput,
  ScriptProvider,
  VideoInput,
  VideoOutput,
  VideoProvider,
  VoiceInput,
  VoiceOutput,
  VoiceProvider,
  WebhookPayload,
  WordTiming,
} from './types';

/** FNV-1a — small, dependency-free, stable across runs. */
export function hash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

/** Rough speech length used to estimate voice cost before we know the audio. */
export function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 2.5)); // ~150 wpm
}

const notAsync = () => {
  throw new Error('mock providers complete inline; poll/webhook is never used');
};

/** Shared no-op async surface for inline-completing mocks. */
function inlineOnly<Output>(): Pick<Provider<unknown, Output>, 'poll' | 'parseWebhook'> {
  return {
    poll: async (_job: ProviderJob) => notAsync(),
    parseWebhook: async (_payload: WebhookPayload) => notAsync(),
  };
}

export function createMockScriptProvider(model: ModelSpec): ScriptProvider {
  return {
    id: model.providerId,
    kind: 'script',
    costCredits: () => model.creditsPerUnit,
    async run(input: ScriptInput, _ctx: ProviderContext) {
      const sceneCount = Math.max(2, Math.round(input.targetDurationSec / 6));
      const scenes = Array.from({ length: sceneCount }, (_, index) => ({
        index,
        narration: `[${input.themeId}] Scene ${index + 1} about ${input.topic}.`,
        imagePrompt: `${input.topic}, ${input.themeId} style, scene ${index + 1}, vertical`,
        motionPrompt: `slow push-in, scene ${index + 1}`,
        durationSec: 6,
      }));
      const output: ScriptOutput = {
        title: `${input.topic} (${input.themeId})`,
        scenes,
      };
      return { kind: 'completed', output, costUsd: model.costUsdPerUnit };
    },
    ...inlineOnly<ScriptOutput>(),
  };
}

export function createMockImageProvider(model: ModelSpec): ImageProvider {
  return {
    id: model.providerId,
    kind: 'image',
    costCredits: () => model.creditsPerUnit,
    async run(input: ImageInput, _ctx: ProviderContext) {
      const output: ImageOutput = {
        imageUrl: `mock://image/${hash(input.prompt + (input.seed ?? ''))}.png`,
        width: 1080,
        height: 1920,
      };
      return { kind: 'completed', output, costUsd: model.costUsdPerUnit };
    },
    ...inlineOnly<ImageOutput>(),
  };
}

export function createMockVideoProvider(model: ModelSpec): VideoProvider {
  return {
    id: model.providerId,
    kind: 'video',
    costCredits: (input) => Math.ceil(input.durationSec) * model.creditsPerUnit,
    async run(input: VideoInput, _ctx: ProviderContext) {
      const output: VideoOutput = {
        videoUrl: `mock://video/${hash(input.imageUrl + input.motionPrompt)}.mp4`,
        durationSec: input.durationSec,
      };
      return {
        kind: 'completed',
        output,
        costUsd: model.costUsdPerUnit * Math.ceil(input.durationSec),
      };
    },
    ...inlineOnly<VideoOutput>(),
  };
}

export function createMockVoiceProvider(model: ModelSpec): VoiceProvider {
  return {
    id: model.providerId,
    kind: 'voice',
    costCredits: (input) => estimateSpeechSeconds(input.text) * model.creditsPerUnit,
    async run(input: VoiceInput, _ctx: ProviderContext) {
      const words = input.text.trim().split(/\s+/).filter(Boolean);
      const perWordMs = 400;
      const timings: WordTiming[] = words.map((word, i) => ({
        word,
        startMs: i * perWordMs,
        endMs: (i + 1) * perWordMs,
      }));
      const durationMs = words.length * perWordMs;
      const output: VoiceOutput = {
        audioUrl: `mock://audio/${hash(input.text + input.voiceId)}.mp3`,
        durationMs,
        words: timings,
      };
      return {
        kind: 'completed',
        output,
        costUsd: model.costUsdPerUnit * (durationMs / 1000),
      };
    },
    ...inlineOnly<VoiceOutput>(),
  };
}

export function createMockRenderProvider(model: ModelSpec): RenderProvider {
  return {
    id: model.providerId,
    kind: 'render',
    costCredits: () => model.creditsPerUnit,
    async run(input: RenderInput, _ctx: ProviderContext) {
      const lastClip = input.clips[input.clips.length - 1];
      const durationSec = lastClip ? Math.ceil((lastClip.startMs + 6000) / 1000) : 0;
      const output: RenderOutput = {
        videoUrl: `mock://render/${hash(input.clips.map((c) => c.videoUrl).join(','))}.mp4`,
        durationSec,
      };
      return { kind: 'completed', output, costUsd: model.costUsdPerUnit };
    },
    ...inlineOnly<RenderOutput>(),
  };
}
