/**
 * Ready-made theme presets for the Express video flow. Each one steers the
 * script + image prompts toward a recognizable short-form style.
 */
export interface Theme {
  id: string;
  label: string;
  blurb: string;
}

export const THEMES: readonly Theme[] = [
  { id: 'office-drama', label: 'Office Drama', blurb: 'Workplace intrigue and petty rivalries' },
  { id: 'horror-story', label: 'Horror Story', blurb: 'Creeping dread, twist ending' },
  { id: 'fun-facts', label: 'Fun Facts', blurb: 'Snappy did-you-knows' },
  { id: 'life-hack', label: 'Life Hack', blurb: 'One clever trick, fast' },
  { id: 'motivation', label: 'Motivation', blurb: 'Punchy, cinematic pep talk' },
  { id: 'mini-doc', label: 'Mini Documentary', blurb: 'Calm, narrated explainer' },
  { id: 'comedy-skit', label: 'Comedy Skit', blurb: 'Absurd, punchline-driven' },
  { id: 'story-time', label: 'Story Time', blurb: 'First-person dramatic tale' },
] as const;

export const isThemeId = (id: string): boolean => THEMES.some((t) => t.id === id);
