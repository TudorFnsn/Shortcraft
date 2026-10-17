/**
 * Finance report: MRR, measured API cost per video, gross margin and what free
 * users cost us, read from the Supabase project in `.env.local`. READ-ONLY:
 * only `select`s (service role). Definitions: `src/features/metrics/finance.ts`.
 * Provider invoices (fal, ElevenLabs, Anthropic, Vercel, Supabase) are NOT in
 * the database; the CFO routine compares this report against them by hand.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw report, for the digest)
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

const { computeFinance } = await import('@/features/metrics/finance');
const { PAID_GRANT_REASONS } = await import('@/features/billing/entitlements');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

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

type Row = Record<string, string | number>;
const [jobs, subs, grants] = await Promise.all([
  selectAll<Row>(
    'render_jobs',
    'user_id, status, created_at, api_cost_usd, actual_credits, target_duration_sec, model_tier',
  ),
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'user_id, created_at, delta, reason', {
    column: 'reason',
    in: PAID_GRANT_REASONS,
  }),
]);

const str = (v: string | number | undefined) => String(v ?? '');
const num = (v: string | number | undefined) => Number(v ?? 0);
const topUps = grants.filter((g) => g.reason === 'topup');
const report = computeFinance({
  now: new Date(),
  jobs: jobs.map((j) => ({
    userId: str(j.user_id),
    status: str(j.status),
    createdAt: new Date(str(j.created_at)),
    apiCostUsd: num(j.api_cost_usd),
    actualCredits: num(j.actual_credits),
    targetDurationSec: num(j.target_duration_sec),
    modelTier: str(j.model_tier),
  })),
  subscriptions: subs.map((s) => ({
    userId: str(s.user_id),
    planId: str(s.plan_id),
    status: str(s.status),
  })),
  topUps: topUps.map((t) => ({
    userId: str(t.user_id),
    createdAt: new Date(str(t.created_at)),
    credits: num(t.delta),
  })),
  payerIds: new Set([...subs, ...grants].map((r) => str(r.user_id))),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(`MRR: €${report.mrrEur.toFixed(2)} (net ${usd(report.netMrrUsd)})`);
console.log(`Live subscribers: ${JSON.stringify(report.liveSubscribers)}`);
console.log(`Top-ups 30d: ${report.topUps30d.count} (net ${usd(report.topUps30d.netRevenueUsd)})`);
console.log(`API cost 30d: ${JSON.stringify(report.apiCost30d)}`);
console.log(
  `Gross margin 30d: ${pct(report.grossMargin30d)} | revenue/cost: ${report.revenueToCost30d?.toFixed(2) ?? 'n/a'}x`,
);
console.log(`API cost per live subscriber 30d: ${usd(report.costPerSubscriber30d)}\n`);
console.table(report.byTier);
