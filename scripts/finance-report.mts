/**
 * Finance report: MRR, ARPU, metered API cost per video and cash margin, read
 * from the Supabase project in `.env.local`. READ-ONLY (`select`s, service role).
 * Definitions live in `src/features/metrics/finance.ts`.
 *
 * Fixed monthly costs are not in the database: set FIXED_MONTHLY_USD (the total
 * from FinancePlan.md §4) and, if you want, EUR_TO_USD (default 1.08).
 *
 * Run: FIXED_MONTHLY_USD=60 npx tsx scripts/finance-report.mts [--json]
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

async function selectAll(table: string, columns: string, since?: string) {
  const rows: Record<string, string | number>[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Record<string, string | number>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll('render_jobs', 'model_tier, status, api_cost_usd, created_at', since),
]);

const report = computeFinance({
  now: new Date(),
  eurToUsd: Number(process.env.EUR_TO_USD ?? 1.08),
  fixedMonthlyUsd: Number(process.env.FIXED_MONTHLY_USD ?? 0),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id),
    planId: String(s.plan_id),
    status: String(s.status),
  })),
  jobs: jobs.map((j) => ({
    tier: String(j.model_tier),
    status: String(j.status),
    apiCostUsd: Number(j.api_cost_usd),
    createdAt: new Date(String(j.created_at)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
if (!process.env.FIXED_MONTHLY_USD) console.warn('FIXED_MONTHLY_USD not set: fixed cost = 0.\n');
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(
  `MRR: €${report.mrrEur} from ${report.payingSubscribers} subscribers (ARPU €${report.arpuEur})`,
);
console.log(
  `API spend, last 30d: $${report.apiCost30dUsd} for ${report.videosDone30d} finished videos`,
);
console.log(`  of which spent on failed jobs: $${report.failedCost30dUsd}`);
console.log(`Cash margin / month: $${report.monthlyCashMarginUsd}`);
console.log(`Revenue ÷ cost: ${report.revenueToCostRatio ?? 'n/a'}`);
console.log(`Subscribers to cover fixed cost: ${report.breakEvenSubscribers ?? 'n/a'}\n`);
console.table(report.byPlan);
console.table(report.tiers);
