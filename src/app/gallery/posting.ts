/**
 * "Posted?" check-off and the weekly posting streak (pure, unit-tested).
 *
 * Faceless creators post every day, so the Library lets them tick off what
 * they've uploaded and shows the streak that builds. The log maps a job id to
 * the local calendar day it was marked posted ("2026-10-13"). It lives in the
 * browser (see usePostedLog), so it is per device until it moves to the database.
 */

export type PostedLog = Readonly<Record<string, string>>;

export interface PostingStats {
  /** Distinct days with a post in the last 7 days, today included. */
  thisWeek: number;
  /** Consecutive days with a post, ending today (or yesterday, still alive). */
  streak: number;
  /** True when the streak ends yesterday: posting today keeps it going. */
  atRisk: boolean;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** The local calendar day of `d` as "YYYY-MM-DD". */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** `day` moved by `delta` calendar days (DST-safe: works on dates, not ms). */
export function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return localDay(new Date(y, m - 1, d + delta));
}

/** Mark or unmark a video as posted today. Returns a new log. */
export function togglePosted(log: PostedLog, id: string, today: string): PostedLog {
  const next = { ...log };
  if (next[id]) delete next[id];
  else next[id] = today;
  return next;
}

export function postingStats(log: PostedLog, today: string): PostingStats {
  const days = new Set(Object.values(log).filter((d) => DAY.test(d)));
  let thisWeek = 0;
  for (let i = 0; i < 7; i++) if (days.has(shiftDay(today, -i))) thisWeek++;

  const atRisk = !days.has(today) && days.has(shiftDay(today, -1));
  let streak = 0;
  for (let day = atRisk ? shiftDay(today, -1) : today; days.has(day); day = shiftDay(day, -1)) {
    streak++;
  }
  return { thisWeek, streak, atRisk };
}

/** One friendly line for the Library header. */
export function streakLine({ thisWeek, streak, atRisk }: PostingStats): string {
  if (streak === 0 && thisWeek === 0) return 'Mark a video as posted to start your streak.';
  const week = `${thisWeek} of 7 days posted this week`;
  if (streak === 0) return `${week}. Post today to start a new streak.`;
  const run = `${streak}-day streak`;
  return atRisk ? `${run}. Post today to keep it going. ${week}.` : `${run} · ${week}`;
}
