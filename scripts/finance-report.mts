/**
 * Finance report: MRR/ARR, ARPU, cost per finished video by tier, wasted spend
 * on failed jobs and the monthly gross margin, read from the Supabase project in
 * `.env.local`. READ-ONLY: it only runs `select`s (service role).
 * Definitions live in `src/features/finance/unit-economics.ts`. API cost is what
 * the adapters reported, not what the providers billed: reconcile it against
 * their invoices/usage APIs (FinancePlan §4).
 *
 * Run: npx tsx scripts/finance-report.mts [--days=30]   (table)
 *      npx tsx scripts/finance-report.mts --json        (raw report, for the digest)
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
const daysArg = process.argv.find((a) => a.startsWith('--days='));
const windowDays = daysArg ? Math.max(1, Number(daysArg.slice(7)) || 30) : 30;

async function selectAll<T>(table: string, columns: string): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

type Row = Record<string, string | number | null>;
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>('render_jobs', 'status, model_tier, actual_credits, api_cost_usd, created_at'),
]);

const report = computeFinance({
  now: new Date(),
  windowDays,
  subscriptions: subs.map((s) => ({
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? ''),
    actualCredits: Number(j.actual_credits ?? 0),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    createdAt: new Date(String(j.created_at ?? 0)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf} (window ${report.windowDays}d)\n`);
console.log(`★ MRR: €${report.mrrEur}   ARR: €${report.arrEur}   net MRR: $${report.netMrrUsd}`);
console.log(
  `  Paying subscribers: ${report.payingSubscribers}  ${JSON.stringify(report.subscribersByPlan)}`,
);
console.log(`  ARPU: ${report.arpuEur === null ? 'n/a' : `€${report.arpuEur}`}`);
console.log(
  `  API cost in window: $${report.windowApiCostUsd} (wasted on failed jobs: $${report.wastedApiCostUsd})`,
);
console.log(`  Monthly gross margin: ${pct(report.grossMarginMonthly)}\n`);
console.table(report.tiers);
