/**
 * Finance report: MRR, API spend vs credits burned, cost per video by tier and
 * the monthly contribution after fixed costs. READ-ONLY `select`s with the
 * service role from `.env.local`. Definitions: `src/features/finance/unit-economics.ts`.
 *
 * Fixed monthly costs (hosting, Supabase, tools) are not in the database; pass
 * them with FIXED_MONTHLY_COST_USD or --fixed=<usd>. Until set they count as 0
 * and the report says so.
 *
 * Run: npx tsx scripts/finance-report.mts [--days=30] [--fixed=45] [--json]
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

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const windowDays = Number(arg('days') ?? 30);
const fixedArg = arg('fixed') ?? process.env.FIXED_MONTHLY_COST_USD;
const fixedMonthlyCostUsd = Number(fixedArg ?? 0);

const { computeFinance } = await import('@/features/finance/unit-economics');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const admin = createSupabaseAdminClient();
const PAGE = 1000;

async function selectAll<T>(table: string, columns: string, since?: Date): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (since) q = q.gte('created_at', since.toISOString());
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const now = new Date();
const since = new Date(now.getTime() - windowDays * 86_400_000);
type Row = Record<string, string | number>;
const [jobs, subs, grants] = await Promise.all([
  selectAll<Row>(
    'render_jobs',
    'status, model_tier, target_duration_sec, actual_credits, api_cost_usd, created_at',
    since,
  ),
  selectAll<Row>('subscriptions', 'plan_id, status, created_at'),
  selectAll<Row>('credit_transactions', 'delta, reason, created_at', since),
]);

const report = computeFinance({
  now,
  windowDays,
  fixedMonthlyCostUsd,
  topUpGrossCents: 0,
  paidCreditsGranted: grants
    .filter((g) => g.reason === 'monthly_grant' || g.reason === 'topup')
    .reduce((n, g) => n + Number(g.delta), 0),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    targetDurationSec: Number(j.target_duration_sec),
    actualCredits: Number(j.actual_credits),
    apiCostUsd: Number(j.api_cost_usd),
    createdAt: new Date(String(j.created_at)),
  })),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ ...report, fixedCostsKnown: fixedArg !== undefined }, null, 2));
  process.exit(0);
}

const usd = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
console.log(`Shortcraft finance — ${report.asOf} (window ${windowDays}d)\n`);
console.log(`MRR gross:            €${(report.mrrGrossCents / 100).toFixed(2)}`);
console.log(
  `MRR net (VAT+fees):   ${usd(report.mrrNetUsd)}  (${report.payingSubscribers} subscribers)`,
);
console.log(
  `API spend (window):   ${usd(report.apiCostUsd)}  (failed jobs: ${usd(report.failedCostUsd)})`,
);
console.log(`API spend per 30d:    ${usd(report.apiCostPer30dUsd)}`);
console.log(
  `API share of MRR:     ${report.apiCostShareOfMrr === null ? 'n/a' : `${(report.apiCostShareOfMrr * 100).toFixed(1)}%`}`,
);
console.log(
  `Fixed costs / month:  ${fixedArg === undefined ? 'UNKNOWN (counted as $0) — set FIXED_MONTHLY_COST_USD' : usd(report.fixedMonthlyCostUsd)}`,
);
console.log(`Monthly contribution: ${usd(report.monthlyContributionUsd)}`);
console.log(`Break-even subs:      ${report.breakEvenSubscribers ?? 'n/a'}\n`);
console.table(report.byPlan);
console.table(
  report.tiers.map((t) => ({
    tier: t.tier,
    videos: t.videos,
    apiCost: usd(t.apiCostUsd),
    perVideo: usd(t.avgCostPerVideoUsd),
    creditsBurned: t.creditsBurned,
    per1kCredits: usd(t.costPer1kCreditsUsd),
  })),
);
