/**
 * A ready-to-paste post caption for a finished video (pure, client-safe).
 *
 * The last step of idea → make → watch → post is the slowest one we don't
 * help with: the creator still has to write a caption and pick hashtags on
 * their phone. "Copy caption" in the player hands them both in one tap. Every
 * caption ends with #AIgenerated, so the post is honest about how it was made
 * (TikTok, YouTube and Meta all ask for AI-made content to be disclosed).
 */

import { THEMES } from '@/config/themes';

/** Three niche hashtags per look: specific enough to reach the right viewers. */
export const THEME_HASHTAGS: Readonly<Record<string, readonly string[]>> = {
  'office-drama': ['#officedrama', '#worklife', '#corporatelife'],
  'horror-story': ['#horrorstory', '#scarystories', '#creepy'],
  'fun-facts': ['#funfacts', '#didyouknow', '#learnontiktok'],
  'life-hack': ['#lifehack', '#lifehacks', '#tips'],
  motivation: ['#motivation', '#mindset', '#discipline'],
  'mini-doc': ['#documentary', '#history', '#explained'],
  'comedy-skit': ['#comedy', '#skit', '#funny'],
  'story-time': ['#storytime', '#storytelling', '#truestory'],
};

/** Always last: the AI disclosure. */
export const AI_DISCLOSURE_TAG = '#AIgenerated';

/** Fallback when a video's look isn't in the catalog any more. */
const GENERIC_HASHTAGS = ['#shorts', '#viral'] as const;

/**
 * The caption's first line. Titles normally come from the script, but older
 * videos fall back to the topic, which can be long, so it is cut at a word
 * boundary to stay readable above the fold.
 */
export const MAX_CAPTION_TITLE = 150;

export interface CaptionInput {
  title: string;
  themeId: string;
}

function headline(title: string): string {
  const clean = title.replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_CAPTION_TITLE) return clean;
  const cut = clean.slice(0, MAX_CAPTION_TITLE - 1);
  const space = cut.lastIndexOf(' ');
  const base = space > MAX_CAPTION_TITLE / 2 ? cut.slice(0, space) : cut;
  return `${base.replace(/[\s.,;:!?-]+$/, '')}…`;
}

/** The hashtags for a look, AI disclosure last, no duplicates. */
export function hashtagsFor(themeId: string): string[] {
  const own = THEME_HASHTAGS[themeId] ?? GENERIC_HASHTAGS;
  return [...new Set([...own, AI_DISCLOSURE_TAG])];
}

/** "Title\n\n#tag #tag #tag #AIgenerated", short enough for every platform. */
export function postCaption({ title, themeId }: CaptionInput): string {
  const line = headline(title);
  const tags = hashtagsFor(themeId).join(' ');
  return line ? `${line}\n\n${tags}` : tags;
}

/** Every look in the catalog has its own hashtags (checked by a test). */
export function themesMissingHashtags(): string[] {
  return THEMES.map((t) => t.id).filter((id) => !(id in THEME_HASHTAGS));
}
