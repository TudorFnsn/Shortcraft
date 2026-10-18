/**
 * Finance report for the Finance CEO routine: MRR, net revenue, API spend,
 * cost per video and gross margin, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role). Definitions live in
 * `src/features/metrics/finance.ts`.
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
async function selectAll<T>(table: string, columns: string, eq?: [string, string]): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = eq ? base.eq(eq[0], eq[1]) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number>;
const [subs, jobs, topUps] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'user_id, status, model_tier, api_cost_usd, actual_credits, created_at',
  ),
  selectAll<Row>('credit_transactions', 'delta, created_at', ['reason', 'topup']),
]);

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id),
    planId: String(s.plan_id),
    status: String(s.status),
  })),
  jobs: jobs.map((j) => ({
    userId: String(j.user_id),
    status: String(j.status),
    modelTier: String(j.model_tier),
    createdAt: new Date(String(j.created_at)),
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
  })),
  topUps: topUps.map((t) => ({
    credits: Number(t.delta),
    createdAt: new Date(String(t.created_at)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `MRR: €${report.mrrGrossEur.toFixed(2)} gross · ${usd(report.mrrNetUsd)} net  (${report.payingSubscribers} paying)`,
);
console.log(`ARPU net:           ${usd(report.arpuNetUsd)}`);
console.log(
  `Top-ups net:        ${usd(report.topUpNetUsd)}  (unmatched: ${report.unmatchedTopUps})`,
);
console.log(
  `API cost:           ${usd(report.apiCostUsd)}  (failed jobs: ${usd(report.failedCostUsd)})`,
);
console.log(`Videos finished:    ${report.videosDone}`);
console.log(`Cost per video:     ${usd(report.costPerVideoUsd)}`);
console.log(`Cost per 1k credits:${usd(report.costPer1kCreditsUsd)}`);
console.log(
  `Gross margin:       ${report.grossMargin === null ? 'n/a' : `${(report.grossMargin * 100).toFixed(1)}%`}\n`,
);
console.table(report.subscribersByPlan);
console.table(report.byTier);
