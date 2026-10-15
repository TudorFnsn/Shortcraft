/**
 * FinOps report: MRR, ARPU, realised API cost per job tier and monthly cash,
 * read from the Supabase project in `.env.local`. READ-ONLY (`select`s only).
 * Math lives in `src/features/metrics/finops.ts`.
 *
 * Fixed monthly costs (hosting, plans) are not in the database: pass them with
 * `--fixed-usd=<n>` (see FinancePlan.md §5 for the ledger of subscriptions).
 *
 * Run: npx tsx scripts/finops-report.mts [--fixed-usd=60] [--json]
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

const { computeFinops } = await import('@/features/metrics/finops');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll<T>(table: string, columns: string, since?: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number>;
const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status'),
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, created_at, actual_credits, api_cost_usd',
    since,
  ),
]);

const fixedArg = process.argv.find((a) => a.startsWith('--fixed-usd='));
const report = computeFinops({
  now: new Date(),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    createdAt: new Date(String(j.created_at)),
    actualCredits: Number(j.actual_credits),
    apiCostUsd: Number(j.api_cost_usd),
  })),
  fixedMonthlyCostsUsd: fixedArg ? Number(fixedArg.split('=')[1]) : 0,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
console.log(`Shortcraft FinOps — as of ${report.asOf}\n`);
console.log(
  `MRR €${report.mrrEur} (${report.payingSubscribers} paying, ARPU €${report.arpuEur ?? 'n/a'})`,
);
console.table(report.byPlan);
console.log(
  `Last 30 days: ${report.last30d.doneJobs} done, ${report.last30d.failedJobs} failed, API cost $${report.last30d.apiCostUsd}`,
);
console.table(report.last30d.byTier);
console.log(
  `Revenue ÷ API cost: ${report.revenueToApiCost ?? 'n/a'}x · monthly cash $${report.monthlyCashUsd} (fixed $${report.fixedMonthlyCostsUsd})`,
);
