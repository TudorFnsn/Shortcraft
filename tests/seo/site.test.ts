import { describe, expect, it } from 'vitest';
import { THEMES } from '@/config/themes';
import { THEME_GUIDES } from '@/config/theme-guides';
import { lookFor } from '@/components/ideas';
import {
  DISALLOWED_PATHS,
  ideaPagePath,
  resolveSiteUrl,
  sitemapEntries,
} from '@/features/seo/site';

describe('resolveSiteUrl', () => {
  it('prefers an explicit NEXT_PUBLIC_SITE_URL, without a trailing slash', () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: 'https://shortcraft.app/',
        VERCEL_PROJECT_PRODUCTION_URL: 'shortcraft-rho.vercel.app',
      }),
    ).toBe('https://shortcraft.app');
  });

  it('falls back to the Vercel production domain when the site URL is the localhost default', () => {
    expect(
      resolveSiteUrl({
        NEXT_PUBLIC_SITE_URL: 'http://localhost:3000',
        VERCEL_PROJECT_PRODUCTION_URL: 'shortcraft-rho.vercel.app',
      }),
    ).toBe('https://shortcraft-rho.vercel.app');
    expect(resolveSiteUrl({ VERCEL_PROJECT_PRODUCTION_URL: 'https://x.vercel.app/' })).toBe(
      'https://x.vercel.app',
    );
  });

  it('uses localhost when nothing is set', () => {
    expect(resolveSiteUrl({})).toBe('http://localhost:3000');
  });
});

describe('sitemap', () => {
  const urls = sitemapEntries('https://s.app').map((e) => e.url);

  it('lists the public pages and one page per theme', () => {
    expect(urls).toContain('https://s.app/');
    expect(urls).toContain('https://s.app/pricing');
    expect(urls).toContain('https://s.app/ideas');
    for (const t of THEMES) expect(urls).toContain(`https://s.app${ideaPagePath(t.id)}`);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('never lists a page robots.txt disallows', () => {
    for (const u of urls) {
      const path = new URL(u).pathname;
      for (const d of DISALLOWED_PATHS) expect(path.startsWith(d)).toBe(false);
    }
  });

  it('keeps private screens and the API out of the index', () => {
    expect(DISALLOWED_PATHS).toEqual(expect.arrayContaining(['/api/', '/create', '/gallery']));
  });
});

describe('theme guides', () => {
  it('has a guide for every theme, and nothing else', () => {
    expect(Object.keys(THEME_GUIDES).sort()).toEqual(THEMES.map((t) => t.id).sort());
  });

  it('fits what search results show and never repeats a title or description', () => {
    const guides = Object.values(THEME_GUIDES);
    for (const g of guides) {
      expect(g.title.length).toBeLessThanOrEqual(65);
      expect(g.description.length).toBeGreaterThanOrEqual(70);
      expect(g.description.length).toBeLessThanOrEqual(160);
    }
    expect(new Set(guides.map((g) => g.title)).size).toBe(guides.length);
    expect(new Set(guides.map((g) => g.description)).size).toBe(guides.length);
  });

  it('every theme page has ideas to list', () => {
    for (const t of THEMES) expect(lookFor(t.id).ideas.length).toBeGreaterThanOrEqual(3);
  });
});
