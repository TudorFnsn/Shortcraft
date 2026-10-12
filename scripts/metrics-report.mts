/**
 * North-star report: weekly paying-retained creators + activation, trial → paid
 * and render failure rate, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role, so it sees every user).
 * Definitions live in `src/features/metrics/north-star.ts`.
 *
 * Run: npx tsx scripts/metrics-report.mts           (table)
 *      npx tsx scripts/metrics-report.mts --json    (raw report, for the digest)
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env.local into process.env BEFORE importing app modules (env validates on import).
const envFile = resolve('.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const { computeNorthStar, formatRatio } = await import('@/features/metrics/north-star');
const { PAID_GRANT_REASONS } = await import('@/features/billing/entitlements');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(
  table: string,
  columns: string,
  where?: { column: string; in: readonly string[] },
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = where ? base.in(where.column, [...where.in]) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string>;
const [profiles, jobs, subs, grants] = await Promise.all([
  selectAll<Row>('profiles', 'id, created_at'),
  selectAll<Row>('render_jobs', 'user_id, status, created_at'),
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'user_id, created_at', {
    column: 'reason',
    in: PAID_GRANT_REASONS,
  }),
]);

const date = (s: string | undefined) => new Date(s ?? 0);
const report = computeNorthStar({
  now: new Date(),
  users: profiles.map((p) => ({ id: p.id ?? '', createdAt: date(p.created_at) })),
  jobs: jobs.map((j) => ({
    userId: j.user_id ?? '',
    status: j.status ?? '',
    createdAt: date(j.created_at),
  })),
  subscriptions: subs.map((s) => ({
    userId: s.user_id ?? '',
    planId: s.plan_id ?? '',
    status: s.status ?? '',
  })),
  paidGrants: grants.map((g) => ({ userId: g.user_id ?? '', createdAt: date(g.created_at) })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`Shortcraft north star — as of ${report.asOf}\n`);
console.log(`★ Weekly paying-retained creators: ${report.northStar}`);
console.log(`  Paying subscribers:               ${report.payingSubscribers}`);
console.log(`  Subscribers who made a video:     ${formatRatio(report.subscriberWeeklyUse)}`);
console.log(`  Creators this week (all):         ${report.weeklyCreators}`);
console.log(`  Videos finished this week:        ${report.videosThisWeek}`);
console.log(`  Signups this week:                ${report.signupsThisWeek}`);
console.log(`  Activation (7–14d cohort):        ${formatRatio(report.activation)}`);
console.log(`  Trial → paid (7–35d cohort):      ${formatRatio(report.trialToPaid)}`);
console.log(`  Render failure rate (week):       ${formatRatio(report.failureRate)}\n`);
console.table(report.weeks);
