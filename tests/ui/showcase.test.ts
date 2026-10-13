import { describe, expect, it } from 'vitest';
import {
  SHOWCASE_URL_TTL_SEC,
  parseShowcaseIds,
  showcaseVideos,
} from '@/components/landing/showcase';
import type { RenderJobRecord } from '@/features/render/repository';

const ORIGIN = 'https://proj.supabase.co';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const D = '44444444-4444-4444-8444-444444444444';

const job = (id: string, patch: Partial<RenderJobRecord> = {}) =>
  ({
    id,
    status: 'done',
    themeId: 'fun-facts',
    outputAssetUrl: `${ORIGIN}/storage/v1/object/sign/media/renders/${id}.mp4?token=x`,
    ...patch,
  }) as RenderJobRecord;

describe('parseShowcaseIds', () => {
  it('keeps up to three valid ids in order, without repeats', () => {
    expect(parseShowcaseIds(` ${A}, nope ,${B},${A},${C},${D}`)).toEqual([A, B, C]);
    expect(parseShowcaseIds(undefined)).toEqual([]);
    expect(parseShowcaseIds('')).toEqual([]);
  });
});

describe('showcaseVideos', () => {
  const deps = (jobs: Record<string, RenderJobRecord | null>, fail = '') => ({
    getJob: async (id: string) => jobs[id] ?? null,
    bucket: 'media',
    origin: ORIGIN,
    sign: async (path: string, ttl: number) => {
      if (path.includes(fail || '\0')) throw new Error('sign failed');
      return `${ORIGIN}/signed/${path}?ttl=${ttl}`;
    },
  });

  it('signs each finished job in order, with its theme', async () => {
    const out = await showcaseVideos(
      [A, B],
      deps({ [A]: job(A, { themeId: 'comedy-skit' }), [B]: job(B) }),
    );
    expect(out).toEqual([
      {
        themeId: 'comedy-skit',
        url: `${ORIGIN}/signed/renders/${A}.mp4?ttl=${SHOWCASE_URL_TTL_SEC}`,
      },
      {
        themeId: 'fun-facts',
        url: `${ORIGIN}/signed/renders/${B}.mp4?ttl=${SHOWCASE_URL_TTL_SEC}`,
      },
    ]);
  });

  it('skips missing, unfinished, foreign-bucket and failing jobs', async () => {
    const out = await showcaseVideos(
      [A, B, C, D],
      deps(
        {
          [B]: job(B, { status: 'clips' }),
          [C]: job(C, { outputAssetUrl: 'https://evil.example/x.mp4' }),
          [D]: job(D),
        },
        D,
      ),
    );
    expect(out).toEqual([]);
  });
});
