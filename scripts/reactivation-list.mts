/**
 * Re-activation list (FinancePlan F12): every user, segmented, with the note to
 * send and the goodwill grant to give, for the founder to work through by hand.
 * READ-ONLY: it only runs `select`s (service role, `.env.local`). It sends no
 * email and grants nothing; each grant line is a dry-run command to review.
 * Logic: `src/features/outreach/reactivation.ts`. Notes: `docs/outreach/reactivation.md`.
 *
 * Run: npx tsx scripts/reactivation-list.mts          (table + grant commands)
 *      npx tsx scripts/reactivation-list.mts --json   (raw rows)
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const envFile = resolve('.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && m[1] && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const { planReactivation, grantCommand } = await import('@/features/outreach/reactivation');
const { PAID_GRANT_REASONS, isStripeGrantKey } = await import('@/features/billing/entitlements');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const NOTE = `reactivation-${new Date().toISOString().slice(0, 7)}`;

/** Every row of a select, paged; `eq` narrows to one column value. */
async function selectAll<T>(
  table: string,
  columns: string,
  eq?: { column: string; value: string | boolean },
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const q = eq ? base.eq(eq.column, eq.value) : base;
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

async function listAuthUsers() {
  const users: { id: string; email: string | null; emailConfirmed: boolean; createdAt: Date }[] =
    [];
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`users: ${error.message}`);
    for (const u of data.users) {
      users.push({
        id: u.id,
        email: u.email ?? null,
        emailConfirmed: Boolean(u.email_confirmed_at),
        createdAt: new Date(u.created_at),
      });
    }
    if (data.users.length < 200) return users;
  }
}

type Row = Record<string, string | number | null>;
const [users, optedOut, jobs, subs, ledger] = await Promise.all([
  listAuthUsers(),
  selectAll<Row>('profiles', 'id, created_at', { column: 'email_opt_out', value: true }),
  selectAll<Row>('render_jobs', 'user_id, created_at', { column: 'status', value: 'done' }),
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'user_id, delta, reason, idempotency_key, created_at'),
]);

const balances = new Map<string, number>();
const paidUserIds = new Set<string>();
for (const t of ledger) {
  const id = String(t.user_id);
  balances.set(id, (balances.get(id) ?? 0) + Number(t.delta));
  const paidReason = (PAID_GRANT_REASONS as readonly string[]).includes(String(t.reason));
  if (paidReason && isStripeGrantKey(t.idempotency_key as string | null)) paidUserIds.add(id);
}

const rows = planReactivation({
  now: new Date(),
  users,
  optedOut: new Set(optedOut.map((p) => String(p.id))),
  doneJobs: jobs.map((j) => ({
    userId: String(j.user_id),
    createdAt: new Date(String(j.created_at)),
  })),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id),
    planId: String(s.plan_id),
    status: String(s.status),
  })),
  paidUserIds,
  balances,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2));
  process.exit(0);
}

console.log(
  `Re-activation list — ${new Date().toISOString().slice(0, 10)} (${rows.length} users)\n`,
);
console.table(
  rows.map((r) => ({
    segment: r.segment,
    email: r.contactable ? r.email : `(do not email) ${r.email ?? ''}`,
    plan: r.planId ?? '-',
    videos: r.finishedVideos,
    lastVideo: r.lastVideoOn ?? '-',
    signupDays: r.daysSinceSignup,
    balance: r.balance,
    grant: r.suggestedGrant,
  })),
);
const commands = rows.map((r) => grantCommand(r, NOTE)).filter((c): c is string => c !== null);
if (commands.length) {
  console.log('\nGoodwill grants (dry run; add --apply after review):');
  for (const c of commands) console.log(`  ${c}`);
}
console.log('\nNotes per segment: docs/outreach/reactivation.md');
