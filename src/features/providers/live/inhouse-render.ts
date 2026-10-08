/**
 * Live render adapter: the in-house ffmpeg renderer wired to real media.
 *
 * Downloads every scene asset and the voiceover into a private temp directory,
 * runs the one-pass ffmpeg plan (`local/ffmpeg-render.ts`), and uploads the MP4
 * into our media store. It calls no vendor, so the cost is our own compute
 * (the catalog's flat per-render figure). Completes inline; poll/webhook are
 * never used.
 *
 * Assets come from our own media store (signed https URLs). `file://` is read
 * only when `allowFileUrls` is set (the live smoke script), so in production a
 * bad URL in a job row can never make the renderer read server files.
 */
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ModelSpec } from '@/config/models';
import type {
  ProviderContext,
  ProviderJob,
  RenderInput,
  RenderOutput,
  RenderProvider,
  WebhookPayload,
} from '../types';
import { renderWithFfmpeg, type LocalRenderInput } from '../local/ffmpeg-render';
import { mediaPath, type MediaStore } from './media-store';

/** Refuse absurd downloads: a 60s video's assets are a few MB each. */
export const MAX_ASSET_BYTES = 100 * 1024 * 1024;

const notAsync = () => {
  throw new Error('the render adapter completes inline; poll/webhook is never used');
};

/** Keep a known media extension (ffmpeg probes content anyway); fall back to `bin`. */
export function assetExtension(url: string): string {
  let path = url;
  try {
    path = new URL(url).pathname;
  } catch {
    // not a URL — use it as a path
  }
  const ext = extname(path).slice(1).toLowerCase();
  return /^(jpe?g|png|webp|mp4|mov|webm|mp3|wav|m4a|aac)$/.test(ext) ? ext : 'bin';
}

/** Reads an asset as bytes: https/http via fetch, file:// from disk when allowed. */
export async function readAsset(
  url: string,
  doFetch: typeof fetch,
  allowFileUrls = false,
): Promise<Uint8Array> {
  if (allowFileUrls && url.startsWith('file://')) {
    return new Uint8Array(await readFile(fileURLToPath(url)));
  }
  if (!/^https?:\/\//.test(url)) throw new Error(`render cannot read asset URL: ${url}`);
  const res = await doFetch(url);
  if (!res.ok) throw new Error(`render asset download failed: ${res.status}`);
  const declared = Number(res.headers.get('content-length') ?? 0);
  if (declared > MAX_ASSET_BYTES) throw new Error(`render asset too large: ${declared} bytes`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_ASSET_BYTES) {
    throw new Error(`render asset too large: ${bytes.byteLength} bytes`);
  }
  return bytes;
}

export function createInhouseRenderProvider(
  model: ModelSpec,
  deps: {
    store: () => MediaStore;
    fetch?: typeof fetch;
    /** Swappable for tests; defaults to spawning the local ffmpeg binary. */
    render?: (input: LocalRenderInput) => Promise<{ durationSec: number }>;
    ffmpegPath?: string;
    tmpRoot?: string;
    /** Local runs only (smoke script): also read `file://` assets. */
    allowFileUrls?: boolean;
  },
): RenderProvider {
  const doFetch = deps.fetch ?? fetch;
  const render = deps.render ?? renderWithFfmpeg;

  return {
    id: model.providerId,
    kind: 'render',
    costCredits: () => model.creditsPerUnit,

    async run(input: RenderInput, ctx: ProviderContext) {
      if (input.clips.length === 0) throw new Error('render needs at least one clip');
      const workDir = await mkdtemp(join(deps.tmpRoot ?? tmpdir(), 'shortcraft-render-'));
      try {
        const fetchTo = async (url: string, name: string): Promise<string> => {
          // Runtime temp paths, not project files: keep Turbopack from tracing the repo.
          const path = join(/*turbopackIgnore: true*/ workDir, `${name}.${assetExtension(url)}`);
          await writeFile(path, await readAsset(url, doFetch, deps.allowFileUrls));
          return path;
        };
        const [voiceoverPath, ...clipPaths] = await Promise.all([
          fetchTo(input.voiceoverUrl, 'voiceover'),
          ...input.clips.map((c, i) =>
            fetchTo(c.kind === 'video' ? c.videoUrl : c.imageUrl, `clip${i}`),
          ),
        ]);

        const outputPath = join(workDir, 'final.mp4');
        const { durationSec } = await render({
          clips: input.clips,
          clipPaths,
          voiceoverPath,
          words: input.words,
          brandWatermark: input.brandWatermark,
          workDir,
          outputPath,
          ...(deps.ffmpegPath ? { ffmpegPath: deps.ffmpegPath } : {}),
        });

        const bytes = new Uint8Array(await readFile(outputPath));
        // Keyed by the step's idempotency key, so a retry overwrites, not duplicates.
        const videoUrl = await deps
          .store()
          .put(mediaPath('renders', ctx.idempotencyKey, 'mp4'), bytes, 'video/mp4');
        const output: RenderOutput = { videoUrl, durationSec };
        return { kind: 'completed', output, costUsd: model.costUsdPerUnit };
      } finally {
        await rm(workDir, { recursive: true, force: true });
      }
    },

    poll: async (_job: ProviderJob) => notAsync(),
    parseWebhook: async (_payload: WebhookPayload) => notAsync(),
  };
}
