import { lookFor } from '@/components/ideas';

/** A look's colours as one gradient: for poster letters and small frames. */
export function lookFill(themeId: string): string {
  const look = lookFor(themeId);
  return `linear-gradient(160deg, ${look.glow}, ${look.tint} 55%, ${look.ground})`;
}

/** The SHORTCRAFT poster letters, each filled with a look in turn. */
export const POSTER_LOOKS = [
  'fun-facts',
  'horror-story',
  'office-drama',
  'life-hack',
  'motivation',
  'mini-doc',
  'comedy-skit',
  'story-time',
] as const;

/** A week of posts on the ember box: day, look and the caption drawn on it. */
export const WEEK = [
  { day: 'Mon', themeId: 'fun-facts', caption: 'Octopuses have 3 hearts' },
  { day: 'Tue', themeId: 'horror-story', caption: 'Do not open the attic' },
  { day: 'Wed', themeId: 'life-hack', caption: 'Fold a shirt in 2s' },
  { day: 'Thu', themeId: 'mini-doc', caption: 'The last lighthouse keeper' },
  { day: 'Fri', themeId: 'comedy-skit', caption: 'My cat files taxes' },
  { day: 'Sat', themeId: 'motivation', caption: 'Start before you are ready' },
] as const;
