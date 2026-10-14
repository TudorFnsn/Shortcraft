/**
 * Finance report: MRR, 30-day API spend and gross margin, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role, so it sees every user).
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

const { computeFinance } = await import('@/features/metrics/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(
  table: string,
  columns: string,
  where?: { column: string; in: readonly string[] },
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = where ? base.in(where.column, [...where.in]) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string>;
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>('render_jobs', 'status, api_cost_usd, created_at'),
]);

const report = computeFinance({
  now: new Date(),
  subs: subs.map((s) => ({ planId: s.plan_id ?? '', status: s.status ?? '' })),
  jobs: jobs.map((j) => ({
    status: j.status ?? '',
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
console.log(
  `MRR (gross, VAT incl.):  €${report.mrrEur.toFixed(2)}  (${report.liveSubscribers} live subs)`,
);
console.log(`Net MRR (after VAT+fees): ${usd(report.netMrrUsd)}`);
console.log(
  `API spend, 30d:           ${usd(report.apiSpend30dUsd)} (waste on failed: ${usd(report.wastedOnFailed30dUsd)})`,
);
console.log(
  `Cost per finished video:  ${report.costPerDoneVideoUsd === null ? 'n/a' : usd(report.costPerDoneVideoUsd)} over ${report.doneVideos30d} videos`,
);
console.log(
  `Gross margin (run-rate):  ${report.grossMargin === null ? 'n/a' : `${(report.grossMargin * 100).toFixed(0)}%`}`,
);
