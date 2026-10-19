/**
 * Finance report: MRR, real API cost per video by tier, wasted spend (failed
 * jobs) and gross margin vs the margin gate, read from the Supabase project in
 * `.env.local`. READ-ONLY (`select`s with the service role).
 * Definitions live in `src/features/metrics/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--days=30] [--json]
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
const { PAID_GRANT_REASONS } = await import('@/features/billing/entitlements');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const days = Number(process.argv.find((a) => a.startsWith('--days='))?.slice(7) ?? 30);

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

type Row = Record<string, string | number>;
const [jobs, subs, grants] = await Promise.all([
  selectAll<Row>('render_jobs', 'status, model_tier, created_at, api_cost_usd, charged_credits'),
  selectAll<Row>('subscriptions', 'plan_id, status'),
  selectAll<Row>('credit_transactions', 'reason, delta, created_at', {
    column: 'reason',
    in: PAID_GRANT_REASONS,
  }),
]);

const report = computeFinance({
  now: new Date(),
  windowDays: days,
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    createdAt: new Date(String(j.created_at)),
    apiCostUsd: Number(j.api_cost_usd),
    chargedCredits: Number(j.charged_credits),
  })),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  grants: grants.map((g) => ({
    reason: String(g.reason),
    delta: Number(g.delta),
    createdAt: new Date(String(g.created_at)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — last ${report.windowDays}d, as of ${report.asOf}\n`);
console.log(
  `★ MRR (net, est.):        ${usd(report.mrrUsd)}  (${report.payingSubscribers} subscribers)`,
);
console.log(`  By plan:                ${JSON.stringify(report.subscribersByPlan)}`);
console.log(`  API cost, finished:     ${usd(report.apiCostDoneUsd)}`);
console.log(
  `  API cost, failed jobs:  ${usd(report.apiCostFailedUsd)}  (wasted share ${report.wastedSpendShare ?? 'n/a'})`,
);
console.log(`  Credits burned worth:   ${usd(report.burnedRevenueUsd)}`);
console.log(
  `  Gross margin multiple:  ${report.grossMarginMultiple ?? 'n/a'}x  (gate target 3x)\n`,
);
console.table(report.byTier);
