/**
 * Finance report: MRR, API spend per video and tier, realized gross margin.
 * READ-ONLY (`select`s with the service role from `.env.local`). Definitions
 * live in `src/features/metrics/finance.ts`; vendor invoices are not in the
 * database, so the CFO routine adds those from Stripe/fal/ElevenLabs/Anthropic.
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
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;
const days = Number(process.argv.find((a) => a.startsWith('--days='))?.split('=')[1] ?? 30);
const since = new Date(Date.now() - days * 86_400_000).toISOString();

async function selectAll<T>(table: string, columns: string, gte?: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = gte ? base.gte('created_at', gte) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number>;
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, target_duration_sec, actual_credits, api_cost_usd, created_at',
    since,
  ),
]);

const report = computeFinance({
  now: new Date(),
  windowDays: days,
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    targetDurationSec: Number(j.target_duration_sec),
    actualCredits: Number(j.actual_credits),
    apiCostUsd: Number(j.api_cost_usd),
    createdAt: new Date(String(j.created_at)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const { byTier, grossMarginMonthly: gm, ...rest } = report;
console.log(`Shortcraft finance — as of ${report.asOf} (jobs: last ${days}d)\n`);
console.table(rest);
console.table(byTier);
console.log(
  `Monthly gross margin (API only): revenue $${gm.revenueUsd} − API $${gm.apiCostUsd} = ${gm.marginPct ?? 'n/a'}%`,
);
