/**
 * Finance report: MRR vs measured API cost per video, trial burn and failed-job
 * waste, read from the Supabase project in `.env.local`. READ-ONLY (selects only).
 * Math lives in `src/features/metrics/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--days 30] [--fixed-usd 45] [--json]
 *   --fixed-usd = monthly fixed costs (Vercel, Supabase, ElevenLabs plan, seats...).
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

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? Number(process.argv[i + 1]) : undefined;
};
const days = arg('--days') ?? 30;
const fixedMonthlyUsd = arg('--fixed-usd') ?? 0;

const admin = createSupabaseAdminClient();
const PAGE = 1000;
type Row = Record<string, string | number>;

async function selectAll(table: string, columns: string, sinceIso?: string): Promise<Row[]> {
  const rows: Row[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = admin.from(table).select(columns);
    if (sinceIso) q = q.gte('created_at', sinceIso);
    const { data, error } = await q.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Row[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const now = new Date();
const sinceIso = new Date(now.getTime() - days * 86_400_000).toISOString();
const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll(
    'render_jobs',
    'user_id, status, model_tier, api_cost_usd, actual_credits, created_at',
    sinceIso,
  ),
]);

const report = computeFinance(
  {
    now,
    fixedMonthlyUsd,
    subscriptions: subs.map((s) => ({
      userId: String(s.user_id),
      planId: String(s.plan_id),
      status: String(s.status),
    })),
    jobs: jobs.map((j) => ({
      userId: String(j.user_id),
      status: String(j.status),
      modelTier: String(j.model_tier),
      apiCostUsd: Number(j.api_cost_usd),
      actualCredits: Number(j.actual_credits),
      createdAt: new Date(String(j.created_at)),
    })),
  },
  days,
);

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
const usd = (n: number) => `$${n.toFixed(2)}`;
console.log(`Shortcraft finance — as of ${report.asOf} (last ${days}d)\n`);
console.log(`Paying subscribers:      ${report.payingSubscribers}`);
console.log(`MRR (gross / net USD):   €${report.mrrEur.toFixed(2)} / ${usd(report.mrrNetUsd)}`);
console.log(`API cost (window):       ${usd(report.apiCostUsd)}`);
console.log(`  of which failed jobs:  ${usd(report.failedCostUsd)}`);
console.log(`  of which non-payers:   ${usd(report.freeUserCostUsd)} (trial burn)`);
console.log(`Fixed monthly (given):   ${usd(report.fixedMonthlyUsd)}`);
console.log(`Monthly profit (est.):   ${usd(report.monthlyProfitUsd)}`);
console.log(
  `Net MRR ÷ API cost:      ${report.revenueToApiCost === null ? 'n/a' : `${report.revenueToApiCost.toFixed(2)}x`}\n`,
);
console.table(
  report.tiers.map((t) => ({
    tier: t.tier,
    jobs: t.jobs,
    finished: t.finished,
    costUsd: usd(t.costUsd),
    costPerFinished: t.costPerFinishedUsd === null ? 'n/a' : usd(t.costPerFinishedUsd),
  })),
);
