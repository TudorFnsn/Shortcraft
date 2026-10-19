/**
 * Finance report: MRR, trailing-30-day API spend, cost per finished video by
 * tier, COGS ratio and the subscribers who cost more than they pay, read from
 * the Supabase project in `.env.local`. READ-ONLY: it only runs `select`s
 * (service role, so it sees every user). Definitions live in
 * `src/features/finance/unit-economics.ts`. Pair it with
 * `scripts/margin-report.mts` (the worst-case gate) and Stripe (real revenue).
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw report, for the digest)
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

const { computeFinance } = await import('@/features/finance/unit-economics');
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

type Row = Record<string, string | number>;
const [jobs, subs, grants] = await Promise.all([
  selectAll<Row>(
    'render_jobs',
    'user_id, status, model_tier, target_duration_sec, api_cost_usd, actual_credits, created_at',
  ),
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'user_id, created_at', {
    column: 'reason',
    in: PAID_GRANT_REASONS,
  }),
]);

const str = (v: string | number | undefined) => String(v ?? '');
const report = computeFinance({
  now: new Date(),
  jobs: jobs.map((j) => ({
    userId: str(j.user_id),
    status: str(j.status),
    modelTier: str(j.model_tier),
    targetDurationSec: Number(j.target_duration_sec ?? 0),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
    createdAt: new Date(str(j.created_at)),
  })),
  subscriptions: subs.map((s) => ({
    userId: str(s.user_id),
    planId: str(s.plan_id),
    status: str(s.status),
  })),
  payerIds: new Set(grants.map((g) => str(g.user_id))),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(n < 1 ? 4 : 2)}`);
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf} (trailing ${report.windowDays}d)\n`);
console.log(`★ MRR (gross):               €${report.mrrEur.toFixed(2)}`);
console.log(`  Net MRR (after VAT + fees): ${usd(report.netMrrUsd)}`);
console.log(`  Paying subscribers:         ${report.payingSubscribers}`);
console.log(`  Net ARPU:                   ${usd(report.netArpuUsd)}`);
console.log(`  API spend (30d):            ${usd(report.spendUsd)}`);
console.log(`  …of which failed jobs:      ${usd(report.wasteUsd)}`);
console.log(`  …of which never-paid users: ${usd(report.trialBurnUsd)} (trial burn)`);
console.log(`  API spend / subscriber:     ${usd(report.spendPerSubscriberUsd)}`);
console.log(`  COGS ratio:                 ${pct(report.cogsRatio)}   (gate promises <= 33.3%)`);
console.log(`  Gross margin:               ${pct(report.grossMargin)}`);
console.log(`  Tokens:                     ${report.tokens} (not stored per job yet)\n`);
console.table(report.tiers);
if (report.underwater.length > 0) {
  console.log(`\nSubscribers costing more than they pay (${report.underwater.length}):`);
  console.table(report.underwater);
} else {
  console.log('\nTop spenders (subscribers):');
  console.table(report.topSpenders);
}
