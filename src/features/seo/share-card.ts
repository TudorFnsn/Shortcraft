/**
 * Link-preview ("share card") content for the public site: what a link to
 * Shortcraft shows when it is pasted into X, Reddit, Discord, iMessage, Slack,
 * a Product Hunt post or our own emails. Before this, every link previewed as
 * a bare title with no image, which is the first impression of every launch
 * burst and every creator who shares the tool (TheMasterPlan §6).
 *
 * Pure data (no React, no env), so it is unit-tested in tests/seo and rendered
 * by the `opengraph-image.tsx` / `twitter-image.tsx` file conventions.
 */
import { siteConfig } from '@/config/site';
import { THEMES } from '@/config/themes';
import { lookFor } from '@/components/ideas';
import { KEYWORD_PAGES } from '@/config/keyword-pages';

/** The size every major platform renders as a large card (1.91:1). */
export const SHARE_CARD_SIZE = { width: 1200, height: 630 } as const;

/** Boxes palette (globals.css, light theme): cards are always the light look. */
export const SHARE_COLORS = {
  paper: '#f5f5f5',
  blush: '#f0e2dd',
  ink: '#212121',
  ember: '#f0354d',
  orange: '#f07142',
  sky: '#35b5f0',
  navy: '#042839',
  yellow: '#f0e835',
} as const;

/** One accent per look, so the eight theme cards read as a set, not clones. */
const THEME_ACCENTS: Readonly<Record<string, string>> = {
  'office-drama': SHARE_COLORS.sky,
  'horror-story': SHARE_COLORS.ember,
  'fun-facts': SHARE_COLORS.yellow,
  'life-hack': SHARE_COLORS.orange,
  motivation: SHARE_COLORS.ember,
  'mini-doc': SHARE_COLORS.sky,
  'comedy-skit': SHARE_COLORS.yellow,
  'story-time': SHARE_COLORS.orange,
};

/** Longest headline that still fits two lines at the card's type size. */
export const MAX_HEADLINE = 60;
/** Longest supporting line that fits one-to-two lines under the headline. */
export const MAX_SUBLINE = 110;

export interface ShareCard {
  /** Small label above the headline. */
  eyebrow: string;
  headline: string;
  subline: string;
  /** Up to two example ideas shown as chips (theme cards only). */
  chips: readonly string[];
  /** Accent colour for the eyebrow box and chips. */
  accent: string;
  /** Alt text for the image (accessibility + some crawlers). */
  alt: string;
}

/** Cut at a word boundary with an ellipsis so text never overflows the card. */
export function fitText(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  const base = space > max / 2 ? cut.slice(0, space) : cut;
  return `${base.replace(/[\s.,;:!?-]+$/, '')}…`;
}

/** Chips are short, so long ideas are cut harder than the headline. */
const MAX_CHIP = 34;

/** The site-wide card: used by every page that has no card of its own. */
export function siteShareCard(): ShareCard {
  const trial = siteConfig.trialCredits.toLocaleString('en-US');
  return {
    eyebrow: 'AI short-video generator',
    headline: fitText(siteConfig.tagline, MAX_HEADLINE),
    subline: fitText(
      `Idea in, ready-to-post TikTok, Reels or Shorts out. ${trial} free credits to start.`,
      MAX_SUBLINE,
    ),
    chips: ['Script', 'Scenes', 'Voiceover', 'Subtitles'],
    accent: SHARE_COLORS.ember,
    alt: `${siteConfig.name}: ${siteConfig.tagline}`,
  };
}

/** The card for `/ideas/<theme>`, or null for an unknown theme. */
export function themeShareCard(themeId: string): ShareCard | null {
  const theme = THEMES.find((t) => t.id === themeId);
  if (!theme) return null;
  const ideas = lookFor(theme.id).ideas.slice(0, 2);
  return {
    eyebrow: `${theme.label} ideas`,
    headline: fitText(`${theme.label} videos, made for you`, MAX_HEADLINE),
    subline: fitText(`${theme.blurb}. Pick an idea, get a narrated 9:16 video.`, MAX_SUBLINE),
    chips: ideas.map((i) => fitText(i, MAX_CHIP)),
    accent: THEME_ACCENTS[theme.id] ?? SHARE_COLORS.ember,
    alt: `${theme.label} video ideas on ${siteConfig.name}`,
  };
}

/**
 * The card for a keyword landing page (`/<slug>`, config/keyword-pages.ts), or
 * null for an unknown slug. These are the pages search traffic lands on, so
 * their links get their own card instead of the generic site one.
 */
export function keywordShareCard(slug: string): ShareCard | null {
  const page = KEYWORD_PAGES.find((p) => p.slug === slug);
  if (!page) return null;
  const trial = siteConfig.trialCredits.toLocaleString('en-US');
  const looks = page.themeIds
    .map((id) => THEMES.find((t) => t.id === id)?.label)
    .filter((label): label is string => Boolean(label))
    .slice(0, 3);
  return {
    eyebrow: 'Free to try',
    headline: fitText(page.heading, MAX_HEADLINE),
    subline: fitText(
      `Type an idea, get a narrated, captioned 9:16 video. ${trial} free credits, no card.`,
      MAX_SUBLINE,
    ),
    chips: looks.map((l) => fitText(l, MAX_CHIP)),
    accent: SHARE_COLORS.sky,
    alt: `${page.heading} on ${siteConfig.name}`,
  };
}

/** Readable ink on an accent box (yellow and sky need dark text). */
export function inkOn(accent: string): string {
  return accent === SHARE_COLORS.yellow || accent === SHARE_COLORS.sky
    ? SHARE_COLORS.ink
    : '#ffffff';
}
