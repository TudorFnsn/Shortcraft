/**
 * Provider registry — the one place that resolves a model id to a live adapter.
 *
 * When MOCK_PROVIDERS is true (default), every model resolves to its mock. Live
 * adapters (fal.ai / Anthropic / ElevenLabs / render API) get registered here as
 * they're built; until then, asking for a live adapter fails loudly. Nothing
 * else in the app constructs a provider directly.
 *
 * Local adapters (no vendor, no network — e.g. Ken Burns stills) resolve the
 * same in mock and live mode.
 *
 * Live mode is also margin-gated: while any plan or top-up would lose money at
 * full burn (see `features/billing/margin.ts`), live adapters are refused.
 */
import { getModel, type ModelSpec } from '@/config/models';
import { assessMargins, describeFailures } from '@/features/billing/margin';
import {
  createMockImageProvider,
  createMockRenderProvider,
  createMockScriptProvider,
  createMockVideoProvider,
  createMockVoiceProvider,
} from './mocks';
import { createKenBurnsProvider } from './local/ken-burns';
import { createAnthropicScriptProvider } from './live/anthropic-script';
import { createElevenLabsVoiceProvider } from './live/elevenlabs-voice';
import { SupabaseMediaStore } from './live/media-store';
import { env, requireEnv } from '@/lib/env';
import { createSupabaseAdminClient } from '@/utils/supabase/admin';
import type {
  ImageProvider,
  RenderProvider,
  ScriptProvider,
  VideoProvider,
  VoiceProvider,
} from './types';

/** Factory registry for LIVE adapters, keyed by ModelSpec.providerId. */
type LiveFactory = (model: ModelSpec) => unknown;
const liveAdapters = new Map<string, LiveFactory>([
  ['anthropic:script', (m) => createAnthropicScriptProvider(m)],
  [
    'elevenlabs:voice',
    (m) =>
      createElevenLabsVoiceProvider(m, {
        apiKey: () => requireEnv('ELEVENLABS_API_KEY'),
        store: () => new SupabaseMediaStore(createSupabaseAdminClient(), env.SUPABASE_MEDIA_BUCKET),
        voiceId: env.ELEVENLABS_VOICE_ID,
      }),
  ],
]);

/** Adapters that call no vendor, so they're safe (and real) in mock mode too. */
const localAdapters = new Map<string, LiveFactory>([['local:ken-burns', createKenBurnsProvider]]);

/** Called by real adapter modules at import time (Phase 1, step 5). */
export function registerLiveAdapter(providerId: string, factory: LiveFactory): void {
  liveAdapters.set(providerId, factory);
}

/** Throws while pricing is unprofitable at full burn. Pure math, cheap to re-run. */
export function assertMarginGate(report = assessMargins()): void {
  if (!report.ok) {
    throw new Error(
      `Margin gate failed — refusing live providers. ${describeFailures(report)}. ` +
        `Fix credits/prices in config, or run with MOCK_PROVIDERS=true.`,
    );
  }
}

function resolve(modelId: string, mock: (m: ModelSpec) => unknown): unknown {
  const model = getModel(modelId);
  const local = localAdapters.get(model.providerId);
  if (local) return local(model);
  if (env.MOCK_PROVIDERS) return mock(model);
  assertMarginGate();
  const live = liveAdapters.get(model.providerId);
  if (!live) {
    throw new Error(
      `No live adapter registered for "${model.providerId}" (model "${modelId}"). ` +
        `Register one, or run with MOCK_PROVIDERS=true.`,
    );
  }
  return live(model);
}

export const getScriptProvider = (modelId = 'script-default'): ScriptProvider =>
  resolve(modelId, createMockScriptProvider) as ScriptProvider;

export const getImageProvider = (modelId = 'image-standard'): ImageProvider =>
  resolve(modelId, createMockImageProvider) as ImageProvider;

export const getVideoProvider = (modelId = 'video-standard'): VideoProvider =>
  resolve(modelId, createMockVideoProvider) as VideoProvider;

export const getVoiceProvider = (modelId = 'voice-default'): VoiceProvider =>
  resolve(modelId, createMockVoiceProvider) as VoiceProvider;

export const getRenderProvider = (modelId = 'render-default'): RenderProvider =>
  resolve(modelId, createMockRenderProvider) as RenderProvider;
