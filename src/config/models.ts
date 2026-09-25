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
    creditsPerUnit: 300, // flat, per generation
    costUsdPerUnit: 0.02,
  },
  {
    id: 'image-standard',
    kind: 'image',
    tier: 'standard',
    label: 'Standard image',
    providerId: 'mock:image',
    creditsPerUnit: 500, // per image
    costUsdPerUnit: 0.03,
  },
  {
    id: 'image-premium',
    kind: 'image',
    tier: 'premium',
    label: 'Premium image',
    providerId: 'mock:image',
    creditsPerUnit: 1200,
    costUsdPerUnit: 0.08,
  },
  {
    id: 'video-standard',
    kind: 'video',
    tier: 'standard',
    label: 'Standard video',
    providerId: 'mock:video',
    creditsPerUnit: 1500, // per second
    costUsdPerUnit: 0.1,
  },
  {
    id: 'video-premium',
    kind: 'video',
    tier: 'premium',
    label: 'Premium video',
    providerId: 'mock:video',
    creditsPerUnit: 4000, // per second
    costUsdPerUnit: 0.3,
  },
  {
    id: 'voice-default',
    kind: 'voice',
    tier: 'standard',
    label: 'Voiceover',
    providerId: 'mock:voice',
    creditsPerUnit: 40, // per second
    costUsdPerUnit: 0.002,
  },
  {
    id: 'render-default',
    kind: 'render',
    tier: 'standard',
    label: 'Final render',
    providerId: 'mock:render',
    creditsPerUnit: 500, // flat, per render
    costUsdPerUnit: 0.02,
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
