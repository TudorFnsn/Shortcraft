/**
 * Finance report: MRR, 30-day API spend, cost per finished video by tier and
 * gross margin, read from the Supabase project in `.env.local`. READ-ONLY.
 * Definitions and limits live in `src/features/metrics/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--fixed-usd 120]   (table)
 *      npx tsx scripts/finance-report.mts --json              (raw report)
 * `--fixed-usd` = fixed monthly costs (hosting, DB, vendor plans); default 0.
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

const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectAll('render_jobs', 'status, model_tier, api_cost_usd, created_at'),
]);

const fixedIdx = process.argv.indexOf('--fixed-usd');
const fixedMonthlyCostUsd = fixedIdx > -1 ? Number(process.argv[fixedIdx + 1]) || 0 : 0;

const report = computeFinance({
  now: new Date(),
  fixedMonthlyCostUsd,
  subscriptions: subs.map((s) => ({ planId: s.plan_id ?? '', status: s.status ?? '' })),
  jobs: jobs.map((j) => ({
    status: j.status ?? '',
    modelTier: j.model_tier ?? '',
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    createdAt: new Date(j.created_at ?? 0),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(`MRR (list price, EUR):        €${report.mrrEur.toFixed(2)}`);
console.log(`Net MRR (after VAT + fees):   ${usd(report.netMrrUsd)}`);
console.log(`API spend, last 30d:          ${usd(report.apiCostUsd30d)}`);
console.log(`  of which failed jobs:       ${usd(report.failedCostUsd30d)}`);
console.log(`Fixed monthly costs (input):  ${usd(report.fixedMonthlyCostUsd)}`);
console.log(
  `Gross margin:                 ${report.grossMargin === null ? 'n/a (no revenue)' : `${(report.grossMargin * 100).toFixed(1)}%`}`,
);
console.log(`Monthly profit:               ${usd(report.monthlyProfitUsd)}\n`);
console.table(report.mrrByPlan);
console.table(
  report.perTier.map((t) => ({
    tier: t.tier,
    videos: t.videos,
    costUsd: usd(t.costUsd),
    avgCostPerVideo: t.avgCostUsd === null ? 'n/a' : usd(t.avgCostUsd),
  })),
);
