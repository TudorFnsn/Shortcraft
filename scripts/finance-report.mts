/**
 * Finance report: MRR (net of VAT + Stripe fees), 30-day API spend, cost per video
 * and per 1k credits, fixed costs, and the MRR ÷ cost ratio. Read from the Supabase
 * project in `.env.local`. READ-ONLY (selects only). Math: `features/finance/pnl.ts`.
 * Stripe is the source of truth for cash; this is the in-app view, so cross-check it
 * with the Stripe connector (balance, MRR, refunds, disputes) when that's authorized.
 *
 * Run: npx tsx scripts/finance-report.mts           (table)
 *      npx tsx scripts/finance-report.mts --json    (raw report, for the digest)
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

const { computeFinance } = await import('@/features/finance/pnl');
const { FIXED_COSTS } = await import('@/config/fixed-costs');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

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
const [subs, topups, renewals, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'delta, created_at', 'topup'),
  selectAll<Row>('credit_transactions', 'delta, created_at', 'monthly_grant'),
  selectAll<Row>('render_jobs', 'status, created_at, api_cost_usd, actual_credits'),
]);

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  topUps: topups.map((t) => ({
    credits: Number(t.delta),
    createdAt: new Date(String(t.created_at)),
  })),
  renewals: renewals.map((r) => ({ createdAt: new Date(String(r.created_at)) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    createdAt: new Date(String(j.created_at)),
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
  })),
  fixedCosts: FIXED_COSTS,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(
  `★ MRR (net of VAT+fees): ${usd(report.mrrNetUsd)}  (sticker €${report.mrrGrossEur}, ARR ${usd(report.arrNetUsd)})`,
);
console.log(`  Paying subscribers:     ${report.payingSubscribers}`);
console.log(`  Top-ups, last 30d (net): ${usd(report.last30d.topUpNetUsd)}`);
console.log(
  `  API spend, last 30d:    ${usd(report.last30d.apiCostUsd)}  (${report.last30d.finishedVideos} videos, ${report.last30d.failedJobs} failed)`,
);
console.log(
  `  API cost / video:       ${usd(report.last30d.apiCostPerVideoUsd)}   per 1k credits: ${usd(report.last30d.apiCostPer1kCreditsUsd)}`,
);
console.log(
  `  Fixed costs / month:    ${usd(report.fixedMonthlyUsd)}${report.fixedCostGaps.length ? `  (UNKNOWN: ${report.fixedCostGaps.join('; ')})` : ''}`,
);
console.log(`  Gross margin:           ${report.grossMarginPct ?? 'n/a'}%`);
console.log(
  `★ MRR ÷ cost ratio:      ${report.mrrCostRatio ?? 'n/a'}   (net cash/month ${usd(report.monthlyNetCashUsd)})\n`,
);
console.table(report.byPlan);
