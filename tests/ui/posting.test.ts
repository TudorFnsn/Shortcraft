import { describe, expect, it } from 'vitest';
import {
  legacyImports,
  localDay,
  logFromCards,
  postingStats,
  shiftDay,
  streakLine,
} from '@/app/gallery/posting';

const TODAY = '2026-10-13';

describe('days', () => {
  it('formats the local calendar day and shifts across month ends', () => {
    expect(localDay(new Date(2026, 9, 3, 23, 30))).toBe('2026-10-03');
    expect(shiftDay('2026-11-01', -1)).toBe('2026-10-31');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('postingStats', () => {
  it('counts a streak ending today and distinct days this week', () => {
    const log = { a: TODAY, b: TODAY, c: '2026-10-12', d: '2026-10-11', e: '2026-10-08' };
    expect(postingStats(log, TODAY)).toEqual({ thisWeek: 4, streak: 3, atRisk: false });
  });

  it('keeps a streak that ended yesterday alive but at risk', () => {
    expect(postingStats({ a: '2026-10-12', b: '2026-10-11' }, TODAY)).toEqual({
      thisWeek: 2,
      streak: 2,
      atRisk: true,
    });
  });

  it('breaks the streak after a missed day and ignores days older than a week', () => {
    expect(postingStats({ a: '2026-10-10', b: '2026-10-01' }, TODAY)).toEqual({
      thisWeek: 1,
      streak: 0,
      atRisk: false,
    });
  });

  it('ignores malformed entries', () => {
    expect(postingStats({ a: 'yesterday' }, TODAY).thisWeek).toBe(0);
  });
});

describe('streakLine', () => {
  it('invites, encourages and warns in plain words', () => {
    expect(streakLine({ thisWeek: 0, streak: 0, atRisk: false })).toBe(
      'Mark a video as posted to start your streak.',
    );
    expect(streakLine({ thisWeek: 4, streak: 3, atRisk: false })).toBe(
      '3-day streak · 4 of 7 days posted this week',
    );
    expect(streakLine({ thisWeek: 2, streak: 2, atRisk: true })).toBe(
      '2-day streak. Post today to keep it going. 2 of 7 days posted this week.',
    );
    expect(streakLine({ thisWeek: 1, streak: 0, atRisk: false })).toBe(
      '1 of 7 days posted this week. Post today to start a new streak.',
    );
  });
});

describe('on the account', () => {
  const card = (id: string, postedAt: string | null, kind = 'ready') => ({ id, kind, postedAt });

  it('builds the log from saved times plus unsaved changes', () => {
    const saved = new Date(2026, 9, 12, 18).toISOString();
    const cards = [card('a', saved), card('b', null), card('c', saved)];
    const now = new Date(2026, 9, 13, 9).toISOString();
    expect(logFromCards(cards, { b: now, c: null })).toEqual({
      a: '2026-10-12',
      b: '2026-10-13',
    });
  });

  it('imports browser-only days once, for finished videos not yet saved', () => {
    const cards = [
      card('a', null),
      card('b', new Date(2026, 9, 1).toISOString()),
      card('c', null, 'working'),
    ];
    const out = legacyImports({ a: '2026-10-11', b: '2026-10-11', c: '2026-10-11', z: 'x' }, cards);
    expect(out).toEqual([{ id: 'a', postedAt: new Date(2026, 9, 11, 12).toISOString() }]);
  });
});
