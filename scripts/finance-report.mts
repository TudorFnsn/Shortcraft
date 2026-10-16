/**
 * Finance report: MRR, net MRR, 30-day API spend (COGS), wasted spend on failed
 * jobs, cost per finished video and gross margin, read from the Supabase project
 * in `.env.local`. READ-ONLY (selects only). Math: `features/metrics/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--fixed-usd=60] [--json]
 *   --fixed-usd  monthly fixed costs in USD (hosting, DB, voice plan, domain)
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

async function selectAll(table: string, columns: string): Promise<Record<string, string>[]> {
  const rows: Record<string, string>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as unknown as Record<string, string>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll('render_jobs', 'user_id, status, model_tier, api_cost_usd, created_at'),
]);

const fixedArg = process.argv.find((a) => a.startsWith('--fixed-usd='));
const report = computeFinance({
  now: new Date(),
  fixedCostsUsdPerMonth: fixedArg ? Number(fixedArg.split('=')[1]) : undefined,
  subscriptions: subs.map((s) => ({
    userId: s.user_id ?? '',
    planId: s.plan_id ?? '',
    status: s.status ?? '',
  })),
  jobs: jobs.map((j) => ({
    userId: j.user_id ?? '',
    status: j.status ?? '',
    modelTier: j.model_tier ?? 'standard',
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    createdAt: new Date(j.created_at ?? 0),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(
  `MRR: €${report.mrrEur}  (ARR €${report.arrEur})   net of VAT+fees: $${report.netMrrUsd}`,
);
console.log(`Paying subscribers: ${report.payingSubscribers}`);
console.log(
  `API spend, 30d: $${report.cogs30dUsd}  (wasted on failed jobs: $${report.wastedSpend30dUsd})`,
);
console.log(
  `Gross margin: ${pct(report.grossMargin)}   Net profit/mo: ${report.netProfitUsdPerMonth ?? 'n/a'}`,
);
console.log(
  `API cost per paying user: $${report.cogsPerPayingUserUsd ?? 'n/a'}   Trial/free share of spend: ${pct(report.nonPayingCogsShare)}\n`,
);
console.table(report.byPlan);
console.table(report.byTier);
for (const n of report.notes) console.log(`note: ${n}`);
