import { describe, expect, it } from 'vitest';
import { decidePosted } from '@/features/render/posted';
import type { RenderJobRecord } from '@/features/render/repository';

const NOW = new Date('2026-10-13T12:00:00Z');
const job = (patch: Partial<RenderJobRecord> = {}) =>
  ({ id: 'j1', userId: 'u1', status: 'done', postedAt: null, ...patch }) as RenderJobRecord;

describe('decidePosted', () => {
  it("hides other people's jobs and refuses unfinished ones", () => {
    expect(decidePosted(null, 'u1', { posted: true }, NOW)).toMatchObject({ status: 404 });
    expect(decidePosted(job({ userId: 'u2' }), 'u1', { posted: true }, NOW)).toMatchObject({
      error: 'not_found',
    });
    expect(decidePosted(job({ status: 'clips' }), 'u1', { posted: true }, NOW)).toMatchObject({
      error: 'not_ready',
      status: 409,
    });
  });

  it('needs a boolean', () => {
    expect(decidePosted(job(), 'u1', {}, NOW)).toMatchObject({ status: 400 });
    expect(decidePosted(job(), 'u1', null, NOW)).toMatchObject({ status: 400 });
    expect(decidePosted(job(), 'u1', { posted: 'yes' }, NOW)).toMatchObject({ status: 400 });
  });

  it('marks posted now, or clears it', () => {
    expect(decidePosted(job(), 'u1', { posted: true }, NOW)).toEqual({
      ok: true,
      postedAt: NOW.toISOString(),
    });
    expect(
      decidePosted(job({ postedAt: NOW.toISOString() }), 'u1', { posted: false }, NOW),
    ).toEqual({ ok: true, postedAt: null });
  });

  it('keeps an imported time from the last 60 days, never the future or older', () => {
    const tenDaysAgo = '2026-10-03T09:00:00.000Z';
    expect(decidePosted(job(), 'u1', { posted: true, postedAt: tenDaysAgo }, NOW)).toEqual({
      ok: true,
      postedAt: tenDaysAgo,
    });
    for (const postedAt of ['2026-10-20T00:00:00Z', '2026-01-01T00:00:00Z', 'yesterday']) {
      expect(decidePosted(job(), 'u1', { posted: true, postedAt }, NOW)).toEqual({
        ok: true,
        postedAt: NOW.toISOString(),
      });
    }
  });
});
