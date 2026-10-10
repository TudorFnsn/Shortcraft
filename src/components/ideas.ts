/**
 * How each theme looks on screen (the drawn sample frame on Create) plus a small
 * bank of ready-made video ideas per theme. The ideas power three things: the
 * idea chips under the Create composer, the prefilled first video for a new
 * account, and the "Today's ideas" row in the Library.
 *
 * Pure data + pure functions so both server and client components can use it.
 */
import { THEMES } from '@/config/themes';

export interface ThemeLook {
  /** Frame background, the soft "sun" shape and the foreground hill. */
  tint: string;
  glow: string;
  ground: string;
  /** A caption in the theme's voice, drawn on the sample frame. */
  caption: string;
  /** Ready-made ideas; the first three are the Create chips. */
  ideas: readonly string[];
}

export const THEME_LOOKS: Record<string, ThemeLook> = {
  'office-drama': {
    tint: '#34495c',
    glow: '#5b7690',
    ground: '#1f2c38',
    caption: 'She replied all. To the CEO.',
    ideas: [
      'The coworker who labels everything in the fridge',
      'A meeting that should have been an email',
      'Who keeps stealing my yoghurt',
      'The new intern is secretly the boss',
      'Two managers, one parking spot',
      'The printer only works for Dave',
    ],
  },
  'horror-story': {
    tint: '#1d2024',
    glow: '#3d4248',
    ground: '#0e1012',
    caption: 'The basement light was on again',
    ideas: [
      'The house that rearranges itself at night',
      'A voicemail from tomorrow',
      'The last bus never stops',
      'My reflection blinked first',
      'The neighbour who only waves at 3 a.m.',
      'A lift with a floor that is not on the panel',
    ],
  },
  'fun-facts': {
    tint: '#2c5a4c',
    glow: '#e3b25a',
    ground: '#1b3b31',
    caption: 'Octopuses have three hearts',
    ideas: [
      'Three facts about octopuses that sound made up',
      'Why honey never spoils',
      'The loudest animal on Earth',
      'Why the sky turns orange at sunset',
      'Animals that can survive in space',
      'The shortest war in history',
    ],
  },
  'life-hack': {
    tint: '#6b4a1e',
    glow: '#d99b45',
    ground: '#43300f',
    caption: 'Freeze your sponge. Trust me.',
    ideas: [
      'Fold a fitted sheet in 20 seconds',
      'Peel garlic without a knife',
      'Never lose a sock in the wash again',
      'Make cheap coffee taste expensive',
      'Pack a suitcase with half the space',
      'Keep herbs fresh for two weeks',
    ],
  },
  motivation: {
    tint: '#4b261b',
    glow: '#e0703f',
    ground: '#2a140e',
    caption: 'Nobody is coming. Go.',
    ideas: [
      'Discipline beats motivation',
      'What waking up at 5 a.m. taught me',
      'Start before you are ready',
      'The one-percent rule',
      'Why quitting is sometimes winning',
      'Your future self is watching',
    ],
  },
  'mini-doc': {
    tint: '#3b3f2b',
    glow: '#a7a26a',
    ground: '#23261a',
    caption: 'The town that vanished overnight',
    ideas: [
      'How lighthouses were kept lit',
      'The story of the first selfie',
      'Why cities glow orange at night',
      'The secret life of shipping containers',
      'How a single typo cost millions',
      'The island run by cats',
    ],
  },
  'comedy-skit': {
    tint: '#563258',
    glow: '#c77bb8',
    ground: '#341c36',
    caption: 'My cat filed a complaint',
    ideas: [
      'A pigeon applies for a job',
      'If my fridge could talk',
      'Aliens leave a review of our planet',
      'My smart speaker has opinions',
      'A dog explains the postman',
      'The houseplant that wants a raise',
    ],
  },
  'story-time': {
    tint: '#2a3352',
    glow: '#7d8fc7',
    ground: '#171d33',
    caption: 'So I moved in with a stranger',
    ideas: [
      'The roommate who never sleeps',
      'I found a note in a library book',
      'My first day was a total disaster',
      'The wrong number that changed my life',
      'I got locked in a museum overnight',
      'My grandma had a secret career',
    ],
  },
};

const FALLBACK_LOOK: ThemeLook = THEME_LOOKS['fun-facts']!;

export function lookFor(themeId: string): ThemeLook {
  return THEME_LOOKS[themeId] ?? FALLBACK_LOOK;
}

/** The theme and idea a brand-new account starts from (one tap to a first video). */
export const STARTER = { themeId: 'fun-facts', topic: FALLBACK_LOOK.ideas[0]! } as const;

export interface Idea {
  themeId: string;
  themeLabel: string;
  topic: string;
}

/** Small stable string hash (FNV-1a), so the daily pick is the same all day. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** UTC calendar day, e.g. "2026-10-10". */
export const dayKey = (now: Date): string => now.toISOString().slice(0, 10);

/**
 * Three fresh ideas for the day. Two come from the creator's usual theme (the
 * one they made last), so the row fits their channel; one comes from another
 * theme so there is always something new to try. Same day + same theme gives
 * the same ideas; the next day rotates them.
 */
export function dailyIdeas(day: string, preferThemeId?: string | null): Idea[] {
  const themeIds = THEMES.map((t) => t.id);
  const seed = hash(day);
  const home =
    preferThemeId && themeIds.includes(preferThemeId)
      ? preferThemeId
      : themeIds[seed % themeIds.length]!;
  const others = themeIds.filter((id) => id !== home);
  const other = others[hash(`${day}:other`) % others.length]!;

  const pick = (themeId: string, n: number, salt: string): Idea[] => {
    const ideas = lookFor(themeId).ideas;
    const start = hash(`${day}:${salt}`) % ideas.length;
    const label = THEMES.find((t) => t.id === themeId)?.label ?? themeId;
    return Array.from({ length: n }, (_, i) => ({
      themeId,
      themeLabel: label,
      topic: ideas[(start + i) % ideas.length]!,
    }));
  };

  return [...pick(home, 2, 'home'), ...pick(other, 1, 'other')];
}

/** Link that opens Create prefilled with an idea. */
export const createHref = (idea: Pick<Idea, 'themeId' | 'topic'>): string =>
  `/create?${new URLSearchParams({ theme: idea.themeId, idea: idea.topic }).toString()}`;
