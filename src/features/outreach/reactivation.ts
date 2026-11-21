/**
 * Re-activation list (FinancePlan F12): who to write to by hand, and with what,
 * when the product has gone quiet. Pure, so it is tested without a database;
 * `scripts/reactivation-list.mts` feeds it read-only rows.
 *
 * Segments, highest priority first:
 *  - `paying_idle`      live subscriber, no finished video in the idle window
 *                       (MRR at risk: they pay and get nothing)
 *  - `tried_and_left`   never paid, made at least one video, then stopped
 *                       (they liked it once: the best trial → paid lead)
 *  - `never_activated`  never paid, never finished a video
 *                       (activation failure: ask what got in the way)
 *  - `active`           finished a video inside the window: leave them alone
 *
 * A user who opted out of email (`profiles.email_opt_out`) or has no confirmed
 * address is listed with `contactable: false` and must not be emailed.
 */
import { isLiveSubscription } from '@/features/billing/entitlements';
import { estimateJobCredits } from '@/features/render/pricing';

export const DAY_MS = 86_400_000;

/** No finished video for this long = idle. Longer than the weekly nudge on purpose. */
export const IDLE_MS = 14 * DAY_MS;

/** A goodwill top-up covers one 30s Standard video, the length most creators pick. */
export const GOODWILL_VIDEO_CREDITS = estimateJobCredits({
  targetDurationSec: 30,
  modelTier: 'standard',
});

export type ReactivationSegment = 'paying_idle' | 'tried_and_left' | 'never_activated' | 'active';

const PRIORITY: Record<ReactivationSegment, number> = {
  paying_idle: 0,
  tried_and_left: 1,
  never_activated: 2,
  active: 3,
};

export interface ReactivationInput {
  now: Date;
  users: { id: string; email: string | null; emailConfirmed: boolean; createdAt: Date }[];
  optedOut: ReadonlySet<string>;
  /** Finished (`done`) videos only. */
  doneJobs: { userId: string; createdAt: Date }[];
  subscriptions: { userId: string; planId: string; status: string }[];
  /** Users with any Stripe-backed grant (subscription or top-up), ever. */
  paidUserIds: ReadonlySet<string>;
  /** Current balance per user (SUM(delta)); missing = 0. */
  balances: ReadonlyMap<string, number>;
}

export interface ReactivationRow {
  userId: string;
  email: string | null;
  segment: ReactivationSegment;
  contactable: boolean;
  planId: string | null;
  finishedVideos: number;
  /** ISO date (YYYY-MM-DD) of the last finished video, or null. */
  lastVideoOn: string | null;
  daysSinceLastVideo: number | null;
  daysSinceSignup: number;
  balance: number;
  /**
   * Credits to grant by hand so they can make one 30s video right now
   * (0 for payers and for anyone who can already afford one).
   */
  suggestedGrant: number;
}

const days = (ms: number) => Math.floor(ms / DAY_MS);

export function planReactivation(input: ReactivationInput): ReactivationRow[] {
  const now = input.now.getTime();

  const videos = new Map<string, { count: number; last: number }>();
  for (const j of input.doneJobs) {
    const t = j.createdAt.getTime();
    const v = videos.get(j.userId);
    if (v) {
      v.count += 1;
      v.last = Math.max(v.last, t);
    } else videos.set(j.userId, { count: 1, last: t });
  }

  const livePlan = new Map<string, string>();
  for (const s of input.subscriptions) {
    if (isLiveSubscription(s)) livePlan.set(s.userId, s.planId);
  }

  const rows = input.users.map((u): ReactivationRow => {
    const v = videos.get(u.id);
    const planId = livePlan.get(u.id) ?? null;
    const balance = input.balances.get(u.id) ?? 0;
    const recent = v !== undefined && now - v.last < IDLE_MS;

    let segment: ReactivationSegment;
    if (recent) segment = 'active';
    else if (planId) segment = 'paying_idle';
    else if (input.paidUserIds.has(u.id) || v) segment = 'tried_and_left';
    else segment = 'never_activated';

    const goodwill =
      !planId && segment !== 'active' ? Math.max(0, GOODWILL_VIDEO_CREDITS - balance) : 0;

    return {
      userId: u.id,
      email: u.email,
      segment,
      contactable: Boolean(u.email) && u.emailConfirmed && !input.optedOut.has(u.id),
      planId,
      finishedVideos: v?.count ?? 0,
      lastVideoOn: v ? new Date(v.last).toISOString().slice(0, 10) : null,
      daysSinceLastVideo: v ? days(now - v.last) : null,
      daysSinceSignup: days(now - u.createdAt.getTime()),
      balance,
      suggestedGrant: goodwill,
    };
  });

  return rows.sort(
    (a, b) =>
      PRIORITY[a.segment] - PRIORITY[b.segment] ||
      Number(b.contactable) - Number(a.contactable) ||
      b.finishedVideos - a.finishedVideos ||
      a.daysSinceSignup - b.daysSinceSignup,
  );
}

/** The exact (dry-run) command to grant a row its goodwill credits, or null. */
export function grantCommand(row: ReactivationRow, note: string): string | null {
  if (row.suggestedGrant <= 0 || !row.contactable) return null;
  return `npx tsx scripts/grant-credits.mts --user ${row.userId} --credits ${row.suggestedGrant} --note ${note}`;
}
