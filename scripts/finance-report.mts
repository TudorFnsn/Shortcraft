/**
 * Finance report: MRR, net MRR, realized API cost per video by tier, failed-job
 * burn and the burn ratio, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role). Definitions live in
 * `src/features/metrics/finance.ts`. Fixed costs (hosting, ElevenLabs plan, ...)
 * are not in the database: pass them with `--fixed=<usd per month>`.
 *
 * Run: npx tsx scripts/finance-report.mts [--days=30] [--fixed=45]   (table)
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

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const windowDays = Number(arg('days') ?? 30);
const fixedMonthlyCostUsd = Number(arg('fixed') ?? 0);
if (!Number.isFinite(windowDays) || windowDays <= 0 || !Number.isFinite(fixedMonthlyCostUsd)) {
  console.error('--days must be > 0 and --fixed a number');
  process.exit(2);
}

const admin = createSupabaseAdminClient();
const PAGE = 1000;

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number>;
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>('render_jobs', 'status, model_tier, actual_credits, api_cost_usd, created_at'),
]);

const report = computeFinance({
  now: new Date(),
  windowDays,
  fixedMonthlyCostUsd,
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    createdAt: new Date(String(j.created_at)),
    actualCredits: Number(j.actual_credits),
    apiCostUsd: Number(j.api_cost_usd),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`Shortcraft finance — as of ${report.asOf} (${report.windowDays}d window)\n`);
console.log(`MRR (gross, EUR):        €${report.mrrEur}`);
console.log(`Net MRR (USD):           $${report.netMrrUsd}  (after VAT + Stripe %)`);
console.log(`ARPU (EUR):              ${report.arpuEur ?? 'n/a'}`);
console.log(
  `API cost (window, USD):  $${report.apiCostUsd}  (failed jobs: $${report.failedCostUsd})`,
);
console.log(`Fixed costs (USD/mo):    $${report.fixedMonthlyCostUsd}`);
console.log(
  `Burn ratio:              ${report.burnRatio ?? 'n/a'}  (cost ÷ net MRR; >1 loses money)`,
);
console.log(`Contribution (USD/30d):  $${report.monthlyContributionUsd}\n`);
console.table(report.subscribersByPlan);
console.table(report.byTier);
