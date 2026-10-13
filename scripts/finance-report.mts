/**
 * Finance report: MRR, net MRR, 30-day API cost per tier, wasted spend on
 * failed jobs, gross margin and coverage multiple, read from the Supabase
 * project in `.env.local`. READ-ONLY: only `select`s (service role).
 * Definitions live in `src/features/metrics/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw report, for the digest)
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

const { computeFinance, COST_WINDOW_DAYS } = await import('@/features/metrics/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const now = new Date();
const since = new Date(now.getTime() - COST_WINDOW_DAYS * 86_400_000).toISOString();

type Row = Record<string, string | number | null>;

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll(table: string, columns: string, sinceCol?: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = sinceCol ? base.gte(sinceCol, since) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectAll(
    'render_jobs',
    'status, model_tier, target_duration_sec, api_cost_usd, created_at',
    'created_at',
  ),
]);

const report = computeFinance({
  now,
  subscriptions: subs.map((s) => ({
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? ''),
    targetDurationSec: Number(j.target_duration_sec ?? 0),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    createdAt: new Date(String(j.created_at ?? 0)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
const w = report.window;
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(
  `MRR: €${report.mrrEur.toFixed(2)} (ARR €${report.arrEur.toFixed(2)}), net ${usd(report.netMrrUsd)}`,
);
console.log(
  `Paying subscribers: ${report.payingSubscribers} ${JSON.stringify(report.subscribersByPlan)}`,
);
console.log(
  `Last ${w.days}d: ${w.videosDone} videos, ${w.jobsFailed} failed, API cost ${usd(w.totalCostUsd)}`,
);
console.log(
  `  wasted on failed jobs: ${usd(w.wastedCostUsd)}; per paying subscriber: ${usd(w.costPerPayingSubscriberUsd)}`,
);
console.log(`  cost metering coverage: ${pct(w.costCoverage)} of finished videos`);
console.log(
  `Gross margin: ${pct(report.grossMargin)}; net MRR ÷ API cost: ${report.coverageMultiple ?? 'n/a'}x\n`,
);
console.table(w.byTier);
