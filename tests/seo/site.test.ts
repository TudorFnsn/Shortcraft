import { describe, expect, it } from 'vitest';
import { THEMES } from '@/config/themes';
import { THEME_GUIDES } from '@/config/theme-guides';
import { lookFor } from '@/components/ideas';
import { KEYWORD_PAGES, keywordPage } from '@/config/keyword-pages';
import {
  DISALLOWED_PATHS,
  faqJsonLd,
  ideaPagePath,
  keywordPagePath,
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

describe('keyword pages', () => {
  it('are in the sitemap, outside the disallowed paths, and have a route folder', async () => {
    const { existsSync } = await import('node:fs');
    const urls = sitemapEntries('https://s.app').map((e) => e.url);
    for (const p of KEYWORD_PAGES) {
      expect(urls).toContain(`https://s.app${keywordPagePath(p.slug)}`);
      expect(p.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(existsSync(`src/app/${p.slug}/page.tsx`)).toBe(true);
    }
  });

  it('fit what search results show and never collide with theme guides or each other', () => {
    const all = [...KEYWORD_PAGES, ...Object.values(THEME_GUIDES)];
    for (const p of KEYWORD_PAGES) {
      expect(p.title.length).toBeLessThanOrEqual(65);
      expect(p.description.length).toBeGreaterThanOrEqual(70);
      expect(p.description.length).toBeLessThanOrEqual(160);
      expect(p.faq.length).toBeGreaterThanOrEqual(3);
      expect(new Set(p.faq.map((f) => f.q)).size).toBe(p.faq.length);
    }
    expect(new Set(all.map((g) => g.title)).size).toBe(all.length);
    expect(new Set(all.map((g) => g.description)).size).toBe(all.length);
    expect(new Set(KEYWORD_PAGES.map((p) => p.slug)).size).toBe(KEYWORD_PAGES.length);
  });

  it('only feature themes that exist', () => {
    for (const p of KEYWORD_PAGES) {
      expect(p.themeIds.length).toBeGreaterThan(0);
      for (const id of p.themeIds) expect(THEMES.some((t) => t.id === id)).toBe(true);
    }
  });

  it('throws on an unknown slug instead of rendering an empty page', () => {
    expect(() => keywordPage('nope')).toThrow(/Unknown keyword page/);
  });
});

describe('faqJsonLd', () => {
  it('emits a schema.org FAQPage with every question and answer', () => {
    const data = JSON.parse(faqJsonLd([{ q: 'Q1?', a: 'A1.' }]));
    expect(data).toEqual({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: [
        { '@type': 'Question', name: 'Q1?', acceptedAnswer: { '@type': 'Answer', text: 'A1.' } },
      ],
    });
  });

  it('cannot close the script tag it is rendered into', () => {
    const out = faqJsonLd([{ q: '</script><script>alert(1)</script>', a: 'x' }]);
    expect(out).not.toContain('<');
    expect(JSON.parse(out).mainEntity[0].name).toBe('</script><script>alert(1)</script>');
  });
});
