/**
 * Finance report: MRR, net revenue vs API spend, cost per finished video and
 * break-even, read from the Supabase project in `.env.local`.
 * READ-ONLY: it only runs `select`s (service role, so it sees every user).
 * Definitions live in `src/features/metrics/finance.ts`.
 *
 * Fixed monthly costs (hosting, tool plans; USD) are not in the database: pass
 * `--fixed=<usd>` or set FINANCE_FIXED_COSTS_USD_MONTH. Default 0.
 *
 * Run: npx tsx scripts/finance-report.mts [--fixed=120]          (table)
 *      npx tsx scripts/finance-report.mts [--fixed=120] --json   (raw report, for the digest)
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
const now = new Date();
const since = new Date(now.getTime() - FINANCE_WINDOW_DAYS * 86_400_000).toISOString();

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(
  table: string,
  columns: string,
  where: { eq?: [string, string]; gteCreatedAt?: string } = {},
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (where.eq) q = q.eq(where.eq[0], where.eq[1]);
    if (where.gteCreatedAt) q = q.gte('created_at', where.gteCreatedAt);
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number>;
const [subs, topups, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'delta, created_at', {
    eq: ['reason', 'topup'],
    gteCreatedAt: since,
  }),
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, target_duration_sec, api_cost_usd, actual_credits, created_at',
    { gteCreatedAt: since },
  ),
]);

const fixedArg = process.argv.find((a) => a.startsWith('--fixed='))?.slice('--fixed='.length);
const fixed = Number(fixedArg ?? process.env.FINANCE_FIXED_COSTS_USD_MONTH ?? 0);
if (!Number.isFinite(fixed) || fixed < 0) throw new Error('fixed costs must be a number >= 0');

const report = computeFinance({
  now,
  fixedCostsUsdPerMonth: fixed,
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  topUps: topups.map((t) => ({
    credits: Number(t.delta ?? 0),
    createdAt: new Date(String(t.created_at ?? 0)),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? ''),
    targetDurationSec: Number(j.target_duration_sec ?? 0),
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
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
const x = (n: number | null) => (n === null ? 'n/a' : `${n.toFixed(2)}x`);

console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `★ MRR (net, USD):          ${usd(report.mrrNetUsd)}   (gross €${report.mrrGrossEur.toFixed(2)})`,
);
console.log(`  ARR (net):               ${usd(report.arrNetUsd)}`);
console.log(
  `  Paying subscribers:      ${report.payingSubscribers} ${JSON.stringify(report.subscribersByPlan)}`,
);
console.log(`  ARPU (net):              ${usd(report.arpuNetUsd)}`);
console.log(
  `  Top-ups (net, window):   ${usd(report.topUpNetUsd)}${report.unmatchedTopUps ? `  (+${report.unmatchedTopUps} unmatched)` : ''}`,
);
console.log(
  `  API spend (window):      ${usd(report.apiSpendUsd)}  (of which failed jobs ${usd(report.failedSpendUsd)})`,
);
console.log(`  Revenue multiple:        ${x(report.revenueMultiple)}  (gate target 3x)`);
console.log(`  Gross margin:            ${pct(report.grossMargin)}`);
console.log(`  API cost / 1k credits:   ${usd(report.apiCostPer1kCredits)}`);
console.log(`  Fixed costs / month:     ${usd(report.fixedCostsUsdPerMonth)}`);
console.log(`  Monthly profit:          ${usd(report.monthlyProfitUsd)}`);
console.log(`  Break-even subscribers:  ${report.breakEvenSubscribers ?? 'n/a'}\n`);
console.table(report.tiers);
