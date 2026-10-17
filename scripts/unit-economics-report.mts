/**
 * Unit-economics report for the Finance CEO routine: MRR, realized API cost per
 * finished video by tier, cost per 1k credits vs what each plan earns per 1k
 * credits, and spend wasted on failed jobs. READ-ONLY (service role `select`s).
 * Math lives in `src/features/metrics/unit-economics.ts`.
 *
 * Run: npx tsx scripts/unit-economics-report.mts          (table)
 *      npx tsx scripts/unit-economics-report.mts --json   (for the digest)
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

async function selectAll(table: string, columns: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'created_at, plan_id, status'),
  selectAll(
    'render_jobs',
    'created_at, status, model_tier, target_duration_sec, actual_credits, api_cost_usd',
  ),
]);

const report = computeUnitEconomics(
  subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    targetDurationSec: Number(j.target_duration_sec),
    actualCredits: Number(j.actual_credits),
    apiCostUsd: Number(j.api_cost_usd),
  })),
);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`MRR (net of VAT, before Stripe fees): €${report.mrrNetEur.toFixed(2)}`);
console.log(`Active subscribers: ${report.activeSubscribers} ${JSON.stringify(report.byPlan)}`);
console.log(
  `Failed jobs: ${report.failedJobs} (API spend with no revenue: $${report.failedCostUsd.toFixed(2)})\n`,
);
console.table(report.tiers);
console.log('Net revenue per 1k credits by plan (USD):', report.netUsdPer1kCredits);
console.log('Compare with costPer1kCredits above: the gap is the realized gross margin.');
