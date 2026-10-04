/**
 * Model catalog — the pricing brain of the product.
 *
 * Each entry maps a stable internal id to a provider adapter id and the credit
 * cost per unit (per image, or per second of video/audio). `costUsd` is our
 * measured API cost; `creditsPerUnit` is what we charge. Keep
 * creditsPerUnit / (costUsd * CREDITS_PER_USD_FLOOR) >= 3 to protect margin.
 *
 * Adding a new model = one row here + one adapter registration. No pipeline
 * changes. This is the mechanism that lets us swap models as they ship monthly.
 *
 * `costUsdPerUnit` = researched public list prices (2026-10-04, mid-range of the
 * candidates per slot; see TheMasterPlan §7). Not yet measured on real calls —
 * replace with measured costs once live adapters run.
 */

export type ModelKind = 'script' | 'image' | 'video' | 'voice' | 'render';
export type ModelTier = 'standard' | 'premium';

export interface ModelSpec {
  id: string; // internal stable id, e.g. "video-standard"
  kind: ModelKind;
  tier: ModelTier;
  label: string;
  /** Adapter id in the provider registry, e.g. "fal:ltx-video". */
  providerId: string;
  /** Credits charged per unit (image => per image; video/voice => per second). */
  creditsPerUnit: number;
  /** Our measured provider cost per unit in USD (for the margin gate). */
  costUsdPerUnit: number;
}

export const MODELS: readonly ModelSpec[] = [
  {
    id: 'script-default',
    kind: 'script',
    tier: 'standard',
    label: 'Script writer',
    providerId: 'mock:script',
    creditsPerUnit: 100, // flat, per generation
    costUsdPerUnit: 0.04, // ~2k in / 1.5k out on a Sonnet-class model
  },
  {
    id: 'image-standard',
    kind: 'image',
    tier: 'standard',
    label: 'Standard image',
    providerId: 'mock:image',
    creditsPerUnit: 80, // per image
    costUsdPerUnit: 0.003, // FLUX.1 [schnell] on fal, $0.003/MP (720x1280 = 1 MP)
  },
  {
    id: 'image-premium',
    kind: 'image',
    tier: 'premium',
    label: 'Premium image',
    providerId: 'mock:image',
    creditsPerUnit: 200,
    costUsdPerUnit: 0.025, // FLUX.1 [dev] on fal, $0.025/MP
  },
  {
    id: 'video-standard',
    kind: 'video',
    tier: 'standard',
    label: 'Standard video',
    providerId: 'mock:video',
    creditsPerUnit: 80, // per second
    costUsdPerUnit: 0.08, // 720p silent image-to-video: LTX-2 Fast ~$0.04 … Kling 3.0 ~$0.084
  },
  {
    id: 'video-premium',
    kind: 'video',
    tier: 'premium',
    label: 'Premium video',
    providerId: 'mock:video',
    creditsPerUnit: 220, // per second
    costUsdPerUnit: 0.12, // 1080p: Veo 3.1 Fast ~$0.12, Kling 3.0 ~$0.11
  },
  {
    id: 'voice-default',
    kind: 'voice',
    tier: 'standard',
    label: 'Voiceover',
    providerId: 'mock:voice',
    creditsPerUnit: 8, // per second
    costUsdPerUnit: 0.00075, // ElevenLabs Flash $0.05/1k chars × ~15 chars/s
  },
  {
    id: 'render-default',
    kind: 'render',
    tier: 'standard',
    label: 'Final render',
    providerId: 'mock:render',
    creditsPerUnit: 100, // flat, per render
    costUsdPerUnit: 0.3, // hosted render API (Shotstack PAYG ~$0.30/min, 1-min minimum)
  },
];

const BY_ID = new Map(MODELS.map((m) => [m.id, m]));

export function getModel(id: string): ModelSpec {
  const m = BY_ID.get(id);
  if (!m) throw new Error(`Unknown model id "${id}"`);
  return m;
}

export const defaultModelFor = (kind: ModelKind, tier: ModelTier = 'standard'): ModelSpec => {
  const m =
    MODELS.find((x) => x.kind === kind && x.tier === tier) ?? MODELS.find((x) => x.kind === kind);
  if (!m) throw new Error(`No model registered for kind "${kind}"`);
  return m;
};
