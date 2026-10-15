/**
 * Finance report: MRR, net cash, API spend, cost per video and gross margin,
 * read from the Supabase project in `.env.local`. READ-ONLY (`select`s only).
 * Math lives in `src/features/metrics/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--days 30] [--json]
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
const [subs, topups, grants, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'delta, created_at', 'topup'),
  selectAll<Row>('credit_transactions', 'delta, created_at', 'monthly_grant'),
  selectAll<Row>('render_jobs', 'status, created_at, api_cost_usd, actual_credits, model_tier'),
]);

const daysArg = process.argv.indexOf('--days');
const windowDays = daysArg > 0 ? Number(process.argv[daysArg + 1]) || 30 : 30;
const date = (v: string | number | undefined) => new Date(v ?? 0);

const report = computeFinance({
  now: new Date(),
  windowDays,
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  topups: topups.map((t) => ({ credits: Number(t.delta), createdAt: date(t.created_at) })),
  monthlyGrants: grants.map((g) => ({ credits: Number(g.delta), createdAt: date(g.created_at) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    createdAt: date(j.created_at),
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
    modelTier: String(j.model_tier),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.table(report);
