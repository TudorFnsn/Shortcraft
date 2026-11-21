/**
 * The prompt moderator the app uses: the local rule screen first (free, instant,
 * works offline), then, when enabled, the LLM classifier for the grey zone.
 * Compose here, not at call sites.
 */
import { env } from '@/lib/env';
import { ok } from '@/lib/result';
import { createAnthropicModerator } from '@/features/providers/live/anthropic-moderation';
import { ruleBasedModerator, type PromptModerator } from './prompt-check';

/** Runs each moderator in order and stops at the first block, so later (paid) ones only see text that passed. */
export function layeredModerator(...moderators: readonly PromptModerator[]): PromptModerator {
  return {
    async check(text) {
      for (const m of moderators) {
        const result = await m.check(text);
        if (!result.ok) return result;
      }
      return ok(undefined);
    },
  };
}

/** The classifier calls Anthropic, so it is on only with live providers, the flag and a key. */
export function llmModerationEnabled(
  e: Pick<typeof env, 'MOCK_PROVIDERS' | 'MODERATION_LLM' | 'ANTHROPIC_API_KEY'> = env,
): boolean {
  return !e.MOCK_PROVIDERS && e.MODERATION_LLM && Boolean(e.ANTHROPIC_API_KEY);
}

let llm: PromptModerator | undefined;

export function getPromptModerator(): PromptModerator {
  if (!llmModerationEnabled()) return ruleBasedModerator;
  llm ??= layeredModerator(ruleBasedModerator, createAnthropicModerator());
  return llm;
}
