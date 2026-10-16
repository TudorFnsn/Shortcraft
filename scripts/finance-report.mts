/**
 * Finance report: what finished videos actually cost (render_jobs.api_cost_usd)
 * vs the credits spent on them, failed-job burn, and fixed-cost coverage.
 * READ-ONLY selects with the service role from `.env.local`.
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

const argDays = process.argv.indexOf('--days');
const days = argDays > -1 ? Number(process.argv[argDays + 1]) || 30 : 30;
const admin = createSupabaseAdminClient();
const PAGE = 1000;

type Row = {
  status: string;
  model_tier: string;
  target_duration_sec: number;
  actual_credits: number | string;
  api_cost_usd: number | string;
  created_at: string;
};
const rows: Row[] = [];
for (let from = 0; ; from += PAGE) {
  const { data, error } = await admin
    .from('render_jobs')
    .select('status, model_tier, target_duration_sec, actual_credits, api_cost_usd, created_at')
    .gte('created_at', new Date(Date.now() - days * 86_400_000).toISOString())
    .order('created_at')
    .range(from, from + PAGE - 1);
  if (error) throw new Error(`render_jobs: ${error.message}`);
  rows.push(...(data as Row[]));
  if (!data || data.length < PAGE) break;
}

const fixed = JSON.parse(readFileSync(resolve('docs/finance/fixed-costs.json'), 'utf8'));
const report = computeFinance(
  rows.map((r) => ({
    status: r.status,
    modelTier: r.model_tier,
    targetDurationSec: r.target_duration_sec,
    actualCredits: Number(r.actual_credits),
    apiCostUsd: Number(r.api_cost_usd),
    createdAt: r.created_at,
  })),
  fixed,
  new Date(),
  days,
);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.table(report.tiers);
  console.log(
    `Failed jobs: ${report.failedJobs} (API cost burnt: $${report.failedCostUsd}) | total API cost, last ${days}d: $${report.totalApiCostUsd}`,
  );
  console.log(
    `Known fixed costs: $${report.knownFixedMonthlyUsd}/mo | unknown: ${report.unknownFixedItems.join(', ') || 'none'}`,
  );
}
