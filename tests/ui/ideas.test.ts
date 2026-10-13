import { describe, expect, it } from 'vitest';
import { THEMES } from '@/config/themes';
import {
  THEME_LOOKS,
  createHref,
  dailyIdeas,
  dayKey,
  lookFor,
  tomorrowIdea,
} from '@/components/ideas';

describe('theme looks', () => {
  it('has a look with at least three ideas for every theme', () => {
    for (const t of THEMES) {
      expect(THEME_LOOKS[t.id], t.id).toBeDefined();
      expect(THEME_LOOKS[t.id]!.ideas.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('falls back to a known look for an unknown theme', () => {
    expect(lookFor('nope')).toBe(THEME_LOOKS['fun-facts']);
  });
});

describe('dailyIdeas', () => {
  it('is stable within a day and rotates across days', () => {
    const a = dailyIdeas('2026-10-10', 'fun-facts');
    expect(dailyIdeas('2026-10-10', 'fun-facts')).toEqual(a);
    const week = ['11', '12', '13', '14', '15', '16'].map((d) =>
      JSON.stringify(dailyIdeas(`2026-10-${d}`, 'fun-facts')),
    );
    expect(new Set([JSON.stringify(a), ...week]).size).toBeGreaterThan(1);
  });

  it("gives two ideas from the creator's theme and one from another", () => {
    const ideas = dailyIdeas('2026-10-10', 'horror-story');
    expect(ideas).toHaveLength(3);
    expect(ideas.filter((i) => i.themeId === 'horror-story')).toHaveLength(2);
    expect(ideas[2]!.themeId).not.toBe('horror-story');
    expect(new Set(ideas.map((i) => i.topic)).size).toBe(3);
  });

  it('works for a creator with no videos yet', () => {
    const ideas = dailyIdeas('2026-10-10', null);
    expect(ideas).toHaveLength(3);
    for (const i of ideas) expect(THEMES.some((t) => t.id === i.themeId)).toBe(true);
  });

  it('uses the UTC day as the key', () => {
    expect(dayKey(new Date('2026-10-10T23:30:00Z'))).toBe('2026-10-10');
  });
});

describe('createHref', () => {
  it('builds an encoded Create link', () => {
    expect(createHref({ themeId: 'fun-facts', topic: 'Why honey & bees?' })).toBe(
      '/create?theme=fun-facts&idea=Why+honey+%26+bees%3F',
    );
  });
});

describe("tomorrow's video", () => {
  const card = {
    themeId: 'fun-facts',
    topic: 'Why honey never spoils',
    durationSec: 30,
    tier: 'standard',
  };
  const now = new Date('2026-10-13T20:00:00Z');

  it("offers tomorrow's idea in the same theme, length and quality", () => {
    const next = tomorrowIdea(card, now);
    expect(lookFor('fun-facts').ideas).toContain(next.topic);
    const q = new URLSearchParams(next.href.split('?')[1]);
    expect(next.href.startsWith('/create?')).toBe(true);
    expect(q.get('theme')).toBe('fun-facts');
    expect(q.get('len')).toBe('30');
    expect(q.get('tier')).toBe('standard');
    expect(q.get('idea')).toBe(next.topic);
  });

  it('never repeats the video just made, and is stable for the day', () => {
    for (const topic of lookFor('fun-facts').ideas) {
      expect(tomorrowIdea({ ...card, topic }, now).topic).not.toBe(topic);
    }
    expect(tomorrowIdea(card, now)).toEqual(tomorrowIdea(card, new Date('2026-10-13T01:00:00Z')));
  });
});
