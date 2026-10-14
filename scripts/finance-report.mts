/**
 * Finance report: MRR, realized API cost, contribution and profit over the last
 * 30 days, read from the Supabase project in `.env.local`. READ-ONLY (selects
 * only). Math lives in `src/features/metrics/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--fixed=<usd per month>] [--json]
 * Fixed monthly costs (Vercel, Supabase, ElevenLabs plan, Resend, Sentry...)
 * come from --fixed or FIXED_COSTS_USD_MONTHLY; without either they count as 0
 * and the report says so.
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

const { computeFinance } = await import('@/features/metrics/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

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

type Row = Record<string, string | number | null>;
const [subs, ledger, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'delta, created_at', ['reason', 'topup']),
  selectAll<Row>('render_jobs', 'status, created_at, charged_credits, api_cost_usd'),
]);

const fixedArg = process.argv.find((a) => a.startsWith('--fixed='))?.slice(8);
const fixed = Number(fixedArg ?? process.env.FIXED_COSTS_USD_MONTHLY ?? 0);
const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  topups: ledger.map((t) => ({
    credits: Number(t.delta),
    createdAt: new Date(String(t.created_at)),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    createdAt: new Date(String(j.created_at)),
    chargedCredits: Number(j.charged_credits ?? 0),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
  })),
  fixedCostsUsdMonthly: Number.isFinite(fixed) ? fixed : 0,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
const x = (n: number | null) => (n === null ? 'n/a' : `${n.toFixed(2)}x`);
console.log(`Shortcraft finance — last ${report.windowDays} days, as of ${report.asOf}\n`);
console.log(`Subscribers:            ${JSON.stringify(report.subscribers)}`);
console.log(`MRR (gross EUR):        €${report.mrrGrossEur.toFixed(2)}`);
console.log(
  `Net revenue:            ${usd(report.revenueNetUsd)} (subs ${usd(report.mrrNetUsd)} + top-ups ${usd(report.topupNetUsd)})`,
);
console.log(
  `API cost:               ${usd(report.apiCostUsd)} (wasted on failed jobs: ${usd(report.failedJobApiCostUsd)})`,
);
console.log(
  `Fixed costs:            ${usd(report.fixedCostsUsd)}${fixed ? '' : '  <- not provided, counted as 0'}`,
);
console.log(`Contribution / profit:  ${usd(report.contributionUsd)} / ${usd(report.profitUsd)}`);
console.log(
  `Revenue / API cost:     ${x(report.revenueToApiCost)} (target >= 3x: ${report.meetsTarget ? 'ok' : 'BELOW'})`,
);
console.log(`Revenue / total cost:   ${x(report.revenueToTotalCost)}`);
console.log(
  `API cost per video:     ${usd(report.apiCostPerFinishedVideoUsd)} over ${report.finishedVideos} finished`,
);
console.log(`Fixed cost / subscriber: ${usd(report.fixedCostPerSubscriberUsd)}`);
