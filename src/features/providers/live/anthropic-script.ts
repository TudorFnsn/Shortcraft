/**
 * Live script adapter: Claude writes the video script as structured JSON.
 *
 * One Messages API call per job, completed inline (a script takes seconds), so
 * poll/webhook are never used. The response is validated against a zod schema
 * via structured outputs, then normalized to our SceneScript shape; the
 * orchestrator still clamps the plan to the credit hold (`fitScenesToBudget`).
 *
 * Model: Claude Sonnet 5.5 by default — the catalog prices this step for a
 * Sonnet-class model ($0.04/script). Override with ANTHROPIC_SCRIPT_MODEL.
 * Server-side refusal fallbacks are on, so a false-positive safety decline is
 * retried on another model inside the same call instead of failing the job.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod/v4';
import type { ModelSpec } from '@/config/models';
import { env, requireEnv } from '@/lib/env';
import { THEMES } from '@/config/themes';
import { MAX_SCENE_SEC, estimateSceneCount } from '@/features/render/pricing';
import type {
  ProviderContext,
  ProviderJob,
  ScriptInput,
  ScriptOutput,
  ScriptProvider,
  WebhookPayload,
} from '../types';

export const DEFAULT_SCRIPT_MODEL = 'claude-sonnet-5-5';

/** USD per million tokens [input, output]. Unknown models price at the Opus rate (conservative). */
const PRICES: Record<string, readonly [number, number]> = {
  'claude-sonnet-5-5': [2, 10],
  'claude-opus-5-5': [4, 20],
};
const FALLBACK_PRICE: readonly [number, number] = [4, 20];

const SceneSchema = z.object({
  narration: z.string().describe('What the voiceover says in this scene. Spoken words only.'),
  imagePrompt: z
    .string()
    .describe('A vivid, concrete description of one vertical 9:16 image for this scene.'),
  motionPrompt: z
    .string()
    .describe(
      'One sentence for an image-to-video model: what moves in the scene (subject action, ' +
        'wind, water, light) plus one camera move (e.g. "slow dolly in", "orbit left"). ' +
        'Physically plausible, continuous motion; no cuts, no new objects, no text.',
    ),
  durationSec: z.number().describe(`Scene length in seconds, 2 to ${MAX_SCENE_SEC}.`),
});
const ScriptSchema = z.object({
  title: z.string().describe('A short, hooky title for the video.'),
  scenes: z.array(SceneSchema),
});
type ParsedScript = z.infer<typeof ScriptSchema>;

/** The slice of the SDK this adapter uses, so tests can pass a fake. */
export type ScriptClient = Pick<Anthropic, 'beta'>;

export function costUsdFor(
  model: string,
  usage: { input_tokens: number; output_tokens: number },
): number {
  const [inPerM, outPerM] = PRICES[model] ?? FALLBACK_PRICE;
  return (usage.input_tokens * inPerM + usage.output_tokens * outPerM) / 1_000_000;
}

export function buildScriptPrompt(input: ScriptInput): { system: string; user: string } {
  const theme = THEMES.find((t) => t.id === input.themeId);
  const scenes = estimateSceneCount(input.targetDurationSec);
  const system = [
    'You write scripts for short vertical videos (TikTok, Reels, Shorts) that are narrated',
    'over AI-generated images. The first scene must hook the viewer in under two seconds.',
    'Narration is spoken aloud, so write it the way people talk: short sentences, no stage',
    'directions, no emojis, no hashtags. Image prompts describe one concrete visual each and',
    'never include text, captions or logos. Motion prompts bring that image to life: name what',
    'moves and how the camera moves, so the scene feels alive rather than like a photo.',
    'Keep everything suitable for a general audience',
    'and do not depict real, identifiable people.',
  ].join(' ');
  const user = [
    `Topic: ${input.topic}`,
    theme ? `Style: ${theme.label} — ${theme.blurb}` : `Style: ${input.themeId}`,
    `Language for title and narration: ${input.language}. Image and motion prompts in English.`,
    `Target length: about ${input.targetDurationSec} seconds, in exactly ${scenes} scenes of at`,
    `most ${MAX_SCENE_SEC} seconds each. Speak about 2.5 words per second, so keep each scene's`,
    `narration under ${Math.floor(MAX_SCENE_SEC * 2.5)} words.`,
  ].join('\n');
  return { system, user };
}

/** Clamp and renumber what the model returned into our domain shape. */
export function toScriptOutput(parsed: ParsedScript): ScriptOutput {
  const scenes = parsed.scenes
    .filter((s) => s.narration.trim().length > 0)
    .map((s, index) => ({
      index,
      narration: s.narration.trim(),
      imagePrompt: s.imagePrompt.trim(),
      motionPrompt: s.motionPrompt.trim(),
      durationSec: Math.min(MAX_SCENE_SEC, Math.max(2, Math.round(s.durationSec))),
    }));
  if (scenes.length === 0) throw new Error('script model returned no usable scenes');
  return { title: parsed.title.trim() || 'Untitled', scenes };
}

/**
 * Headers for the Anthropic client. An organization-level API key (one not
 * scoped to a workspace) must name the workspace to bill on every request.
 */
export function anthropicHeaders(workspaceId: string | undefined): Record<string, string> {
  return workspaceId ? { 'anthropic-workspace-id': workspaceId } : {};
}

const notAsync = () => {
  throw new Error('the script adapter completes inline; poll/webhook is never used');
};

export function createAnthropicScriptProvider(
  model: ModelSpec,
  deps: { client?: ScriptClient; modelId?: string } = {},
): ScriptProvider {
  const modelId = deps.modelId ?? env.ANTHROPIC_SCRIPT_MODEL ?? DEFAULT_SCRIPT_MODEL;
  // Lazily constructed so a missing key fails at call time, not at import.
  let client = deps.client;

  return {
    id: model.providerId,
    kind: 'script',
    costCredits: () => model.creditsPerUnit,

    async run(input: ScriptInput, _ctx: ProviderContext) {
      client ??= new Anthropic({
        apiKey: requireEnv('ANTHROPIC_API_KEY'),
        defaultHeaders: anthropicHeaders(env.ANTHROPIC_WORKSPACE_ID),
      });
      const { system, user } = buildScriptPrompt(input);
      const response = await client.beta.messages.parse({
        model: modelId,
        max_tokens: 16000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        output_config: { effort: 'medium', format: betaZodOutputFormat(ScriptSchema) },
        system,
        messages: [{ role: 'user', content: user }],
      });

      if (response.stop_reason === 'refusal') {
        throw new Error(
          `script model declined the topic (${response.stop_details?.category ?? 'unknown'})`,
        );
      }
      if (response.stop_reason === 'max_tokens') {
        throw new Error('script model hit max_tokens before finishing the script');
      }
      const parsed = response.parsed_output;
      if (!parsed) throw new Error('script model returned no parseable script');

      return {
        kind: 'completed',
        output: toScriptOutput(parsed),
        costUsd: costUsdFor(response.model, response.usage),
      };
    },

    poll: async (_job: ProviderJob) => notAsync(),
    parseWebhook: async (_payload: WebhookPayload) => notAsync(),
  };
}
