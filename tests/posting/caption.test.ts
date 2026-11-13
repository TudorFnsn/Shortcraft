import { describe, expect, it } from 'vitest';
import {
  AI_DISCLOSURE_TAG,
  MAX_CAPTION_TITLE,
  THEME_HASHTAGS,
  hashtagsFor,
  postCaption,
  themesMissingHashtags,
} from '@/features/posting/caption';
import { THEMES } from '@/config/themes';

describe('postCaption', () => {
  it('puts the title, a blank line, then the look’s hashtags with the AI tag last', () => {
    expect(postCaption({ title: 'The intern who replied all', themeId: 'office-drama' })).toBe(
      'The intern who replied all\n\n#officedrama #worklife #corporatelife #AIgenerated',
    );
  });

  it('falls back to generic tags for a look no longer in the catalog', () => {
    expect(hashtagsFor('retired-look')).toEqual(['#shorts', '#viral', AI_DISCLOSURE_TAG]);
  });

  it('collapses whitespace and cuts long titles at a word boundary', () => {
    const long = `${'word '.repeat(80)}\n\nend`;
    const [line] = postCaption({ title: long, themeId: 'fun-facts' }).split('\n');
    expect(line!.length).toBeLessThanOrEqual(MAX_CAPTION_TITLE);
    expect(line).toMatch(/^word( word)*…$/);
  });

  it('cuts a title with no spaces mid-word rather than dropping it', () => {
    const [line] = postCaption({ title: 'x'.repeat(400), themeId: 'motivation' }).split('\n');
    expect(line).toBe(`${'x'.repeat(MAX_CAPTION_TITLE - 1)}…`);
  });

  it('is only hashtags when the title is blank', () => {
    expect(postCaption({ title: '   ', themeId: 'comedy-skit' })).toBe(
      '#comedy #skit #funny #AIgenerated',
    );
  });

  it('fits Instagram’s 2,200-character caption limit for any input', () => {
    for (const t of THEMES) {
      expect(postCaption({ title: 'a '.repeat(5000), themeId: t.id }).length).toBeLessThan(2200);
    }
  });
});

describe('THEME_HASHTAGS', () => {
  it('covers every look in the catalog', () => {
    expect(themesMissingHashtags()).toEqual([]);
  });

  it('uses three well-formed, unique tags per look and never repeats the AI tag', () => {
    for (const [id, tags] of Object.entries(THEME_HASHTAGS)) {
      expect(tags, id).toHaveLength(3);
      expect(new Set(tags).size, id).toBe(3);
      for (const tag of tags) expect(tag, id).toMatch(/^#[a-z0-9]+$/);
      expect(tags).not.toContain(AI_DISCLOSURE_TAG);
    }
  });
});
