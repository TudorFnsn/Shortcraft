/**
 * "Ken Burns" video provider — the standard tier's scene motion.
 *
 * Instead of paying an image->video model per second, a standard scene is the
 * still image plus a camera move that our own renderer applies (ffmpeg
 * zoompan, see `ffmpeg-plan.ts`). No network, no vendor, ~$0 per scene, so it
 * runs the same in mock and live mode. Premium keeps real AI video clips.
 *
 * Credits are still charged per second (`creditsPerUnit`), so customer prices
 * don't change; only our cost does.
 */
import type { ModelSpec } from '@/config/models';
import type {
  ProviderJob,
  StillMotion,
  VideoInput,
  VideoOutput,
  VideoProvider,
  WebhookPayload,
} from '../types';

const MOTIONS: readonly StillMotion[] = ['push-in', 'pan-left', 'pull-out', 'pan-right'];

/** Map the script's free-text motion hint onto a supported camera move. */
export function stillMotionFor(motionPrompt: string): StillMotion {
  const p = motionPrompt.toLowerCase();
  if (/pull|zoom.?out|reveal/.test(p)) return 'pull-out';
  if (/pan.?left|left/.test(p)) return 'pan-left';
  if (/pan.?right|right/.test(p)) return 'pan-right';
  if (/push|zoom.?in|dolly/.test(p)) return 'push-in';
  // No hint: vary by prompt so consecutive scenes don't all move the same way.
  let h = 0;
  for (const ch of p) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return MOTIONS[h % MOTIONS.length] ?? 'push-in';
}

const unsupported = () => {
  throw new Error('ken-burns completes inline; poll/webhook is never used');
};

export function createKenBurnsProvider(model: ModelSpec): VideoProvider {
  return {
    id: model.providerId,
    kind: 'video',
    costCredits: (input) => Math.ceil(input.durationSec) * model.creditsPerUnit,
    async run(input: VideoInput) {
      const output: VideoOutput = {
        kind: 'still',
        imageUrl: input.imageUrl,
        motion: stillMotionFor(input.motionPrompt),
        durationSec: input.durationSec,
      };
      return {
        kind: 'completed',
        output,
        costUsd: model.costUsdPerUnit * Math.ceil(input.durationSec),
      };
    },
    poll: async (_job: ProviderJob) => unsupported(),
    parseWebhook: async (_payload: WebhookPayload) => unsupported(),
  };
}
