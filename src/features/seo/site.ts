/**
 * Public-site SEO helpers: the canonical base URL, the indexable pages, and the
 * robots rules. Pure functions (no env import, no React) so they are unit-tested
 * in tests/seo and usable from `app/sitemap.ts`, `app/robots.ts` and the layout.
 */
import { THEMES } from '@/config/themes';
import { KEYWORD_PAGES, type KeywordFaq } from '@/config/keyword-pages';

const LOCAL = 'http://localhost:3000';

/**
 * The site's canonical origin, no trailing slash. An explicit
 * NEXT_PUBLIC_SITE_URL wins; otherwise on Vercel we use the production domain
 * (a system env var, set on every deployment), so canonical URLs and the
 * sitemap never point at localhost or at a Preview URL.
 */
export function resolveSiteUrl(e: Readonly<Record<string, string | undefined>>): string {
  const explicit = e.NEXT_PUBLIC_SITE_URL?.trim();
  if (explicit && !explicit.startsWith(LOCAL)) return explicit.replace(/\/+$/, '');
  const vercel = e.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/+$/, '')}`;
  return explicit ? explicit.replace(/\/+$/, '') : LOCAL;
}

/** The public theme page for a theme id. */
export const ideaPagePath = (themeId: string): string => `/ideas/${themeId}`;

/** The public keyword landing page for a slug in config/keyword-pages.ts. */
export const keywordPagePath = (slug: string): string => `/${slug}`;

/**
 * schema.org FAQPage JSON-LD for a page's questions, serialized for a
 * `<script type="application/ld+json">` tag. `<` is escaped so no answer text
 * can close the script element (Next.js JSON-LD guide).
 */
export function faqJsonLd(faq: readonly KeywordFaq[]): string {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a },
    })),
  };
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export interface SitemapEntry {
  url: string;
  changeFrequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  priority: number;
}

/** Every public, indexable page. Signed-in screens and the API are not listed. */
export function sitemapEntries(base: string): SitemapEntry[] {
  return [
    { url: `${base}/`, changeFrequency: 'weekly', priority: 1 },
    { url: `${base}/pricing`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${base}/ideas`, changeFrequency: 'weekly', priority: 0.8 },
    ...KEYWORD_PAGES.map((p) => ({
      url: `${base}${keywordPagePath(p.slug)}`,
      changeFrequency: 'monthly' as const,
      priority: 0.8,
    })),
    ...THEMES.map((t) => ({
      url: `${base}${ideaPagePath(t.id)}`,
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
    { url: `${base}/terms`, changeFrequency: 'yearly', priority: 0.2 },
    { url: `${base}/privacy`, changeFrequency: 'yearly', priority: 0.2 },
  ];
}

/** Paths crawlers should skip: private screens, auth, and the API. */
export const DISALLOWED_PATHS = ['/api/', '/create', '/gallery', '/login'] as const;
