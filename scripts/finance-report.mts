/**
 * Finance report: MRR (gross + net of VAT/Stripe fees), API spend per finished
 * video and per tier, money wasted on failed jobs, trial burn, margin and the
 * MRR ÷ variable-cost ratio. READ-ONLY (`select`s with the service role from
 * `.env.local`). Math lives in `src/features/finance/unit-economics.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--days 30] [--fixed-usd 45] [--json]
 *   --fixed-usd = monthly hosting + DB + email + monitoring (see FinancePlan.md §4)
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

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(name);
  const n = i >= 0 ? Number(process.argv[i + 1]) : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const { computeFinance } = await import('@/features/finance/unit-economics');
const { assessMargins } = await import('@/features/billing/margin');
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
    rows.push(...(data as unknown as Record<string, unknown>[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const windowDays = arg('--days', 30);
const [subs, jobs, profiles] = await Promise.all([
  selectAll('subscriptions', 'plan_id, status, created_at'),
  selectAll('render_jobs', 'status, model_tier, target_duration_sec, api_cost_usd, created_at'),
  selectAll('profiles', 'created_at'),
]);

const now = new Date();
const since = now.getTime() - windowDays * 86_400_000;
const margins = assessMargins();
const report = computeFinance({
  now,
  windowDays,
  fixedMonthlyUsd: arg('--fixed-usd', 0),
  trialBurnUsd: margins.trialCostUsd,
  signupsInWindow: profiles.filter((p) => new Date(String(p.created_at)).getTime() >= since).length,
  subscriptions: subs.map((s) => ({ planId: String(s.plan_id), status: String(s.status) })),
  jobs: jobs.map((j) => ({
    status: String(j.status),
    modelTier: String(j.model_tier),
    targetDurationSec: Number(j.target_duration_sec),
    apiCostUsd: Number(j.api_cost_usd),
    createdAt: new Date(String(j.created_at)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify({ report, marginGate: { ok: margins.ok } }, null, 2));
  process.exit(0);
}
console.log(`Shortcraft finance — last ${windowDays}d, as of ${now.toISOString()}\n`);
console.log(`Paying subscribers: ${report.payingSubscribers}`);
console.log(
  `MRR gross €${report.grossMrrEur} · net $${report.netMrrUsd} · ARR $${report.arrNetUsd}`,
);
console.log(
  `API spend (30d-scaled) $${report.apiSpend30dUsd} · trial burn $${report.trialBurn30dUsd} · fixed $${report.fixedMonthlyUsd}`,
);
console.log(
  `Profit/month $${report.profit30dUsd} · margin ${report.grossMargin ?? 'n/a'} · MRR÷variable ${report.mrrToVariableCost ?? 'n/a'}`,
);
console.log(
  `Finished ${report.jobsFinished} · failed ${report.jobsFailed} · wasted on failed $${report.wastedOnFailedUsd}`,
);
console.log(
  `Cost per finished video: ${report.costPerFinishedVideoUsd === null ? 'n/a' : '$' + report.costPerFinishedVideoUsd}`,
);
console.table(report.costByTier);
console.log(`Margin gate (worst case): ${margins.ok ? 'PASS' : 'FAIL'}`);
