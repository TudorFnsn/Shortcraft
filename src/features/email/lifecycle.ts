/**
 * Lifecycle email: who gets which reminder today. Pure: the caller loads rows
 * and passes `now`, so every decision is reproducible in tests.
 *
 * Two emails, both aimed at the north star (TheMasterPlan §1):
 * - **first_video** (activation): a confirmed account 1–6 days old that has
 *   never finished a video. Sent once per account.
 * - **unused_credits** (retention): a live subscriber with no finished video
 *   in the last 7 days who still has credits for at least one short video.
 *   At most once every 7 days, and not in a subscription's first 3 days.
 *
 * Nobody who unsubscribed gets either. Account emails (confirm, password
 * reset) come from Supabase Auth and are not affected.
 */
import { isLiveSubscription } from '@/features/billing/entitlements';
import { estimateJobCredits } from '@/features/render/pricing';

export const DAY_MS = 86_400_000;

export type LifecycleKind = 'first_video' | 'unused_credits';

/** First-video reminders go to accounts between these ages. */
export const FIRST_VIDEO_MIN_AGE_MS = 1 * DAY_MS;
export const FIRST_VIDEO_MAX_AGE_MS = 6 * DAY_MS;
/** A subscriber is "inactive" after this long without a finished video. */
export const INACTIVE_MS = 7 * DAY_MS;
/** Minimum gap between two unused-credits reminders to the same person. */
export const NUDGE_EVERY_MS = 7 * DAY_MS;
/** Don't nudge someone who subscribed in the last few days. */
export const NEW_SUBSCRIBER_GRACE_MS = 3 * DAY_MS;
/**
 * How far back `doneJobs` must reach: the longest window any rule looks at.
 * The loader uses it so first_video can treat "no done job in range" as "never".
 */
export const LOOKBACK_MS = Math.max(FIRST_VIDEO_MAX_AGE_MS, INACTIVE_MS) + DAY_MS;

/** Credits for the shortest common video (15s Standard): the "enough to make one" bar. */
export const ONE_VIDEO_CREDITS = estimateJobCredits({
  targetDurationSec: 15,
  modelTier: 'standard',
});

export interface AudienceUser {
  id: string;
  email: string | null;
  emailConfirmed: boolean;
  createdAt: Date;
  optedOut: boolean;
}

export interface AudienceSubscription {
  userId: string;
  planId: string;
  status: string;
  createdAt: Date;
}

export interface Audience {
  users: readonly AudienceUser[];
  /** Finished (`done`) jobs created within LOOKBACK_MS of now. */
  doneJobs: readonly { userId: string; createdAt: Date }[];
  subscriptions: readonly AudienceSubscription[];
  /** Lifecycle emails already sent within LOOKBACK_MS of now. */
  recentSends: readonly { userId: string; kind: LifecycleKind; createdAt: Date }[];
}

export interface PlannedEmail {
  userId: string;
  email: string;
  kind: LifecycleKind;
  /** Idempotency key part: one send per (user, kind, periodKey). */
  periodKey: string;
  /** unused_credits only: the balance the email quotes. */
  balance?: number;
}

/**
 * Today's emails. `balances` must hold every live subscriber's balance; a
 * missing balance means "unknown" and that subscriber is skipped.
 */
export function planLifecycleEmails(
  audience: Audience,
  balances: ReadonlyMap<string, number>,
  now: Date,
): PlannedEmail[] {
  const t = now.getTime();
  const lastDone = new Map<string, number>();
  for (const j of audience.doneJobs) {
    const at = j.createdAt.getTime();
    if (at > (lastDone.get(j.userId) ?? -Infinity)) lastDone.set(j.userId, at);
  }
  const lastSent = new Map<string, number>();
  for (const s of audience.recentSends) {
    const k = `${s.userId}:${s.kind}`;
    const at = s.createdAt.getTime();
    if (at > (lastSent.get(k) ?? -Infinity)) lastSent.set(k, at);
  }
  const reachable = new Map(
    audience.users
      .filter((u) => u.email && u.emailConfirmed && !u.optedOut)
      .map((u) => [u.id, u] as const),
  );

  const planned: PlannedEmail[] = [];

  for (const u of reachable.values()) {
    const age = t - u.createdAt.getTime();
    if (age < FIRST_VIDEO_MIN_AGE_MS || age >= FIRST_VIDEO_MAX_AGE_MS) continue;
    if (lastDone.has(u.id) || lastSent.has(`${u.id}:first_video`)) continue;
    planned.push({ userId: u.id, email: u.email!, kind: 'first_video', periodKey: 'once' });
  }

  for (const s of audience.subscriptions) {
    const u = reachable.get(s.userId);
    if (!u || !isLiveSubscription(s)) continue;
    if (t - s.createdAt.getTime() < NEW_SUBSCRIBER_GRACE_MS) continue;
    const done = lastDone.get(s.userId);
    if (done !== undefined && t - done < INACTIVE_MS) continue;
    const sent = lastSent.get(`${s.userId}:unused_credits`);
    if (sent !== undefined && t - sent < NUDGE_EVERY_MS) continue;
    const balance = balances.get(s.userId);
    if (balance === undefined || balance < ONE_VIDEO_CREDITS) continue;
    planned.push({
      userId: s.userId,
      email: u.email!,
      kind: 'unused_credits',
      periodKey: now.toISOString().slice(0, 10),
      balance,
    });
  }

  return planned;
}
