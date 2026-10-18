/**
 * Finance report: MRR, API spend vs revenue, cost per video by tier, waste on
 * failed jobs. READ-ONLY (selects only, service role from `.env.local`).
 * Definitions live in `src/features/finance/unit-economics.ts`.
 *
 * Fixed monthly costs (hosting, Supabase, ElevenLabs plan, domains…) are not in
 * the database: pass `--fixed=<usd>` or set FINANCE_FIXED_MONTHLY_USD. Without
 * either, the report assumes 0 and says so.
 *
 * Run: npx tsx scripts/finance-report.mts [--days=30] [--fixed=60] [--json]
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

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const windowDays = Number(arg('days') ?? 30);
const fixedArg = arg('fixed') ?? process.env.FINANCE_FIXED_MONTHLY_USD;
const fixedMonthlyUsd = Number(fixedArg ?? 0);
const usdPerEur = Number(arg('usd-per-eur') ?? process.env.USD_PER_EUR ?? 1.1);

const admin = createSupabaseAdminClient();
const PAGE = 1000;
type Row = Record<string, string | number>;

async function selectAll(table: string, columns: string, since?: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (since) q = q.gte('created_at', since);
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const since = new Date(Date.now() - windowDays * 86_400_000).toISOString();
const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll('render_jobs', 'status, model_tier, api_cost_usd, actual_credits, created_at', since),
]);

const report = computeFinance({
  now: new Date(),
  windowDays,
  fixedMonthlyUsd,
  usdPerEur,
  subscriptions: subs.map((s) => ({
    planId: String(s.plan_id),
    status: String(s.status),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
    createdAt: new Date(String(j.created_at)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ...report, fixedCostsKnown: fixedArg !== undefined }, null, 2));
  process.exit(0);
}

console.log(`Shortcraft finance — as of ${report.asOf} (last ${windowDays} days)\n`);
console.log(`MRR (internal, list price): €${report.mrrEur}  (${report.payingSubscribers} paying)`);
for (const [plan, v] of Object.entries(report.byPlan))
  console.log(`  ${plan}: ${v.subscribers} × → €${v.mrrEur}`);
console.log(`\nAPI spend: $${report.apiSpendUsd}  (≈ $${report.apiSpendPer30dUsd} / 30d)`);
console.log(`Wasted on failed jobs: $${report.wasteUsd} (${report.failedJobs} jobs)`);
for (const t of report.tiers)
  console.log(
    `  ${t.tier}: ${t.doneJobs} done · $${t.avgApiCostUsd}/video · ${t.avgCredits} cr/video · $${t.usdPer1kCredits} per 1k credits`,
  );
console.log(
  `\nFixed costs: $${report.fixedMonthlyUsd}${fixedArg === undefined ? ' (UNKNOWN: pass --fixed=<usd>)' : ''}`,
);
console.log(`Monthly contribution: $${report.monthlyContributionUsd}`);
console.log(`Revenue ÷ cost coverage: ${report.coverage ?? 'n/a (no costs)'}`);
