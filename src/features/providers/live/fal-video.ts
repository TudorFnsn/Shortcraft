/**
 * Live video adapter: image-to-video on fal.ai (one AI clip per scene, Premium).
 *
 * Video models take ~30s–3min per clip, so this uses fal's queue API. `run`
 * submits and returns an async ProviderJob straight away; the orchestrator
 * persists it and calls `poll` on later steps (background run or cron sweep)
 * until the clip is ready, then it's fetched and stored. Every scene is
 * submitted at once, so a video waits about as long as its slowest clip.
 * `wait: true` polls inside `run` instead (local scripts).
 *
 * The model is configurable (`FAL_VIDEO_MODEL`): models differ in how they take
 * a clip length, so each family has its own input builder. The clip comes back
 * at a fixed length (Kling: 5 or 10s); the renderer time-fits it to the scene
 * slot, so a 5s clip fills a 6s scene in gentle slow motion instead of freezing.
 *
 * No audio is requested (our voiceover is the soundtrack), which is also the
 * cheaper price tier. The output is copied into our media store, because fal's
 * CDN has no retention guarantee and the render step reads it later.
 */
import type { ModelSpec } from '@/config/models';
import type {
  ProviderContext,
  ProviderJob,
  ProviderPollResult,
  VideoInput,
  VideoOutput,
  VideoProvider,
  WebhookPayload,
} from '../types';
import { mediaPath, type MediaStore } from './media-store';

export const DEFAULT_FAL_VIDEO_MODEL = 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video';

/**
 * fal list price per billed clip second, audio off (search snippets, 2026-10;
 * fal's pages are unreachable from CI, so confirm on your fal invoice). Models
 * not listed are reported at the catalog's conservative per-second cost.
 */
export const FAL_VIDEO_USD_PER_SEC: Readonly<Record<string, number>> = {
  'fal-ai/kling-video/v2.5-turbo/pro/image-to-video': 0.07,
};

const QUEUE = 'https://queue.fal.run';
const POLL_INTERVAL_MS = 3_000;
/** Generous: a busy queue plus a slow model. Past this the step fails and refunds. */
const TIMEOUT_MS = 8 * 60_000;

/** Keeps the camera grounded; these are the artefacts that read as "AI slop". */
const NEGATIVE_PROMPT = 'blur, distortion, warped faces, extra limbs, text, watermark, low quality';

interface FalVideoRequest {
  body: Record<string, unknown>;
  /** Seconds fal bills for (the clip's real length). */
  billedSec: number;
}

/** Kling: 5s or 10s clips; aspect ratio follows the input image (9:16 here). */
function klingRequest(input: VideoInput): FalVideoRequest {
  const sec = input.durationSec > 7 ? 10 : 5;
  return {
    billedSec: sec,
    body: {
      prompt: input.motionPrompt,
      image_url: input.imageUrl,
      duration: String(sec),
      negative_prompt: NEGATIVE_PROMPT,
      generate_audio: false,
    },
  };
}

/** Other families (Veo, LTX, Wan, Seedance…): per-second length, explicit 9:16. */
function genericRequest(input: VideoInput): FalVideoRequest {
  const sec = Math.max(1, Math.ceil(input.durationSec));
  return {
    billedSec: sec,
    body: {
      prompt: input.motionPrompt,
      image_url: input.imageUrl,
      duration: sec,
      aspect_ratio: '9:16',
      negative_prompt: NEGATIVE_PROMPT,
      generate_audio: false,
    },
  };
}

export function buildFalVideoRequest(falModel: string, input: VideoInput): FalVideoRequest {
  return falModel.includes('kling') ? klingRequest(input) : genericRequest(input);
}

interface QueueSubmit {
  request_id?: string;
  status_url?: string;
  response_url?: string;
}
interface QueueStatus {
  status?: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | string;
}
interface FalVideoResponse {
  video?: { url?: string; content_type?: string };
}

/** What `run` hands back for an in-flight clip; `poll` needs nothing else. */
interface PendingClip {
  responseUrl: string;
  statusUrl: string;
  billedSec: number;
  key: string;
  submittedAt: number;
}

/** fal's queue URLs use the app id (first two path segments), not the full model path. */
export function falQueueUrls(falModel: string, requestId: string) {
  const app = falModel.split('/').slice(0, 2).join('/');
  const responseUrl = `${QUEUE}/${app}/requests/${requestId}`;
  return { responseUrl, statusUrl: `${responseUrl}/status` };
}

