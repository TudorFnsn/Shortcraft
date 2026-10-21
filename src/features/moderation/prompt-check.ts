/**
 * Prompt moderation — the first line of the content-safety stack.
 *
 * Runs in POST /api/jobs before a job row or credit hold exists, so a blocked
 * topic costs the user nothing and costs us no provider calls. The later lines
 * are the providers' own filters (Claude refusals, the fal.ai image safety
 * checker), which fail the step and refund the job.
 *
 * This screen is deterministic and local (no vendor, works in mock mode). It
 * only blocks unambiguous requests for content we will never make: sexual
 * content involving minors, explicit sexual content, self-harm instructions,
 * weapon/drug synthesis instructions and calls for violence against a group.
 * Educational topics ("suicide prevention", "history of the atomic bomb") pass.
 * The grey zone (real people, harassment, scams) is the LLM classifier's job
 * (`providers/live/anthropic-moderation.ts`), layered after this screen in
 * `moderator.ts`.
 */
import { appError, err, ok, type AppError, type Result } from '@/lib/result';

export type ModerationCategory =
  | 'minor_sexual'
  | 'sexual_explicit'
  | 'self_harm'
  | 'weapons'
  | 'violent_hate'
  // Grey zone: only the LLM classifier returns these (no reliable word list exists).
  | 'real_person'
  | 'harassment'
  | 'scam';

/** Port: anything that can veto a user's prompt before we spend money on it. */
export interface PromptModerator {
  check(text: string): Promise<Result<void, AppError & { category?: ModerationCategory }>>;
}

const LEET: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

/**
 * Lowercase, strip accents, undo common digit/symbol substitutions, and turn
 * every other non-alphanumeric run into one space, padded at both ends so
 * patterns can anchor on whole words with " … ".
 */
export function normalizeForModeration(text: string): string {
  const folded = text
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[013457@$]/g, (c) => LEET[c] ?? c)
    .replace(/[^a-z]+/g, ' ')
    .trim();
  return ` ${folded} `;
}

const MINOR = String.raw`(child|children|kid|kids|minor|minors|underage|preteen|preteens|teen|teens|teenage|schoolgirl|schoolboy|toddler|little girl|little boy)`;
// No bare "explicit" (explicit lyrics) and no "naked mole rat" — those are everyday kids' topics.
const SEXUAL = String.raw`(sex|sexual|sexy|nude|nudes|naked(?! mole)|porn\w*|erotic\w*|nsfw|lewd|seductive|undress\w*)`;
const HOW_TO = String.raw`(how to|how do i|how can i|ways to|best way to|steps to|guide to|tutorial|instructions? (to|for|on))`;
const GROUP = String.raw`(jews|muslims|christians|blacks|whites|asians|arabs|immigrants|refugees|gays|lesbians|trans people|women|men)`;

interface Rule {
  category: ModerationCategory;
  pattern: RegExp;
}

const RULES: readonly Rule[] = [
  // Minors + sexual terms anywhere in the same prompt, in either order.
  {
    category: 'minor_sexual',
    pattern: new RegExp(` ${MINOR} (.* )?${SEXUAL} | ${SEXUAL} (.* )?${MINOR} `),
  },
  { category: 'minor_sexual', pattern: / (loli|lolicon|shota|shotacon|child porn\w*) / },
  {
    category: 'sexual_explicit',
    pattern:
      / (porn\w*|hentai|xxx|nsfw|nudes|explicit sex|sex scene|sex tape|nude (photos?|pics?|body|woman|women|man|men|girl|girls)) /,
  },
  {
    category: 'self_harm',
    pattern: new RegExp(
      ` ${HOW_TO} (kill (myself|yourself)|commit suicide|end (my|your) life|self harm|hurt (myself|yourself)|cut (myself|yourself)|starve (myself|yourself)) `,
    ),
  },
  { category: 'self_harm', pattern: / (suicide methods?|thinspo|thinspiration|pro ana|pro mia) / },
  {
    category: 'weapons',
    pattern: new RegExp(
      ` ${HOW_TO} (make|build|assemble|synthesi[sz]e|cook|produce) (an? |some )?(homemade )?(bomb|pipe bomb|explosives?|nail bomb|molotov( cocktail)?|napalm|nerve agent|sarin|ricin|anthrax|meth|methamphetamine|fentanyl|ghost gun|silencer) `,
    ),
  },
  {
    category: 'violent_hate',
    pattern: new RegExp(` (kill|exterminate|eradicate|gas|lynch|wipe out) (all )?(the )?${GROUP} `),
  },
  { category: 'violent_hate', pattern: / (heil hitler|white power|race war now|gas the) / },
];

/** Customer-facing reason per category. Plain, non-judgemental, no echo of the prompt. */
const REASONS: Record<ModerationCategory, string> = {
  minor_sexual: 'Shortcraft never makes sexual content involving minors.',
  sexual_explicit: "Shortcraft doesn't make sexual or explicit videos.",
  self_harm:
    "Shortcraft doesn't make videos that give self-harm instructions. If you're struggling, please reach out to a local crisis line.",
  weapons: "Shortcraft doesn't make instructions for weapons, explosives or drugs.",
  violent_hate: "Shortcraft doesn't make videos that call for violence against a group.",
  real_person:
    "Shortcraft doesn't make videos that put made-up words, acts or sexual content on a real person.",
  harassment: "Shortcraft doesn't make videos that target or demean a specific person.",
  scam: "Shortcraft doesn't make videos with false health or money claims, fake giveaways or impersonation.",
};

/** The `moderation_blocked` error for a category. Same shape for every moderator. */
export function moderationBlocked(category: ModerationCategory) {
  return err({ ...appError('moderation_blocked', REASONS[category]), category });
}

/** First matching category, or null if the text passes. Pure, for tests and reuse. */
export function screenPrompt(text: string): ModerationCategory | null {
  const normalized = normalizeForModeration(text);
  return RULES.find((r) => r.pattern.test(normalized))?.category ?? null;
}

/**
 * Categories an image or video model can actually depict. The other categories
 * are about instructions or calls to action, which live in words, not pictures;
 * matching them against scene prompts would mostly flag dark fiction and history
 * ("soldiers wipe out the men"), failing paid videos for nothing.
 */
const VISUAL_CATEGORIES: ReadonlySet<ModerationCategory> = new Set([
  'minor_sexual',
  'sexual_explicit',
]);

/** Like `screenPrompt`, limited to what a picture can show. */
export function screenVisualPrompt(text: string): ModerationCategory | null {
  const normalized = normalizeForModeration(text);
  return (
    RULES.find((r) => VISUAL_CATEGORIES.has(r.category) && r.pattern.test(normalized))?.category ??
    null
  );
}

export interface FlaggedScene {
  sceneIndex: number;
  category: ModerationCategory;
}

/**
 * Screens the prompts a script model wrote for the image and video models. The
 * user's topic already passed `screenPrompt`, but a borderline topic can still
 * steer the script into prompts we must never send to an image model; this
 * catches them before any image is generated (the provider safety checker is
 * the line after this one).
 */
export function screenScenePrompts(
  scenes: readonly { index: number; imagePrompt: string; motionPrompt: string }[],
): FlaggedScene | null {
  for (const scene of scenes) {
    const category =
      screenVisualPrompt(scene.imagePrompt) ?? screenVisualPrompt(scene.motionPrompt);
    if (category) return { sceneIndex: scene.index, category };
  }
  return null;
}

export const ruleBasedModerator: PromptModerator = {
  async check(text) {
    const category = screenPrompt(text);
    return category ? moderationBlocked(category) : ok(undefined);
  },
};
