/**
 * Finance report: MRR, revenue vs API spend, gross margin, real cost per video
 * by tier, wasted spend and break-even, from the Supabase project in `.env.local`.
 * READ-ONLY: only `select`s (service role). Math: `src/features/finance/unit-economics.ts`.
 * Fixed costs come from `src/config/fixed-costs.ts` (owner-maintained).
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

const { computeFinance } = await import('@/features/finance/unit-economics');
const { FIXED_COSTS } = await import('@/config/fixed-costs');
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
const [jobs, subs, topups] = await Promise.all([
  selectAll<Row>(
    'render_jobs',
    'user_id, status, model_tier, api_cost_usd, actual_credits, target_duration_sec, created_at',
  ),
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'delta, created_at', { column: 'reason', eq: 'topup' }),
]);

const report = computeFinance({
  now: new Date(),
  fixedCosts: FIXED_COSTS,
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
    targetDurationSec: Number(j.target_duration_sec ?? 0),
    createdAt: new Date(String(j.created_at ?? 0)),
  })),
  topups: topups.map((t) => ({
    credits: Number(t.delta ?? 0),
    createdAt: new Date(String(t.created_at ?? 0)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `★ MRR (net of VAT + Stripe fees): ${usd(report.mrrNetUsd)}  (gross €${report.mrrGrossEur})`,
);
console.log(`  ARR (net):                      ${usd(report.arrNetUsd)}`);
console.log(
  `  Paying subscribers:             ${report.payingSubscribers} ${JSON.stringify(report.payingByPlan)}`,
);
console.log(`  ARPU (net):                     ${usd(report.arpuNetUsd)}`);
console.log(`  Top-ups (net, 30d):             ${usd(report.topupNetUsd)}`);
console.log(`  Revenue (net, 30d):             ${usd(report.revenueNetUsd)}`);
console.log(`  API spend (30d):                ${usd(report.apiCostUsd)}`);
console.log(`    wasted on failed jobs:        ${usd(report.wastedApiCostUsd)}`);
console.log(`    spent by non-paying users:    ${usd(report.freeUserApiCostUsd)}`);
console.log(
  `  Gross margin:                   ${report.grossMargin === null ? 'n/a' : `${(report.grossMargin * 100).toFixed(1)}%`}`,
);
console.log(
  `  Known fixed costs:              ${usd(report.fixedKnownUsd)}  (unknown: ${report.fixedUnknown.join(', ') || 'none'})`,
);
console.log(`  Contribution after known fixed: ${usd(report.contributionUsd)}`);
console.log(`  Break-even subscribers:         ${report.breakEvenSubscribers ?? 'n/a'}\n`);
console.table(report.byTier);
