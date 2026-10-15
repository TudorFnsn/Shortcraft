/**
 * Finance report: MRR, measured API cost per video / per credit, burned cost on
 * failed jobs and a gross-margin proxy, read from the Supabase project in
 * `.env.local`. READ-ONLY: it only runs `select`s (service role).
 * Definitions live in `src/features/metrics/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--days 30] [--json]
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

const { computeFinance } = await import('@/features/metrics/finance');
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
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const daysArg = process.argv.indexOf('--days');
const windowDays = daysArg > -1 ? Number(process.argv[daysArg + 1]) || 30 : 30;

const [jobs, subs] = await Promise.all([
  selectAll('render_jobs', 'status, model_tier, created_at, actual_credits, api_cost_usd'),
  selectAll('subscriptions', 'user_id, plan_id, status, created_at'),
]);

const report = computeFinance({
  now: new Date(),
  windowDays,
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? 'standard'),
    createdAt: new Date(String(j.created_at ?? 0)),
    actualCredits: Number(j.actual_credits ?? 0),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
  })),
  subscriptions: subs.map((s) => ({
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(4)}`);
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `MRR:                      €${report.mrrEur.toFixed(2)}  (net of VAT+fees $${report.netMrrUsd.toFixed(2)})`,
);
console.log(`Paying by plan:           ${JSON.stringify(report.payingByPlan)}`);
console.log(
  `ARPU:                     ${report.arpuEur === null ? 'n/a' : `€${report.arpuEur.toFixed(2)}`}`,
);
console.log(`Videos done:              ${report.doneJobs}`);
console.log(
  `API cost (done):          ${usd(report.apiCostUsd)}   avg/video ${usd(report.avgCostPerVideoUsd)}`,
);
console.log(`Burned on failed jobs:    ${usd(report.burnedFailedCostUsd)}`);
console.log(
  `API cost / net MRR:       ${report.apiCostShareOfNetMrr === null ? 'n/a' : `${(report.apiCostShareOfNetMrr * 100).toFixed(1)}%`}`,
);
console.log(`Gross margin proxy:       $${report.grossMarginProxyUsd.toFixed(2)}\n`);
console.table(report.tiers);
