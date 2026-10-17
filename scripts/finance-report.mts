/**
 * Finance report: MRR, net revenue vs. API + fixed cost, cost per finished video
 * by tier. Read from the Supabase project in `.env.local`. READ-ONLY (selects).
 * Math lives in `src/features/finance/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--days 30] [--fixed 45] [--json]
 *   --fixed = monthly fixed costs in USD (Vercel, Supabase, ElevenLabs plan, domain...)
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

const { computeFinance } = await import('@/features/finance/finance');
const { createSupabaseAdminClient } = await import('@/utils/supabase/admin');

const flag = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  const n = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const admin = createSupabaseAdminClient();
const PAGE = 1000;
type Row = Record<string, string | number>;

async function selectAll(
  table: string,
  columns: string,
  only?: { column: string; equals: string },
): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = only ? base.eq(only.column, only.equals) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [subs, topups, jobs] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectAll('credit_transactions', 'delta, created_at', { column: 'reason', equals: 'topup' }),
  selectAll(
    'render_jobs',
    'status, model_tier, target_duration_sec, api_cost_usd, actual_credits, created_at',
  ),
]);

const report = computeFinance({
  now: new Date(),
  windowDays: flag('days', 30),
  fixedCostsUsdPerMonth: flag('fixed', 0),
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  topups: topups.map((t) => ({
    credits: Number(t.delta),
    createdAt: new Date(String(t.created_at)),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    targetDurationSec: Number(j.target_duration_sec),
    apiCostUsd: Number(j.api_cost_usd),
    actualCredits: Number(j.actual_credits),
    createdAt: new Date(String(j.created_at)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays} days)\n`);
console.log(
  `MRR            €${report.mrrEur}  (net $${report.netMrrUsd}, ${report.payingSubscribers} subscribers, ARPU ${report.arpuEur ?? 'n/a'})`,
);
console.log(`Top-ups        €${report.topupRevenueEur}`);
console.log(`API cost       $${report.apiCostUsd}  (failed jobs $${report.failedJobCostUsd})`);
console.log(`Fixed costs    $${report.fixedCostsUsd}/mo`);
console.log(
  `Profit/month   $${report.monthlyProfitUsd}   revenue÷cost ${report.revenueToCost ?? 'n/a'}x`,
);
for (const [tier, t] of Object.entries(report.byTier))
  console.log(
    `  ${tier}: ${t.videos} videos, avg $${t.avgCostUsd}, ${t.creditsPerUsd ?? 'n/a'} credits per $`,
  );
