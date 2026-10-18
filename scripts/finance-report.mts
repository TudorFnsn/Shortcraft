/**
 * Finance report: MRR, net revenue, API spend per video, fixed costs and profit
 * for the last 30 days, read from the Supabase project in `.env.local` plus the
 * owner-maintained `finance/costs.json`. READ-ONLY: it only runs `select`s.
 * Definitions live in `src/features/finance/unit-economics.ts`.
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
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, target_duration_sec, api_cost_usd, actual_credits, created_at',
  ),
  selectAll<Row>('credit_transactions', 'delta, created_at', { column: 'reason', eq: 'topup' }),
]);

const costs = JSON.parse(readFileSync(resolve('finance/costs.json'), 'utf8')) as {
  adSpendUsd30d: number | null;
  fixedCosts: { id: string; label: string; monthlyUsd: number | null }[];
};

const report = computeFinance({
  now: new Date(),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id),
    planId: String(s.plan_id),
    status: String(s.status),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    targetDurationSec: Number(j.target_duration_sec),
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
    createdAt: new Date(String(j.created_at)),
  })),
  topUps: topUps.map((t) => ({
    credits: Number(t.delta),
    createdAt: new Date(String(t.created_at)),
  })),
  fixedCosts: costs.fixedCosts,
  adSpendUsd30d: costs.adSpendUsd30d,
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'unknown' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `★ MRR: €${report.mrrEur} (ARR €${report.arrEur}) from ${report.payingSubscribers} subscribers`,
);
console.log(`  Net MRR after VAT + Stripe:   ${usd(report.netMrrUsd)}`);
console.log(`  Top-ups (net, 30d):           ${usd(report.topUpNetUsd30d)}`);
console.log(`  Net revenue (30d):            ${usd(report.netRevenueUsd30d)}`);
console.log(`  Videos done / failed (30d):   ${report.videosDone30d} / ${report.videosFailed30d}`);
console.log(`  API spend (30d, all jobs):    ${usd(report.apiCostUsd30d)}`);
console.log(
  `  API cost per finished video:  ${report.avgApiCostPerVideoUsd === null ? 'n/a' : `$${report.avgApiCostPerVideoUsd}`}`,
);
console.log(
  `  API share of net revenue:     ${report.apiCostShare === null ? 'n/a' : `${(report.apiCostShare * 100).toFixed(1)}%`}`,
);
console.log(`  Fixed costs (known):          ${usd(report.fixedCostsUsd30d)}`);
console.log(`  Ad spend (30d):               ${usd(report.adSpendUsd30d)}`);
console.log(
  `  Profit (30d):                 ${usd(report.profitUsd30d)} (known costs only: ${usd(report.profitKnownCostsUsd30d)})`,
);
console.log(`  Revenue ÷ (API + fixed):      ${report.revenueToCostMultiple ?? 'n/a'}x`);
if (report.unknownFixedCosts.length) {
  console.log(
    `  ⚠ Unknown fixed costs: ${report.unknownFixedCosts.join(', ')} — fill finance/costs.json`,
  );
}
console.log('');
console.table(report.byPlan);
console.table(report.byTier);
