import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { THEMES } from '@/config/themes';
import { siteConfig } from '@/config/site';
import { KEYWORD_PAGES } from '@/config/keyword-pages';
import {
  MAX_HEADLINE,
  MAX_SUBLINE,
  SHARE_CARD_SIZE,
  SHARE_COLORS,
  fitText,
  inkOn,
  keywordShareCard,
  siteShareCard,
  themeShareCard,
} from '@/features/seo/share-card';

describe('fitText', () => {
  it('keeps short text and collapses whitespace', () => {
    expect(fitText('  hello \n world ', 20)).toBe('hello world');
  });

  it('cuts long text at a word boundary with an ellipsis', () => {
    const out = fitText('word '.repeat(40), 30);
    expect(out.length).toBeLessThanOrEqual(30);
    expect(out).toMatch(/^word( word)*…$/);
  });

  it('cuts a single long word mid-word rather than dropping it', () => {
    expect(fitText('x'.repeat(50), 10)).toBe(`${'x'.repeat(9)}…`);
  });
});

describe('siteShareCard', () => {
  it('is a 1200×630 card naming the product, tagline and the free trial', () => {
    expect(SHARE_CARD_SIZE).toEqual({ width: 1200, height: 630 });
    const card = siteShareCard();
    expect(card.headline).toBe(siteConfig.tagline);
    expect(card.subline).toContain(siteConfig.trialCredits.toLocaleString('en-US'));
    expect(card.alt).toContain(siteConfig.name);
    expect(card.subline.length).toBeLessThanOrEqual(MAX_SUBLINE);
  });
});

describe('themeShareCard', () => {
  it('returns null for an unknown theme', () => {
    expect(themeShareCard('retired-look')).toBeNull();
  });

  it('has a card for every look whose text fits the card', () => {
    for (const t of THEMES) {
      const card = themeShareCard(t.id);
      expect(card, t.id).not.toBeNull();
      expect(card!.eyebrow).toContain(t.label);
      expect(card!.headline.length, t.id).toBeLessThanOrEqual(MAX_HEADLINE);
      expect(card!.subline.length, t.id).toBeLessThanOrEqual(MAX_SUBLINE);
      expect(card!.chips.length, t.id).toBeGreaterThan(0);
      expect(card!.chips.length, t.id).toBeLessThanOrEqual(2);
      expect(Object.values(SHARE_COLORS)).toContain(card!.accent);
    }
  });
});

describe('keywordShareCard', () => {
  it('returns null for an unknown keyword page', () => {
    expect(keywordShareCard('ai-cat-video-generator')).toBeNull();
  });

  it('has a card for every keyword page, headed by its H1 and fitting the card', () => {
    for (const page of KEYWORD_PAGES) {
      const card = keywordShareCard(page.slug);
      expect(card, page.slug).not.toBeNull();
      expect(card!.headline, page.slug).toBe(page.heading);
      expect(card!.headline.length, page.slug).toBeLessThanOrEqual(MAX_HEADLINE);
      expect(card!.subline.length, page.slug).toBeLessThanOrEqual(MAX_SUBLINE);
      expect(card!.subline).toContain(siteConfig.trialCredits.toLocaleString('en-US'));
      expect(card!.chips.length, page.slug).toBeGreaterThan(0);
      expect(card!.chips.length, page.slug).toBeLessThanOrEqual(3);
      expect(card!.alt).toContain(siteConfig.name);
    }
  });
});

describe('inkOn', () => {
  it('uses dark text on light accents and white on strong ones', () => {
    expect(inkOn(SHARE_COLORS.yellow)).toBe(SHARE_COLORS.ink);
    expect(inkOn(SHARE_COLORS.sky)).toBe(SHARE_COLORS.ink);
    expect(inkOn(SHARE_COLORS.ember)).toBe('#ffffff');
  });
});

describe('route files', () => {
  it('ship an Open Graph and a Twitter image for the site, theme and keyword pages', () => {
    const app = join(process.cwd(), 'src/app');
    for (const dir of ['', 'ideas/[theme]', ...KEYWORD_PAGES.map((p) => p.slug)]) {
      for (const f of ['opengraph-image.tsx', 'twitter-image.tsx']) {
        expect(existsSync(join(app, dir, f)), `${dir}/${f}`).toBe(true);
      }
    }
  });
});
