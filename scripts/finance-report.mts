/**
 * Finance report: MRR, 30-day revenue vs what the pipeline actually cost
 * (measured `render_jobs.api_cost_usd`), per tier. READ-ONLY selects with the
 * service role from `.env.local`. Math lives in `features/finance/unit-economics.ts`.
 *
 * Fixed monthly costs (hosting, ElevenLabs plan, ...) are not in the database:
 * pass them as JSON, e.g. FIXED_COSTS_USD='{"vercel":20,"elevenlabs":22,"supabase":0}'.
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

type Row = Record<string, string | number | null>;
const [subs, jobs, topups] = await Promise.all([
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, target_duration_sec, api_cost_usd, actual_credits, created_at',
  ),
  selectAll<Row>('credit_transactions', 'delta, created_at', { column: 'reason', eq: 'topup' }),
]);

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    targetDurationSec: Number(j.target_duration_sec),
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
    createdAt: new Date(String(j.created_at)),
  })),
  topups: topups.map((t) => ({
    credits: Number(t.delta),
    createdAt: new Date(String(t.created_at)),
  })),
  fixedCostsUsd: JSON.parse(process.env.FIXED_COSTS_USD ?? '{}') as Record<string, number>,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(
  `MRR:                 €${report.mrrEur} (net $${report.mrrNetUsd}) from ${report.payingSubscribers} subscribers, ARPU €${report.arpuEur}`,
);
console.log(`Top-ups (30d, net):  $${report.topupNetUsd30d}`);
console.log(`Videos (30d):        ${report.videos30d} done, ${report.failed30d} failed`);
console.log(`API cost (30d):      $${report.apiCostUsd30d}`);
console.log(
  `Fixed costs (30d):   $${report.fixedCostsUsd}${process.env.FIXED_COSTS_USD ? '' : '  (FIXED_COSTS_USD not set)'}`,
);
console.log(
  `MRR coverage:        ${report.mrrCoverage === null ? 'n/a' : `${report.mrrCoverage}x`} (net MRR / spend)`,
);
console.log(`Contribution (30d):  $${report.contributionUsd30d}\n`);
console.table(report.byTier);
for (const f of report.flags) console.log(`⚠ ${f}`);
