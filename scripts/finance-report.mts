/**
 * Finance report: MRR, API cost per video by tier, failed-job spend and the
 * MRR : COGS ratio, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role). Definitions live in
 * `src/features/metrics/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw report, for the digest)
 *      npx tsx scripts/finance-report.mts --days=7  (cost window, default 30)
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
const days = Number(process.argv.find((a) => a.startsWith('--days='))?.slice(7) ?? 30);

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
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('render_jobs', 'status, model_tier, api_cost_usd, actual_credits, created_at'),
]);

const report = computeFinance({
  now: new Date(),
  windowDays: days,
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? ''),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
    createdAt: new Date(String(j.created_at ?? 0)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — as of ${report.asOf} (cost window ${report.windowDays}d)\n`);
console.log(
  `MRR (net of VAT):          ${usd(report.mrrUsd)}  (${report.payingSubscribers} subscribers)`,
);
console.log(`MRR after Stripe fees:     ${usd(report.mrrNetOfFeesUsd)}`);
console.log(`ARPU:                      ${usd(report.arpuUsd)}`);
console.log(
  `API cost (window):         ${usd(report.cogsUsd)}  (failed jobs: ${usd(report.failedCogsUsd)})`,
);
console.log(`API cost (per month):      ${usd(report.monthlyCogsUsd)}`);
console.log(
  `COGS share of MRR:         ${report.cogsShareOfMrr === null ? 'n/a' : `${(report.cogsShareOfMrr * 100).toFixed(1)}%`}`,
);
console.log(
  `MRR : COGS ratio:          ${report.mrrToCogs === null ? 'n/a' : `${report.mrrToCogs}x`}\n`,
);
console.log('Plan mix:', report.planMix);
console.table(report.byTier);
