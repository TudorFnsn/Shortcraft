/**
 * Finance report: MRR, API cost ratio and contribution, read from the Supabase
 * project in `.env.local`. READ-ONLY: it only runs `select`s (service role).
 * Definitions live in `src/features/metrics/finance.ts`. Provider invoices and
 * Stripe payouts are not in the database: the Finance CEO routine reads those
 * through connectors and compares them with this report.
 *
 * Run: npx tsx scripts/finance-report.mts [--fixed=<usd per month>]   (table)
 *      npx tsx scripts/finance-report.mts --json                      (for the digest)
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
async function selectAll(table: string, columns: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectAll('render_jobs', 'status, model_tier, api_cost_usd, charged_credits, created_at'),
]);

const fixedArg = process.argv.find((a) => a.startsWith('--fixed='));
const report = computeFinance({
  now: new Date(),
  fixedCostsUsd: fixedArg ? Number(fixedArg.slice('--fixed='.length)) || 0 : 0,
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    apiCostUsd: Number(j.api_cost_usd) || 0,
    chargedCredits: Number(j.charged_credits) || 0,
    createdAt: new Date(String(j.created_at)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const { tiers, ...summary } = report;
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.table(summary);
console.table(tiers);
