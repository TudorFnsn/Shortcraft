/**
 * Finance report: MRR, ARPU, realized API cost per video and month-to-date gross
 * margin, read from the Supabase project in `.env.local`. READ-ONLY (selects).
 * Math lives in `src/features/finance/unit-economics.ts`. What was actually
 * collected / refunded / charged back comes from the Stripe connector, not here.
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

async function selectAll(table: string, columns: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from(table)
      .select(columns)
      .order('created_at')
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll('render_jobs', 'user_id, status, model_tier, api_cost_usd, actual_credits, created_at'),
]);

const report = computeFinance({
  now: new Date(),
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
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

console.log(`Shortcraft finance — as of ${report.asOf}\n`);
console.log(
  `MRR €${report.mrrEur} (net ~$${report.netMrrUsd}) · ${report.payingSubscribers} paying · ARPU ${report.arpuEur === null ? 'n/a' : `€${report.arpuEur}`}`,
);
console.log(`By plan: ${JSON.stringify(report.byPlan)}`);
const m = report.monthToDate;
console.log(
  `Month to date: ${m.jobs} jobs · API spend $${m.apiSpendUsd} (wasted on non-done $${m.wastedSpendUsd}) · gross margin ${m.grossMargin === null ? 'n/a' : `${(m.grossMargin * 100).toFixed(1)}%`}`,
);
console.log(`Realized API cost per 1k credits charged: ${report.costUsdPer1kCredits ?? 'n/a'}`);
console.table(report.costPerDoneVideo);
