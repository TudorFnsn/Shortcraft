/**
 * "Posted?" for a finished video (Library streak). Pure, so the route stays thin
 * and the rules are unit-tested (tests/render/posted.test.ts).
 */
import type { RenderJobRecord } from './repository';

/** How far back a client-supplied posted time is accepted (the one-time browser import). */
export const POSTED_BACKFILL_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PostedResult =
  | { ok: true; postedAt: string | null }
  | { ok: false; error: 'not_found' | 'not_ready' | 'invalid_input'; status: 404 | 409 | 400 };

/**
 * What to store for `body` on `job`. Someone else's job is `not_found` (never
 * confirm it exists); only finished videos can be posted. `postedAt` in the body
 * is honoured only when it is a real time in the last 60 days (moving a streak
 * kept in this browser to the account); otherwise the server's clock wins.
 */
export function decidePosted(
  job: RenderJobRecord | null,
  userId: string,
  body: unknown,
  now: Date,
): PostedResult {
  if (!job || job.userId !== userId) return { ok: false, error: 'not_found', status: 404 };
  if (job.status !== 'done') return { ok: false, error: 'not_ready', status: 409 };

  const b = (body ?? {}) as { posted?: unknown; postedAt?: unknown };
  if (typeof b.posted !== 'boolean') return { ok: false, error: 'invalid_input', status: 400 };
  if (!b.posted) return { ok: true, postedAt: null };

  const claimed = typeof b.postedAt === 'string' ? Date.parse(b.postedAt) : NaN;
  const valid =
    Number.isFinite(claimed) &&
    claimed <= now.getTime() &&
    claimed >= now.getTime() - POSTED_BACKFILL_DAYS * DAY_MS;
  return { ok: true, postedAt: new Date(valid ? claimed : now.getTime()).toISOString() };
}
