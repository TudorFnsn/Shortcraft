/**
 * North-star metrics: weekly paying-retained creators and the leading
 * indicators from TheMasterPlan §1 (activation, trial → paid, render
 * reliability), computed from data we already store. No analytics vendor, no
 * cookies, no new tables.
 *
 * Pure: the caller loads rows (Supabase in `scripts/metrics-report.mts`,
 * fixtures in tests) and passes `now`, so every number is reproducible.
 *
 * Definitions (all windows are half-open `[start, end)` in UTC ms):
 * - **Creator (week):** a user with ≥1 render job that reached `done`, created
 *   in that week. Failed or in-flight jobs don't count; a video they never got
 *   isn't value delivered.
 * - **Paying subscriber:** a live subscription (`active`/`trialing`/`past_due`)
 *   on a plan we sell, as of `now`. Top-up-only buyers are not subscribers.
 * - **North star:** paying subscribers who were creators in the last 7 days.
 * - **Activation:** of users who signed up 7–14 days ago (old enough to have
 *   had a full week), the share with a `done` video within 7 days of signup.
 * - **Trial → paid:** of users who signed up 7–35 days ago, the share who have
 *   paid at least once (any subscription grant or top-up).
 * - **Weekly trend:** subscription history isn't stored, so past weeks use
 *   "creators who had paid by that week's end" as the paying proxy.
 */
import { isLiveSubscription, type SubscriptionSnapshot } from '@/features/billing/entitlements';

export const DAY_MS = 86_400_000;
export const WEEK_MS = 7 * DAY_MS;

export interface MetricsUser {
  id: string;
  createdAt: Date;
}

export interface MetricsJob {
  userId: string;
  status: string;
  createdAt: Date;
}

export interface MetricsSubscription extends SubscriptionSnapshot {
  userId: string;
}

/** A ledger row whose reason is in `PAID_GRANT_REASONS`. */
export interface MetricsPaidGrant {
  userId: string;
  createdAt: Date;
}

export interface MetricsInput {
  users: readonly MetricsUser[];
  jobs: readonly MetricsJob[];
  subscriptions: readonly MetricsSubscription[];
  paidGrants: readonly MetricsPaidGrant[];
  now: Date;
}

/** `numerator / denominator`, or null when there is nobody to measure. */
export interface Ratio {
  numerator: number;
  denominator: number;
  rate: number | null;
}

export interface WeekPoint {
  /** Start of the week, ISO date (UTC). */
  weekStart: string;
  creators: number;
  /** Creators who had paid at least once by the end of the week. */
  paidCreators: number;
  videos: number;
}

export interface NorthStarReport {
  asOf: string;
  northStar: number;
  payingSubscribers: number;
  /** North star ÷ paying subscribers: are the people paying us actually using it? */
  subscriberWeeklyUse: Ratio;
  weeklyCreators: number;
  videosThisWeek: number;
  signupsThisWeek: number;
  activation: Ratio;
  trialToPaid: Ratio;
  /** Failed ÷ finished (done + failed) jobs created this week. */
  failureRate: Ratio;
  /** Oldest first, ending with the current week. */
  weeks: WeekPoint[];
}

const ratio = (numerator: number, denominator: number): Ratio => ({
  numerator,
  denominator,
  rate: denominator === 0 ? null : numerator / denominator,
});

const inWindow = (d: Date, start: number, end: number) => {
  const t = d.getTime();
  return t >= start && t < end;
};

/** Distinct users with a `done` job created in `[start, end)`, and the job count. */
function creatorsIn(jobs: readonly MetricsJob[], start: number, end: number) {
  const users = new Set<string>();
  let videos = 0;
  for (const j of jobs) {
    if (j.status !== 'done' || !inWindow(j.createdAt, start, end)) continue;
    users.add(j.userId);
    videos++;
  }
  return { users, videos };
}

export function computeNorthStar(input: MetricsInput, trendWeeks = 4): NorthStarReport {
  const now = input.now.getTime();
  const weekStart = now - WEEK_MS;

  const paying = new Set(
    input.subscriptions.filter((s) => isLiveSubscription(s)).map((s) => s.userId),
  );
  const firstPaidAt = new Map<string, number>();
  for (const g of input.paidGrants) {
    const t = g.createdAt.getTime();
    const prev = firstPaidAt.get(g.userId);
    if (prev === undefined || t < prev) firstPaidAt.set(g.userId, t);
  }
  const firstVideoAt = new Map<string, number>();
  for (const j of input.jobs) {
    if (j.status !== 'done') continue;
    const t = j.createdAt.getTime();
    const prev = firstVideoAt.get(j.userId);
    if (prev === undefined || t < prev) firstVideoAt.set(j.userId, t);
  }

  const thisWeek = creatorsIn(input.jobs, weekStart, now);
  const northStar = [...thisWeek.users].filter((u) => paying.has(u)).length;

  const signupsIn = (start: number, end: number) =>
    input.users.filter((u) => inWindow(u.createdAt, start, end));

  const activationCohort = signupsIn(now - 2 * WEEK_MS, weekStart);
  const activated = activationCohort.filter((u) => {
    const first = firstVideoAt.get(u.id);
    return first !== undefined && first < u.createdAt.getTime() + WEEK_MS;
  }).length;

  const conversionCohort = signupsIn(now - 5 * WEEK_MS, weekStart);
  const converted = conversionCohort.filter((u) => firstPaidAt.has(u.id)).length;

  let done = 0;
  let failed = 0;
  for (const j of input.jobs) {
    if (!inWindow(j.createdAt, weekStart, now)) continue;
    if (j.status === 'done') done++;
    else if (j.status === 'failed') failed++;
  }

  const weeks: WeekPoint[] = [];
  for (let i = trendWeeks - 1; i >= 0; i--) {
    const end = now - i * WEEK_MS;
    const start = end - WEEK_MS;
    const { users, videos } = creatorsIn(input.jobs, start, end);
    const paidCreators = [...users].filter((u) => {
      const paidAt = firstPaidAt.get(u);
      return paidAt !== undefined && paidAt < end;
    }).length;
    weeks.push({
      weekStart: new Date(start).toISOString().slice(0, 10),
      creators: users.size,
      paidCreators,
      videos,
    });
  }

  return {
    asOf: input.now.toISOString(),
    northStar,
    payingSubscribers: paying.size,
    subscriberWeeklyUse: ratio(northStar, paying.size),
    weeklyCreators: thisWeek.users.size,
    videosThisWeek: thisWeek.videos,
    signupsThisWeek: signupsIn(weekStart, now).length,
    activation: ratio(activated, activationCohort.length),
    trialToPaid: ratio(converted, conversionCohort.length),
    failureRate: ratio(failed, done + failed),
    weeks,
  };
}

/** "42% (5/12)", or "n/a (0/0)" when the cohort is empty. */
export const formatRatio = (r: Ratio): string =>
  `${r.rate === null ? 'n/a' : `${Math.round(r.rate * 100)}%`} (${r.numerator}/${r.denominator})`;
