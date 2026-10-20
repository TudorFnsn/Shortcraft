/**
 * Finance report: MRR, 30-day API spend by model tier, cost per finished
 * video, failed-job waste and free-tier burn, read from the Supabase project in
 * `.env.local`. READ-ONLY: it only runs `select`s (service role).
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

const { computeFinance, FINANCE_WINDOW_DAYS } = await import('@/features/metrics/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const since = new Date(Date.now() - FINANCE_WINDOW_DAYS * 86_400_000).toISOString();

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(table: string, columns: string, sinceIso?: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = sinceIso ? base.gte('created_at', sinceIso) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number | null>;
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'user_id, status, model_tier, api_cost_usd, actual_credits, created_at',
    since,
  ),
]);

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  jobs: jobs.map((j) => ({
    userId: String(j.user_id ?? ''),
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? 'standard'),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
    createdAt: new Date(String(j.created_at ?? 0)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays}d)\n`);
console.log(
  `★ MRR (net, after VAT + Stripe): ${usd(report.mrrNetUsd)}  (gross €${report.mrrGrossEur})`,
);
console.log(`  ARR (net):                     ${usd(report.arrNetUsd)}`);
console.log(
  `  Paying subscribers:            ${report.payingSubscribers}`,
  report.subscribersByPlan,
);
console.log(`  API spend:                     ${usd(report.apiSpendUsd)}`);
console.log(`  API cost / MRR:                ${pct(report.costToMrr)}`);
console.log(`  Gross margin (MRR - API):      ${pct(report.grossMarginRate)}`);
console.log(`  Wasted on failed jobs:         ${usd(report.failedSpendUsd)}`);
console.log(`  Burned by non-paying users:    ${usd(report.nonPayingSpendUsd)}\n`);
console.table(report.byTier);
