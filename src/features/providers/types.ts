/**
 * Provider adapter contracts.
 *
 * Every AI step (script, image, video, voice, final render) implements the same
 * lifecycle so the render orchestrator never knows which vendor it's talking to.
 * A provider `run()` either COMPLETES inline (fast/sync models) or returns an
 * ASYNC job handle that is later resolved by a vendor webhook or the cron poller.
 * This single shape is what keeps us serverless-only while doing minutes-long
 * renders, and what lets us swap models without touching pipeline code.
 */

export type ProviderKind = 'script' | 'image' | 'video' | 'voice' | 'render';

/** Opaque handle to an in-flight vendor job. */
export interface ProviderJob {
  providerId: string;
  providerJobId: string;
}

export type ProviderOutcome<Output> =
  { kind: 'completed'; output: Output; costUsd: number } | { kind: 'async'; job: ProviderJob };

export type ProviderPollResult<Output> =
  | { status: 'pending' }
  | { status: 'succeeded'; output: Output; costUsd: number }
  | { status: 'failed'; reason: string };

/** Passed into every run so calls are idempotent and traceable. */
export interface ProviderContext {
  /** Stable per (job, scene, step) key — vendors dedupe retries on this. */
  idempotencyKey: string;
}

/** Raw inbound webhook, normalized so adapters don't touch the HTTP layer. */
export interface WebhookPayload {
  headers: Record<string, string>;
  rawBody: string;
  body: unknown;
}

export interface Provider<Input, Output> {
  readonly id: string;
  readonly kind: ProviderKind;
  run(input: Input, ctx: ProviderContext): Promise<ProviderOutcome<Output>>;
  poll(job: ProviderJob): Promise<ProviderPollResult<Output>>;
  parseWebhook(
    payload: WebhookPayload,
  ): Promise<{ job: ProviderJob; result: ProviderPollResult<Output> }>;
  /** Credits this call will cost, computed from the input. Drives the ledger. */
  costCredits(input: Input): number;
}

/* ---------------------------------------------------------------------------
 * Domain input/output types per step
 * ------------------------------------------------------------------------- */

export interface SceneScript {
  index: number;
  narration: string; // spoken by the voiceover
  imagePrompt: string; // fed to the image model
  motionPrompt: string; // fed to the image->video model
  durationSec: number;
}

export interface ScriptInput {
  topic: string;
  themeId: string;
  targetDurationSec: number;
  language: string;
}
export interface ScriptOutput {
  title: string;
  scenes: SceneScript[];
}
export type ScriptProvider = Provider<ScriptInput, ScriptOutput>;

export interface ImageInput {
  prompt: string;
  aspectRatio: '9:16';
  seed?: number;
  characterRefUrl?: string; // Phase 2: consistent characters
}
export interface ImageOutput {
  imageUrl: string;
  width: number;
  height: number;
}
export type ImageProvider = Provider<ImageInput, ImageOutput>;

export interface VideoInput {
  imageUrl: string;
  motionPrompt: string;
  durationSec: number;
}
export interface VideoOutput {
  videoUrl: string;
  durationSec: number;
}
export type VideoProvider = Provider<VideoInput, VideoOutput>;

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}
export interface VoiceInput {
  text: string;
  voiceId: string;
  language: string;
}
export interface VoiceOutput {
  audioUrl: string;
  durationMs: number;
  words: WordTiming[]; // drives subtitle timing
}
export type VoiceProvider = Provider<VoiceInput, VoiceOutput>;

export interface RenderClip {
  videoUrl: string;
  startMs: number;
}
export interface RenderInput {
  clips: RenderClip[];
  voiceoverUrl: string;
  words: WordTiming[];
  subtitleStyleId: string;
  aspectRatio: '9:16';
}
export interface RenderOutput {
  videoUrl: string;
  durationSec: number;
}
export type RenderProvider = Provider<RenderInput, RenderOutput>;
