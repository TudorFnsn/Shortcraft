/**
 * Finance report: MRR, ARPU, 30-day API cost by tier, free-user burn and cost to
 * revenue, read from the Supabase project in `.env.local`. READ-ONLY (`select`s,
 * service role). Definitions live in `src/features/finance/unit-economics.ts`.
 * Hosting + SaaS bills are not in the database: add them from the vendors.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw report)
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

const { computeFinance } = await import('@/features/finance/unit-economics');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(table: string, columns: string, reason?: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = reason ? base.eq('reason', reason) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number>;
const [jobs, subs, topUps] = await Promise.all([
  selectAll<Row>('render_jobs', 'user_id, status, model_tier, api_cost_usd, created_at'),
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'delta, created_at', 'topup'),
]);

const report = computeFinance({
  now: new Date(),
  jobs: jobs.map((j) => ({
    userId: String(j.user_id ?? ''),
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? 'standard'),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    createdAt: new Date(String(j.created_at ?? 0)),
  })),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  topUps: topUps.map((t) => ({
    credits: Number(t.delta ?? 0),
    createdAt: new Date(String(t.created_at ?? 0)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(`MRR (gross, EUR incl. VAT): €${report.mrrGrossEur.toFixed(2)}`);
console.log(`MRR (net USD):              ${usd(report.mrrNetUsd)}   ARR ${usd(report.arrNetUsd)}`);
console.log(`Paying subscribers:         ${report.payingSubscribers}`, report.subscribersByPlan);
console.log(
  `ARPU (net USD):             ${report.arpuNetUsd === null ? 'n/a' : usd(report.arpuNetUsd)}`,
);
console.log(`Top-ups 30d (net USD):      ${usd(report.topUpNetUsd30d)}`);
console.log(`API cost 30d:               ${usd(report.apiCostUsd30d)}`);
console.log(
  `  of which free users:      ${usd(report.freeUserApiCostUsd30d)} (${pct(report.freeUserShareOfCost)})`,
);
console.log(
  `Cost / revenue:             ${pct(report.costToRevenue)}  healthy=${report.healthy}\n`,
);
console.table(report.apiCostByTier);
