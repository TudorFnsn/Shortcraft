/**
 * Finance report: net MRR, plan mix, API cost per finished video by tier, wasted
 * spend on failed jobs and cash margin (last 30 days), read from the Supabase
 * project in `.env.local`. READ-ONLY: it only runs `select`s (service role).
 * Math lives in `src/features/metrics/finance.ts`.
 *
 * Fixed monthly costs (hosting, ElevenLabs plan, domain…) aren't in the database:
 * pass them with FIXED_MONTHLY_USD=123 or --fixed=123 (see FinancePlan.md §4).
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
const { TOPUP_PACKS } = await import('@/config/plans');
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
const [subs, jobs, topUps] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('render_jobs', 'status, model_tier, api_cost_usd, created_at'),
  selectAll<Row>('credit_transactions', 'delta, created_at', { column: 'reason', eq: 'topup' }),
]);

const fixedArg = process.argv.find((a) => a.startsWith('--fixed='))?.slice(8);
const fixedMonthlyUsd = Number(fixedArg ?? process.env.FIXED_MONTHLY_USD ?? 0) || 0;
const date = (s: string | number | undefined) => new Date(s ?? 0);

const report = computeFinance({
  now: new Date(),
  fixedMonthlyUsd,
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? 'standard'),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    createdAt: date(j.created_at),
  })),
  topUps: topUps.map((t) => ({
    // The ledger stores credits, not euros: price the pack that granted them.
    amountCents: TOPUP_PACKS.find((p) => p.credits === Number(t.delta))?.priceCents ?? 0,
    createdAt: date(t.created_at),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
const x = (n: number | null) => (n === null ? 'n/a' : `${n.toFixed(2)}x`);
console.log(`Shortcraft finance — as of ${report.asOf} (last 30 days)\n`);
console.log(
  `★ Net MRR:                    ${usd(report.mrrNetUsd)}  (gross €${report.mrrGrossEur})`,
);
console.log(
  `  Paying subscribers:         ${report.payingSubscribers}  ${JSON.stringify(report.planMix)}`,
);
console.log(`  Net ARPU:                   ${usd(report.arpuNetUsd)}`);
console.log(`  Top-ups (net):              ${usd(report.topUpNetUsd)}`);
console.log(
  `  API spend:                  ${usd(report.apiCostUsd30d)}  (failed jobs: ${usd(report.failedCostUsd30d)})`,
);
console.log(
  `  Fixed costs:                ${usd(report.fixedMonthlyUsd)}${fixedMonthlyUsd ? '' : '  (not provided)'}`,
);
console.log(`  Cash margin:                ${usd(report.cashMarginUsd)}`);
console.log(`  Revenue ÷ API cost:         ${x(report.revenueToApiCost)}  (gate floor 3.00x)`);
console.log(`  Revenue ÷ all costs:        ${x(report.revenueToAllCosts)}\n`);
console.table(report.byTier);
