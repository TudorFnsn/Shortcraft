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

export type SiteConfig = typeof siteConfig;
