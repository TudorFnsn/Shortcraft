/**
 * Finance report: MRR, 30-day cash revenue vs measured API cost, cost per video
 * by tier, credit utilisation, fixed-cost burn and break-even, read from the
 * Supabase project in `.env.local`. READ-ONLY (selects only, service role).
 * Definitions live in `src/features/finance/unit-economics.ts`; fixed costs in
 * `src/config/finance-costs.ts` (owner-maintained).
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

const { computeFinance } = await import('@/features/finance/unit-economics');
const { PAID_GRANT_REASONS } = await import('@/features/billing/entitlements');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll<T>(
  table: string,
  columns: string,
  where?: { column: string; in: readonly string[] },
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = where ? base.in(where.column, [...where.in]) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number | null>;
const [subs, jobs, grants] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, target_duration_sec, api_cost_usd, actual_credits, created_at',
  ),
  selectAll<Row>('credit_transactions', 'reason, delta, created_at', {
    column: 'reason',
    in: PAID_GRANT_REASONS,
  }),
]);

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? 'standard'),
    targetDurationSec: Number(j.target_duration_sec ?? 0),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    actualCredits: Number(j.actual_credits ?? 0),
    createdAt: new Date(String(j.created_at ?? 0)),
  })),
  paidGrants: grants.map((g) => ({
    reason: String(g.reason ?? ''),
    delta: Number(g.delta ?? 0),
    createdAt: new Date(String(g.created_at ?? 0)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — last ${report.windowDays}d, as of ${report.asOf}\n`);
console.log(
  `★ MRR: €${report.mrrEur} (net ${usd(report.mrrNetUsd)}) from ${report.payingSubscribers} subscribers`,
);
console.log(`  ARPU (net):               ${usd(report.arpuNetUsd)}`);
console.log(
  `  Cash revenue (net):       ${usd(report.cashRevenueNetUsd)}  (${report.unmatchedGrants} unpriced grants)`,
);
console.log(
  `  API cost (measured):      ${usd(report.apiCostUsd)}  — failed jobs: ${usd(report.failedCostUsd)} (${pct(report.failedCostShare)})`,
);
console.log(
  `  Fixed costs:              ${usd(report.fixedCostUsd)}  (${report.fixedCostUnverified} lines not from an invoice)`,
);
console.log(`  Profit:                   ${usd(report.profitUsd)}`);
console.log(
  `  Gross margin:             ${pct(report.grossMargin)}   revenue ÷ API cost: ${report.revenueMultiple ?? 'n/a'}x (target 3x)`,
);
console.log(`  Credit utilisation:       ${pct(report.creditUtilisation)}`);
console.log(`  Break-even subscribers:   ${report.breakEvenSubscribers ?? 'n/a'}\n`);
console.table(report.tiers);
