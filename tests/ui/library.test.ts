import { describe, expect, it } from 'vitest';
import {
  countByFilter,
  librarySummary,
  stepOf,
  timeAgo,
  toCard,
  anyWorking,
} from '@/app/gallery/library';
import { initialSelection } from '@/app/create/composer';
import { anotherLikeHref, freshIdea, lookFor } from '@/components/ideas';
import type { RenderJobRecord } from '@/features/render/repository';
import { estimateJobCredits } from '@/features/render/pricing';

const NOW = new Date('2026-10-10T12:00:00Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

function job(patch: Partial<RenderJobRecord> = {}): RenderJobRecord {
  return {
    id: 'j1',
    userId: 'u1',
    status: 'done',
    topic: 'Why honey never spoils',
    themeId: 'fun-facts',
    targetDurationSec: 15,
    language: 'en',
    modelTier: 'standard',
    title: 'Honey that lasts forever',
    voiceoverUrl: null,
    words: null,
    outputAssetUrl: 'https://example.supabase.co/storage/v1/object/sign/media/out.mp4',
    estimatedCredits: 2024,
    chargedCredits: 1990,
    actualCredits: 1990,
    apiCostUsd: 0.2,
    error: null,
    createdAt: ago(2 * 60 * MIN),
    updatedAt: ago(90 * MIN),
    ...patch,
  };
}

describe('stepOf', () => {
  it('names the six steps in the brand voice', () => {
    expect(stepOf('scripting')).toEqual({ step: 1, label: 'Writing script' });
    expect(stepOf('images')).toEqual({ step: 2, label: 'Drawing scenes' });
    expect(stepOf('voiceover')).toEqual({ step: 4, label: 'Recording voice' });
    expect(stepOf('stitching')).toEqual({ step: 6, label: 'Final cut' });
  });

  it('treats a queued job as step 1', () => {
    expect(stepOf('draft').step).toBe(1);
  });
});

describe('timeAgo', () => {
  it('reads like a person would say it', () => {
    expect(timeAgo(ago(10_000), NOW)).toBe('Just now');
    expect(timeAgo(ago(5 * MIN), NOW)).toBe('5 min ago');
    expect(timeAgo(ago(3 * 60 * MIN), NOW)).toBe('3h ago');
    expect(timeAgo(ago(30 * 60 * MIN), NOW)).toBe('Yesterday');
    expect(timeAgo(ago(4 * DAY), NOW)).toBe('4 days ago');
    expect(timeAgo('2026-09-03T08:00:00Z', NOW)).toBe('Sep 3');
  });
});

describe('toCard', () => {
  it('makes a ready, playable, new card from a finished live render', () => {
    const c = toCard(job(), NOW);
    expect(c).toMatchObject({
      kind: 'ready',
      title: 'Honey that lasts forever',
      themeLabel: 'Fun Facts',
      meta: 'Fun Facts · 15s · 1h ago',
      isNew: true,
      playable: true,
      hasThumb: true,
      percent: 100,
      creditsUsed: 1990,
    });
  });

  it('never marks a mock output as playable', () => {
    expect(toCard(job({ outputAssetUrl: 'mock://out.mp4' }), NOW).playable).toBe(false);
  });

  it('shows the named step and a non-empty bar while working', () => {
    const c = toCard(job({ status: 'scripting', title: null, createdAt: ago(MIN) }), NOW);
    expect(c).toMatchObject({ kind: 'working', step: 1, stepLabel: 'Writing script' });
    expect(c.title).toBe('Why honey never spoils');
    expect(c.percent).toBeGreaterThan(0);
    expect(c.meta).toBe('Fun Facts · 15s · Started 1 min ago');
    expect(c.hasThumb).toBe(false);
  });

  it('has a thumbnail once the scenes are drawn', () => {
    expect(toCard(job({ status: 'clips' }), NOW).hasThumb).toBe(true);
    expect(toCard(job({ status: 'images' }), NOW).hasThumb).toBe(false);
  });

  it('prices a retry at the current rate for the same settings', () => {
    const c = toCard(job({ status: 'failed', targetDurationSec: 30 }), NOW);
    expect(c.kind).toBe('failed');
    expect(c.retryCredits).toBe(
      estimateJobCredits({ targetDurationSec: 30, modelTier: 'standard' }),
    );
  });
});

describe('library summaries', () => {
  const jobs = [
    job({ id: 'a', status: 'images' }),
    job({ id: 'b', status: 'failed' }),
    job({ id: 'c' }),
    job({ id: 'd', createdAt: ago(10 * DAY), updatedAt: ago(10 * DAY) }),
  ];

  it('counts each filter', () => {
    expect(countByFilter(jobs.map((j) => toCard(j, NOW)))).toEqual({
      all: 4,
      working: 1,
      ready: 2,
      failed: 1,
    });
  });

  it('summarises the total and this week', () => {
    expect(librarySummary(jobs, NOW)).toBe('4 videos · 3 this week');
    expect(librarySummary([jobs[3]!], NOW)).toBe('1 video');
    expect(librarySummary([], NOW)).toBe('Nothing here yet.');
  });

  it('knows when to keep polling', () => {
    expect(anyWorking(jobs)).toBe(true);
    expect(anyWorking([jobs[2]!])).toBe(false);
  });
});

describe('Make another like this', () => {
  it('picks a fresh idea from the same theme, never the one just made', () => {
    const topic = lookFor('fun-facts').ideas[0]!;
    for (const seed of ['a', 'b', 'c', 'd', 'e', 'f']) {
      const idea = freshIdea('fun-facts', topic, seed);
      expect(idea).not.toBe(topic);
      expect(lookFor('fun-facts').ideas).toContain(idea);
    }
  });

  it('opens Create with the same theme, length and quality', () => {
    const href = anotherLikeHref({
      id: 'j1',
      themeId: 'horror-story',
      topic: 'x',
      durationSec: 30,
      tier: 'premium',
    });
    const params = Object.fromEntries(new URL(href, 'https://x').searchParams);
    expect(params).toMatchObject({ theme: 'horror-story', len: '30', tier: 'premium' });

    const sel = initialSelection({ params, lastJob: null });
    expect(sel).toMatchObject({ themeId: 'horror-story', durationSec: 30, tier: 'premium' });
    expect(sel.topic).toBe(params.idea);
  });

  it('ignores a bogus length or quality in the link', () => {
    const sel = initialSelection({ params: { len: '45', tier: 'ultra-hd' }, lastJob: null });
    expect(sel).toMatchObject({ durationSec: 15, tier: 'standard' });
  });
});
