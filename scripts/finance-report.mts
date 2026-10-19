/**
 * Finance report: MRR, 30-day revenue vs API cost, cost per video and per
 * tier, read from the Supabase project in `.env.local`. READ-ONLY (selects
 * with the service role). Definitions live in `src/features/finance/finance.ts`.
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

const { computeFinance } = await import('@/features/finance/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const since = new Date(Date.now() - 30 * 86_400_000).toISOString();

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(table: string, columns: string, sinceCol?: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = sinceCol ? base.gte(sinceCol, since) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number>;
const [subs, grants, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'reason, delta, created_at', 'created_at'),
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, api_cost_usd, actual_credits, created_at',
    'created_at',
  ),
]);

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  grants: grants.map((g) => ({
    reason: String(g.reason),
    delta: Number(g.delta),
    createdAt: new Date(String(g.created_at)),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
    createdAt: new Date(String(j.created_at)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf} (net USD, 30-day window)\n`);
console.log(
  `MRR (net):              ${usd(report.mrrNetUsd)}  (${report.payingSubscribers} paying)`,
);
console.log(`Top-up revenue (net):   ${usd(report.topUpRevenueNetUsd30d)}`);
console.log(
  `API cost:               ${usd(report.apiCostUsd30d)}  (failed jobs: ${usd(report.failedJobCostUsd30d)})`,
);
console.log(
  `Gross margin:           ${pct(report.grossMargin30d)}   cost/revenue: ${pct(report.costToRevenue30d)}`,
);
console.log(`Videos finished:        ${report.doneVideos30d}`);
console.log(
  `Cost per finished video: ${report.costPerDoneVideoUsd === null ? 'n/a' : usd(report.costPerDoneVideoUsd)}\n`,
);
console.table(report.byTier);
