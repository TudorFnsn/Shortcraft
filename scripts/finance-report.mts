/**
 * Finance report: MRR, net revenue, measured API spend per video, gross margin
 * and burn, read from the Supabase project in `.env.local`. READ-ONLY (selects
 * only, service role). Definitions live in `src/features/metrics/finance.ts`;
 * fixed costs in `src/config/fixed-costs.ts`.
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

const { computeFinance } = await import('@/features/metrics/finance');
const { FIXED_COSTS } = await import('@/config/fixed-costs');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const since = new Date(Date.now() - 31 * 86_400_000).toISOString();

type Row = Record<string, string | number>;

async function selectAll(
  table: string,
  columns: string,
  where: { since?: string; reason?: string } = {},
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (where.since) q = q.gte('created_at', where.since);
    if (where.reason) q = q.eq('reason', where.reason);
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [subs, jobs, topUps] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectAll('render_jobs', 'status, model_tier, created_at, api_cost_usd, actual_credits', {
    since,
  }),
  selectAll('credit_transactions', 'delta, created_at', { since, reason: 'topup' }),
]);

const report = computeFinance({
  now: new Date(),
  fixedMonthlyUsd: FIXED_COSTS.reduce((n, c) => n + c.monthlyUsd, 0),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    createdAt: new Date(String(j.created_at)),
    apiCostUsd: Number(j.api_cost_usd),
    chargedCredits: Number(j.actual_credits),
  })),
  topUps: topUps.map((t) => ({
    credits: Number(t.delta),
    createdAt: new Date(String(t.created_at)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const { byTier, ...summary } = report;
console.log('Shortcraft finance (30-day window)\n');
console.table(summary);
console.table(byTier);
