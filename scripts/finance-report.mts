/**
 * Finance report: MRR, net revenue, API spend per tier and per 1k credits,
 * gross margin, fixed costs and profit, from the Supabase project in
 * `.env.local`. READ-ONLY (`select`s with the service role).
 * Definitions live in `src/features/metrics/finance.ts`; fixed costs in
 * `src/config/costs.ts`.
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

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(
  table: string,
  columns: string,
  where?: { column: string; eq: string },
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = where ? base.eq(where.column, where.eq) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number>;
const since = new Date(Date.now() - FINANCE_WINDOW_DAYS * 86_400_000).toISOString();
const [subs, jobs, topUps] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>('render_jobs', 'status, model_tier, api_cost_usd, actual_credits, created_at'),
  selectAll<Row>('credit_transactions', 'delta, created_at', { column: 'reason', eq: 'topup' }),
]);

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
    createdAt: new Date(String(j.created_at)),
  })),
  topUps: topUps
    .filter((t) => String(t.created_at) >= since)
    .map((t) => ({ credits: Number(t.delta), createdAt: new Date(String(t.created_at)) })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `★ MRR:                     €${report.mrrEur.toFixed(2)} (net ${usd(report.netMrrUsd)})`,
);
console.log(`  Paying subscribers:      ${report.payingSubscribers}`);
console.log(
  `  ARPU:                    ${report.arpuEur === null ? 'n/a' : `€${report.arpuEur.toFixed(2)}`}`,
);
console.log(`  Top-up revenue (net):    ${usd(report.topUpRevenueUsd)}`);
console.log(
  `  API spend:               ${usd(report.apiCostUsd)} (wasted on failed jobs: ${usd(report.failedJobCostUsd)}, ${report.failedJobs} jobs)`,
);
console.log(`  Gross margin:            ${pct(report.grossMargin)}`);
console.log(
  `  Fixed costs:             ${usd(report.fixedCostUsd)} (unconfirmed: ${report.unconfirmedFixedCosts.join(', ') || 'none'})`,
);
console.log(`  Profit (month):          ${usd(report.profitUsd)}`);
console.log(
  `  Break-even subscribers:  ${report.breakEvenSubscribers ?? 'n/a (no margin per subscriber)'}\n`,
);
console.table(report.byPlan);
console.table(report.byTier);
