/**
 * Brand + product-wide constants. Renaming the product is a one-line change here.
 */
export const siteConfig = {
  name: 'Shortcraft',
  tagline: 'Create viral AI videos in minutes',
  description:
    'Turn an idea into a TikTok, Reels or Shorts video — script, images, clips, voiceover and subtitles, generated for you.',
  // Used in emails, canonical URLs, OG tags. Overridden by NEXT_PUBLIC_SITE_URL.
  defaultUrl: 'http://localhost:3000',
  supportEmail: 'support@shortcraft.app',
  // New accounts get a small trial so the first generation is free.
  trialCredits: 3000,
} as const;

/**
 * Longest prompt (video topic) a creator can type in Create and send to
 * `POST /api/jobs`. Owner decision 2026-10-14 (was 300).
 */
export const TOPIC_MAX_CHARS = 100_000;

/**
 * Longest idea carried in a URL (`/create?idea=…`, through sign-up). Stays
 * small: a 100k-character query string is rejected by browsers and Vercel
 * (414/431). Longer prompts are typed or pasted in Create itself.
 */
export const CARRIED_IDEA_MAX_CHARS = 300;

export type SiteConfig = typeof siteConfig;
