/**
 * Finance report: MRR, 30-day revenue vs API spend, gross margin, cost per
 * video by tier and the fixed-cost cover, read from the Supabase project in
 * `.env.local`. READ-ONLY: it only runs `select`s (service role).
 * Definitions live in `src/features/metrics/finance.ts`; the fixed-cost ledger
 * is `docs/finance/vendors.json`.
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
  eq?: { column: string; value: string },
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = eq ? base.eq(eq.column, eq.value) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number>;
const [subs, jobs, topups] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>('render_jobs', 'status, model_tier, api_cost_usd, actual_credits, created_at'),
  selectAll<Row>('credit_transactions', 'delta, created_at', { column: 'reason', value: 'topup' }),
]);

const vendorsFile = JSON.parse(readFileSync(resolve('docs/finance/vendors.json'), 'utf8')) as {
  vendors: Parameters<typeof computeFinance>[0]['vendors'];
};

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
  topUps: topups.map((t) => ({
    credits: Number(t.delta),
    createdAt: new Date(String(t.created_at)),
  })),
  vendors: vendorsFile.vendors,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(`★ MRR (net of VAT + fees):   ${usd(report.mrrUsd)}   (ARR ${usd(report.arrUsd)})`);
console.log(
  `  Paying subscribers:         ${report.payingSubscribers}  ${JSON.stringify(report.subscribersByPlan)}`,
);
console.log(`  ARPU:                       ${usd(report.arpuUsd)}`);
console.log(`  Top-up revenue (30d):       ${usd(report.topUpRevenue30dUsd)}`);
console.log(
  `  API spend (30d):            ${usd(report.apiSpend30dUsd)}  (failed jobs: ${usd(report.failedSpend30dUsd)})`,
);
console.log(
  `  Gross margin:               ${report.grossMargin === null ? 'n/a' : `${(report.grossMargin * 100).toFixed(1)}%`}`,
);
console.log(
  `  Fixed costs / month:        ${usd(report.fixedCostsMonthlyUsd)}${report.unknownVendors.length ? `  (missing: ${report.unknownVendors.join(', ')})` : ''}`,
);
console.log(`  Cash contribution (30d):    ${usd(report.cashContribution30dUsd)}\n`);
console.table(report.tiers);
