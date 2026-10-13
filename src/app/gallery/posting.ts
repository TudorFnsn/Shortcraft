/**
 * "Posted?" check-off and the weekly posting streak (pure, unit-tested).
 *
 * Faceless creators post every day, so the Library lets them tick off what
 * they've uploaded and shows the streak that builds. The log maps a job id to
 * the local calendar day it was marked posted ("2026-10-13"). The times are
 * saved on the account (render_jobs.posted_at, see usePostedLog).
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

interface PostableCard {
  id: string;
  kind: string;
  postedAt: string | null;
}

/**
 * The log the streak reads, from the server's `postedAt` per video plus any
 * optimistic changes not saved yet (`pending`: id → time, or null = unmarked).
 */
export function logFromCards(
  cards: readonly PostableCard[],
  pending: Readonly<Record<string, string | null>>,
): PostedLog {
  const log: Record<string, string> = {};
  for (const c of cards) {
    const at = c.id in pending ? pending[c.id] : c.postedAt;
    if (at) log[c.id] = localDay(new Date(at));
  }
  return log;
}

/**
 * Days ticked in this browser before the streak moved to the account, for
 * videos the server doesn't have as posted yet. Sent as local noon of that day.
 */
export function legacyImports(
  legacy: PostedLog,
  cards: readonly PostableCard[],
): { id: string; postedAt: string }[] {
  return cards
    .filter((c) => c.kind === 'ready' && !c.postedAt && DAY.test(legacy[c.id] ?? ''))
    .map((c) => {
      const [y, m, d] = legacy[c.id]!.split('-').map(Number) as [number, number, number];
      return { id: c.id, postedAt: new Date(y, m - 1, d, 12).toISOString() };
    });
}
