/**
 * Finance report: MRR, realized API cost, cost per finished video and margin,
 * read from the Supabase project in `.env.local`. READ-ONLY (`select`s only).
 * Definitions live in `src/features/metrics/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts                 (table)
 *      npx tsx scripts/finance-report.mts --json          (raw report, for the digest)
 *      FIXED_COSTS_USD=120 npx tsx scripts/finance-report.mts   (add monthly fixed costs)
 *
 * Fixed costs (hosting, Supabase, ElevenLabs plan, domains…) are not in the
 * database; pass the monthly total in USD. See FinancePlan.md §4.
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

const { computeFinance, FINANCE_WINDOW_DAYS } = await import('@/features/metrics/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll<T>(
  table: string,
  columns: string,
  where?: { column: string; eq: string },
  since?: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (where) q = q.eq(where.column, where.eq);
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number>;
const now = new Date();
const since = new Date(now.getTime() - FINANCE_WINDOW_DAYS * 86_400_000).toISOString();
const [subs, jobs, topUps] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status'),
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, api_cost_usd, charged_credits, created_at',
    undefined,
    since,
  ),
  selectAll<Row>(
    'credit_transactions',
    'delta, created_at',
    { column: 'reason', eq: 'topup' },
    since,
  ),
]);

const report = computeFinance({
  now,
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? ''),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    chargedCredits: Number(j.charged_credits ?? 0),
    createdAt: new Date(String(j.created_at)),
  })),
  topUps: topUps.map((t) => ({
    credits: Number(t.delta ?? 0),
    createdAt: new Date(String(t.created_at)),
  })),
  fixedCostsUsdPerMonth: Number(process.env.FIXED_COSTS_USD ?? 0),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const pct = (r: number | null) => (r === null ? 'n/a' : `${(r * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `MRR:                      €${report.mrrEur}  (net €${report.netMrrEur}, ARPU ${report.arpuEur ?? 'n/a'})`,
);
console.log(
  `Paying subscribers:       ${report.payingSubscribers}  ${JSON.stringify(report.byPlan)}`,
);
console.log(`Top-up revenue (30d):     €${report.topUpRevenueEur}`);
console.log(`Net revenue (USD/mo):     $${report.netRevenueUsd}`);
console.log(
  `API cost (30d):           $${report.apiCostUsd}  (failed-job burn $${report.failedCostUsd})`,
);
console.log(`API cost ÷ net revenue:   ${pct(report.apiCostRatio)}  (target ≤ 33%)`);
console.log(`Fixed costs (USD/mo):     $${report.fixedCostsUsd}`);
console.log(
  `Gross profit (USD/mo):    $${report.grossProfitUsd}  (revenue multiple ${report.revenueMultiple ?? 'n/a'}x)`,
);
console.log(`Cost per 1k credits:      $${report.costUsdPer1kCredits ?? 'n/a'}`);
console.log(`Videos finished / failed: ${report.jobsFinished} / ${report.jobsFailed}\n`);
console.table(report.tiers);
