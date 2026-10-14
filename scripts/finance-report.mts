/**
 * Finance report: MRR, MRR ratio (MRR ÷ monthly cost), gross margin, API cost
 * per finished video and per 1,000 credits, by tier. READ-ONLY `select`s with
 * the service role from `.env.local`. Math: `src/features/finance/finance-report.ts`.
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

const { computeFinance } = await import('@/features/finance/finance-report');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

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
const [subs, topups, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'delta, created_at', { column: 'reason', eq: 'topup' }),
  selectAll<Row>('render_jobs', 'status, model_tier, actual_credits, api_cost_usd, created_at'),
]);

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  topUps: topups.map((t) => ({
    credits: Number(t.delta),
    createdAt: new Date(String(t.created_at)),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    actualCredits: Number(j.actual_credits),
    apiCostUsd: Number(j.api_cost_usd),
    createdAt: new Date(String(j.created_at)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
const x = (n: number | null) => (n === null ? 'n/a' : `${n.toFixed(2)}x`);
console.log(`Shortcraft finance — as of ${report.asOf} (API figures are the last 30 days)\n`);
console.log(
  `MRR (net USD):        ${usd(report.mrrNetUsd)}  (${report.mrrGrossEur.toFixed(2)} EUR gross)`,
);
console.log(`ARR run-rate:         ${usd(report.arrNetUsd)}`);
console.log(`Paying subscribers:   ${report.payingSubscribers}  ${JSON.stringify(report.planMix)}`);
console.log(`ARPU (net):           ${report.arpuNetUsd === null ? 'n/a' : usd(report.arpuNetUsd)}`);
console.log(`Top-ups (30d, net):   ${usd(report.topUpNetUsd30d)}`);
console.log(
  `API cost (30d):       ${usd(report.apiCostUsd30d)}  (failed jobs: ${usd(report.failedJobCostUsd30d)})`,
);
console.log(
  `Fixed costs known:    ${usd(report.fixedCostsKnownUsd)}  unknown: ${report.fixedCostsUnknown.join(', ') || 'none'}`,
);
console.log(
  `MRR ratio:            ${x(report.mrrRatio)}  (MRR ÷ total cost; >= 1 = subscriptions cover the app)`,
);
console.log(`Cash ratio:           ${x(report.cashRatio)}  (adds top-ups)`);
console.log(`Gross margin:         ${pct(report.grossMargin)}`);
console.log(`Monthly profit:       ${usd(report.monthlyProfitUsd)}\n`);
console.table(
  report.tiers.map((t) => ({
    tier: t.tier,
    jobs: t.jobs,
    done: t.doneJobs,
    credits: t.creditsCharged,
    apiCost: usd(t.apiCostUsd),
    costPerVideo: t.costPerVideoUsd === null ? 'n/a' : usd(t.costPerVideoUsd),
    costPer1kCredits: t.costPer1kCredits === null ? 'n/a' : usd(t.costPer1kCredits),
  })),
);
