/**
 * Provider registry — the one place that resolves a model id to a live adapter.
 *
 * When MOCK_PROVIDERS is true (default), every model resolves to its mock. Live
 * adapters (fal.ai / Anthropic / ElevenLabs / render API) get registered here as
 * they're built; until then, asking for a live adapter fails loudly. Nothing
 * else in the app constructs a provider directly.
 */
import { getModel, type ModelSpec } from '@/config/models';
import { env } from '@/lib/env';
import {
  createMockImageProvider,
  createMockRenderProvider,
  createMockScriptProvider,
  createMockVideoProvider,
  createMockVoiceProvider,
} from './mocks';
import type {
  ImageProvider,
  RenderProvider,
  ScriptProvider,
  VideoProvider,
  VoiceProvider,
} from './types';

/** Factory registry for LIVE adapters, keyed by ModelSpec.providerId. */
type LiveFactory = (model: ModelSpec) => unknown;
const liveAdapters = new Map<string, LiveFactory>();

/** Called by real adapter modules at import time (Phase 1, step 5). */
export function registerLiveAdapter(providerId: string, factory: LiveFactory): void {
  liveAdapters.set(providerId, factory);
}

function resolve(modelId: string, mock: (m: ModelSpec) => unknown): unknown {
  const model = getModel(modelId);
  if (env.MOCK_PROVIDERS) return mock(model);
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
