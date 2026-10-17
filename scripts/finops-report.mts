/**
 * FinOps report: MRR, MRR ratio (API cost / MRR), realised cost per video by
 * tier and monthly cash, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role). Math lives in
 * `src/features/metrics/finops.ts`.
 *
 * Fixed costs (hosting, DB, tools) aren't stored anywhere the app can read, so
 * pass them in: FIXED_MONTHLY_USD=45 npx tsx scripts/finops-report.mts
 *
 * Run: npx tsx scripts/finops-report.mts [--days=30] [--json]
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

const { computeFinops } = await import('@/features/metrics/finops');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const windowDays = Number(process.argv.find((a) => a.startsWith('--days='))?.slice(7) ?? 30);

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll(table: string, columns: string): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Record<string, string>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [jobs, subs] = await Promise.all([
  selectAll('render_jobs', 'status, model_tier, created_at, api_cost_usd, actual_credits'),
  selectAll('subscriptions', 'plan_id, status, created_at'),
]);

const report = computeFinops({
  now: new Date(),
  windowDays,
  jobs: jobs.map((j) => ({
    tier: j.model_tier ?? 'standard',
    status: j.status ?? '',
    createdAt: new Date(j.created_at ?? 0),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
  })),
  subscriptions: subs.map((s) => ({ planId: s.plan_id ?? '', status: s.status ?? '' })),
  fixedMonthlyUsd: Number(process.env.FIXED_MONTHLY_USD ?? 0),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft FinOps — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `MRR (net of VAT + Stripe):  $${report.mrrUsd}  (${report.payingSubscribers} subscribers)`,
);
console.log(`API cost, scaled to 30d:    $${report.apiCostMonthlyUsd}`);
console.log(`MRR ratio (cost / MRR):     ${pct(report.mrrRatio)}   (target <= 33.3%)`);
console.log(`Fixed monthly costs:        $${report.fixedMonthlyUsd}`);
console.log(
  `Net cash / month:           $${report.netCashUsd}  (margin ${pct(report.grossMargin)})\n`,
);
console.table(report.tiers);
