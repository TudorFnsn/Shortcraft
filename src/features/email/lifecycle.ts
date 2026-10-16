/**
 * Lifecycle email: who gets which reminder today. Pure: the caller loads rows
 * and passes `now`, so every decision is reproducible in tests.
 *
 * Three emails, all aimed at the north star (TheMasterPlan §1):
 * - **first_video** (activation): a confirmed account 1–6 days old that has
 *   never finished a video. Sent once per account.
 * - **trial_spent** (trial → paid): an account that has never paid, finished a
 *   video 1–7 days ago and no longer has credits for another short one. It
 *   says what a plan costs and links to /pricing. Sent once per account.
 * - **unused_credits** (retention): a live subscriber with no finished video
 *   in the last 7 days who still has credits for at least one short video.
 *   At most once every 7 days, and not in a subscription's first 3 days.
 *
 * Nobody who unsubscribed gets any of them. Account emails (confirm, password
 * reset) come from Supabase Auth and are not affected.
 */
import { isLiveSubscription } from '@/features/billing/entitlements';
import { estimateJobCredits } from '@/features/render/pricing';

export const DAY_MS = 86_400_000;

export type LifecycleKind = 'first_video' | 'trial_spent' | 'unused_credits';

/** Every kind, in the order the planner emits them (reports count each). */
export const LIFECYCLE_KINDS: readonly LifecycleKind[] = [
  'first_video',
  'trial_spent',
  'unused_credits',
];

/** First-video reminders go to accounts between these ages. */
export const FIRST_VIDEO_MIN_AGE_MS = 1 * DAY_MS;
export const FIRST_VIDEO_MAX_AGE_MS = 6 * DAY_MS;
/** Let a trial user enjoy their video for a day before the upgrade email. */
export const TRIAL_SPENT_DELAY_MS = 1 * DAY_MS;
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
  /** Users who ever bought a plan or a top-up (`PAID_GRANT_REASONS` in the ledger). */
  paidUserIds: readonly string[];
}

export interface PlannedEmail {
  userId: string;
  email: string;
  kind: LifecycleKind;
  /** Idempotency key part: one send per (user, kind, periodKey). */
  periodKey: string;
  /** unused_credits and trial_spent: the balance the email is based on. */
  balance?: number;
}

/**
 * Whose balance the planner needs: every subscriber, and every never-paid user
 * with a finished video in range (a trial_spent candidate). Keeps the per-user
 * balance reads to the few people who can get a balance-based email.
 */
export function balanceCandidates(audience: Audience): string[] {
  const paid = new Set(audience.paidUserIds);
  const ids = new Set(audience.subscriptions.map((s) => s.userId));
  for (const j of audience.doneJobs) if (!paid.has(j.userId)) ids.add(j.userId);
  return [...ids];
}

/**
 * Today's emails. `balances` must hold the balance of everyone in
 * `balanceCandidates`; a missing balance means "unknown" and that user is
 * skipped for the balance-based emails.
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

  const paid = new Set(audience.paidUserIds);
  const subscribed = new Set(
    audience.subscriptions.filter((s) => isLiveSubscription(s)).map((s) => s.userId),
  );
  for (const u of reachable.values()) {
    if (paid.has(u.id) || subscribed.has(u.id)) continue;
    const done = lastDone.get(u.id);
    if (done === undefined || t - done < TRIAL_SPENT_DELAY_MS) continue;
    if (lastSent.has(`${u.id}:trial_spent`)) continue;
    const balance = balances.get(u.id);
    if (balance === undefined || balance >= ONE_VIDEO_CREDITS) continue;
    planned.push({
      userId: u.id,
      email: u.email!,
      kind: 'trial_spent',
      periodKey: 'once',
      balance,
    });
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
