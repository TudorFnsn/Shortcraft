/**
 * Finance report: MRR, realised API cost per credit by tier, money burned on
 * failed renders, and the margin-gate verdict. READ-ONLY (selects only), reads
 * the Supabase project in `.env.local`. Definitions live in
 * `src/features/metrics/unit-economics.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw, for the routine)
 *      npx tsx scripts/finance-report.mts --days 30 (job window, default 30)
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
const { assessMargins } = await import('@/features/billing/margin');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const daysArg = process.argv.indexOf('--days');
const days = daysArg > 0 ? Number(process.argv[daysArg + 1]) : 30;
if (!Number.isFinite(days) || days <= 0) throw new Error('--days must be a positive number');
const since = new Date(Date.now() - days * 86_400_000).toISOString();

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll<T>(table: string, columns: string, sinceCol?: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (sinceCol) q = q.gte(sinceCol, since);
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number | null>;
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, actual_credits, api_cost_usd, created_at',
    'created_at',
  ),
]);

const report = computeUnitEconomics({
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    actualCredits: Number(j.actual_credits ?? 0),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
  })),
});
const gate = assessMargins();

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ windowDays: days, report, gateOk: gate.ok }, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
console.log(`Shortcraft finance — jobs from the last ${days} days\n`);
console.log(`MRR (list, VAT incl.):  €${report.mrrEur.toFixed(2)}`);
console.log(`Net MRR (ex VAT/fees):  ${usd(report.netMrrUsd)}`);
console.log(`Paying subscribers:     ${report.payingSubscribers}`);
console.log(`API cost (window):      ${usd(report.totalCostUsd)}`);
console.log(`  burned on failures:   ${usd(report.failedCostUsd)} (${report.failedJobs} jobs)`);
console.log(
  `Cost / net MRR:         ${report.costToNetMrr === null ? 'n/a' : `${(report.costToNetMrr * 100).toFixed(1)}%`}`,
);
console.log(`Margin gate:            ${gate.ok ? 'PASS' : 'FAIL'}\n`);
console.table(report.byPlan);
console.table(report.byTier);
