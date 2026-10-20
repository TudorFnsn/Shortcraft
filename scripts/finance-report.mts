/**
 * Finance report: MRR, net MRR, variable cost per finished video by tier,
 * failed-job spend and the MRR ratio. READ-ONLY (`select`s with the service
 * role from `.env.local`). Definitions live in `src/features/metrics/finance.ts`;
 * fixed vendor bills in `src/config/finance.ts`.
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

const { computeFinance } = await import('@/features/metrics/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(table: string, columns: string, since?: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = since ? base.gte('created_at', since) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number | null>;
const since = new Date(Date.now() - 31 * 86_400_000).toISOString();
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status'),
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, created_at, api_cost_usd, actual_credits',
    since,
  ),
]);

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? 'standard'),
    createdAt: new Date(String(j.created_at ?? 0)),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const { byTier, ...summary } = report;
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.table(summary);
console.table(byTier);
if (report.fixedUnknownVendors.length)
  console.log(`\nUnknown fixed costs (ratio overstated): ${report.fixedUnknownVendors.join(', ')}`);
