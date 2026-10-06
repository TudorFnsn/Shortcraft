/**
 * Live image adapter: FLUX on fal.ai (one image per scene).
 *
 * Uses fal's synchronous endpoint (`fal.run/<model>`): FLUX [schnell] returns in
 * about a second, so the step completes inline and poll/webhook are never used.
 * fal's output URLs are a CDN with no retention guarantee, so we copy the image
 * into our media store; the render step then reads it from storage we control.
 *
 * Size: 720×1280 (9:16, both multiples of 16 as FLUX requires). fal bills per
 * megapixel rounded up, so this is exactly one billed MP, which is what the
 * catalog's per-image cost assumes. The renderer upscales to 1080×1920.
 *
 * Safety: fal's safety checker stays on. A flagged image comes back blacked out,
 * so we fail the step instead (the job fails and the user is refunded).
 */
import type { ModelSpec } from '@/config/models';
import type {
  ImageInput,
  ImageOutput,
  ImageProvider,
  ProviderContext,
  ProviderJob,
  WebhookPayload,
} from '../types';
import { mediaPath, type MediaStore } from './media-store';

/** Catalog providerId → fal model path. */
export const FAL_IMAGE_MODELS: Readonly<Record<string, string>> = {
  'fal:flux-schnell': 'fal-ai/flux/schnell',
  'fal:flux-dev': 'fal-ai/flux/dev',
};

export const IMAGE_SIZE = { width: 720, height: 1280 } as const;

const ENDPOINT = 'https://fal.run';

interface FalImage {
  url: string;
  width?: number;
  height?: number;
  content_type?: string;
}
interface FalImageResponse {
  images?: FalImage[];
  has_nsfw_concepts?: boolean[];
}

/** fal bills images per megapixel, rounded up (minimum one). */
export function billedMegapixels(width: number, height: number): number {
  return Math.max(1, Math.ceil((width * height) / 1_000_000));
}

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const notAsync = () => {
  throw new Error('the image adapter completes inline; poll/webhook is never used');
};

export function createFalImageProvider(
  model: ModelSpec,
  deps: {
    apiKey: () => string;
    store: () => MediaStore;
    fetch?: typeof fetch;
  },
): ImageProvider {
  const falModel = FAL_IMAGE_MODELS[model.providerId];
  if (!falModel) throw new Error(`No fal model mapped for "${model.providerId}"`);
  const doFetch = deps.fetch ?? fetch;

  return {
    id: model.providerId,
    kind: 'image',
    costCredits: () => model.creditsPerUnit,

    async run(input: ImageInput, ctx: ProviderContext) {
      const res = await doFetch(`${ENDPOINT}/${falModel}`, {
        method: 'POST',
        headers: { authorization: `Key ${deps.apiKey()}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          prompt: input.prompt,
          image_size: IMAGE_SIZE,
          num_images: 1,
          output_format: 'jpeg',
          enable_safety_checker: true,
          ...(input.seed === undefined ? {} : { seed: input.seed }),
        }),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => '')).slice(0, 300);
        throw new Error(`fal image failed: ${res.status} ${detail}`);
      }
      const body = (await res.json()) as FalImageResponse;
      const image = body.images?.[0];
      if (!image?.url) throw new Error('fal image returned no image');
      if (body.has_nsfw_concepts?.[0]) {
        throw new Error('fal image was flagged by the safety checker');
      }

      const download = await doFetch(image.url);
      if (!download.ok) throw new Error(`fal image download failed: ${download.status}`);
      const contentType =
        image.content_type ?? download.headers.get('content-type') ?? 'image/jpeg';
      const ext = EXTENSIONS[contentType] ?? 'jpg';
      const bytes = new Uint8Array(await download.arrayBuffer());
      // Keyed by the step's idempotency key, so a retry overwrites, not duplicates.
      const imageUrl = await deps
        .store()
        .put(mediaPath('images', ctx.idempotencyKey, ext), bytes, contentType);

      const width = image.width ?? IMAGE_SIZE.width;
      const height = image.height ?? IMAGE_SIZE.height;
      const output: ImageOutput = { imageUrl, width, height };
      return {
        kind: 'completed',
        output,
        costUsd: billedMegapixels(width, height) * model.costUsdPerUnit,
      };
    },

    poll: async (_job: ProviderJob) => notAsync(),
    parseWebhook: async (_payload: WebhookPayload) => notAsync(),
  };
}
