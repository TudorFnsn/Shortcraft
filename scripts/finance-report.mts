/**
 * Finance report: MRR vs provider cost, margin per tier and failed-job waste,
 * read from the Supabase project in `.env.local`. READ-ONLY (`select`s only).
 * Definitions live in `src/features/metrics/unit-economics.ts`.
 *
 * Fixed monthly costs aren't in the database: pass them in USD, e.g.
 *   FIXED_MONTHLY_USD=85 npx tsx scripts/finance-report.mts
 * (hosting + Supabase + ElevenLabs plan + domain + tools; see FinancePlan §3).
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

const { computeUnitEconomics } = await import('@/features/metrics/unit-economics');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll(table: string, columns: string, since?: string) {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = since ? base.gte('created_at', since) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll(
    'render_jobs',
    'status, model_tier, target_duration_sec, actual_credits, api_cost_usd, created_at',
    since,
  ),
]);

const report = computeUnitEconomics({
  now: new Date(),
  fixedMonthlyUsd: Number(process.env.FIXED_MONTHLY_USD ?? 0),
  subscriptions: subs.map((s) => ({
    planId: String(s.plan_id),
    status: String(s.status),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    targetDurationSec: Number(j.target_duration_sec),
    actualCredits: Number(j.actual_credits),
    apiCostUsd: Number(j.api_cost_usd),
    createdAt: new Date(String(j.created_at)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(
  `★ MRR: €${report.mrrGrossEur} gross · $${report.mrrNetUsd} net (${report.payingSubscribers} subscribers)`,
);
console.log(
  `  Provider cost, last 30d:    $${report.variableCostUsd30d} (failed jobs wasted $${report.failedCostUsd30d})`,
);
console.log(
  `  Gross margin:               $${report.grossMarginUsd} (${pct(report.grossMarginRate)})`,
);
console.log(`  Fixed costs (FIXED_MONTHLY_USD): $${report.fixedMonthlyUsd}`);
console.log(`  Contribution:               $${report.contributionUsd}`);
console.log(`  Videos finished, 30d:       ${report.videos30d}\n`);
console.table(report.byTier);
if (report.fixedMonthlyUsd === 0)
  console.log('\nNote: FIXED_MONTHLY_USD not set, contribution ignores fixed costs.');