const noWebhook = () => {
  throw new Error('fal video results are polled (cron + background run), not webhooked');
};

export function createFalVideoProvider(
  model: ModelSpec,
  deps: {
    apiKey: () => string;
    store: () => MediaStore;
    /** fal model path; defaults to Kling 2.5 Turbo Pro. */
    falModel?: string;
    /**
     * Wait for the clip inside `run` (local scripts). Default: return an async
     * job right after submitting; the orchestrator polls it across requests.
     */
    wait?: boolean;
    fetch?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    pollIntervalMs?: number;
    timeoutMs?: number;
  },
): VideoProvider {
  const falModel = deps.falModel ?? DEFAULT_FAL_VIDEO_MODEL;
  const doFetch = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = deps.now ?? Date.now;
  const pollIntervalMs = deps.pollIntervalMs ?? POLL_INTERVAL_MS;
  const timeoutMs = deps.timeoutMs ?? TIMEOUT_MS;
  const usdPerSec = FAL_VIDEO_USD_PER_SEC[falModel] ?? model.costUsdPerUnit;

  const call = async (url: string, init?: RequestInit): Promise<unknown> => {
    const res = await doFetch(url, {
      ...init,
      headers: {
        authorization: `Key ${deps.apiKey()}`,
        'content-type': 'application/json',
        ...init?.headers,
      },
    });
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      throw new Error(`fal video failed: ${res.status} ${detail}`);
    }
    return res.json();
  };

  /** One status check; on completion, fetch + store the clip. */
  const check = async (p: PendingClip): Promise<ProviderPollResult<VideoOutput>> => {
    const status = (await call(p.statusUrl)) as QueueStatus;
    if (status.status !== 'COMPLETED') {
      if (now() - p.submittedAt >= timeoutMs) {
        return {
          status: 'failed',
          reason: `fal video timed out after ${Math.round(timeoutMs / 1000)}s`,
        };
      }
      return { status: 'pending' };
    }
    // A failed generation surfaces here as a non-2xx (with fal's reason).
    const result = (await call(p.responseUrl)) as FalVideoResponse;
    const url = result.video?.url;
    if (!url) return { status: 'failed', reason: 'fal video returned no video' };

    const download = await doFetch(url);
    if (!download.ok) throw new Error(`fal video download failed: ${download.status}`);
    const bytes = new Uint8Array(await download.arrayBuffer());
    const videoUrl = await deps.store().put(mediaPath('clips', p.key, 'mp4'), bytes, 'video/mp4');
    return {
      status: 'succeeded',
      output: { kind: 'video', videoUrl, durationSec: p.billedSec },
      costUsd: p.billedSec * usdPerSec,
    };
  };

  return {
    id: model.providerId,
    kind: 'video',
    costCredits: (input: VideoInput) => Math.ceil(input.durationSec) * model.creditsPerUnit,

    async run(input: VideoInput, ctx: ProviderContext) {
      const { body, billedSec } = buildFalVideoRequest(falModel, input);
      const submit = (await call(`${QUEUE}/${falModel}`, {
        method: 'POST',
        body: JSON.stringify(body),
      })) as QueueSubmit;
      if (!submit.request_id) throw new Error('fal video: queue returned no request id');
      // fal returns the canonical URLs; build them only as a fallback.
      const fallback = falQueueUrls(falModel, submit.request_id);
      const pending: PendingClip = {
        responseUrl: submit.response_url ?? fallback.responseUrl,
        statusUrl: submit.status_url ?? fallback.statusUrl,
        billedSec,
        key: ctx.idempotencyKey,
        submittedAt: now(),
      };

      if (!deps.wait) {
        const job: ProviderJob = {
          providerId: model.providerId,
          providerJobId: JSON.stringify(pending),
        };
        return { kind: 'async', job };
      }
      for (;;) {
        const res = await check(pending);
        if (res.status === 'succeeded') {
          return { kind: 'completed', output: res.output, costUsd: res.costUsd };
        }
        if (res.status === 'failed') throw new Error(res.reason);
        await sleep(pollIntervalMs);
      }
    },

    async poll(job: ProviderJob) {
      return check(JSON.parse(job.providerJobId) as PendingClip);
    },
    parseWebhook: async (_payload: WebhookPayload) => noWebhook(),
  };
}
