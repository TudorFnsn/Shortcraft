/**
 * Finance report for the Finance CFO routine: MRR, API cost per finished video
 * and monthly burn coverage, read from the Supabase project in `.env.local`.
 * READ-ONLY: only `select`s (service role). Definitions live in
 * `src/features/metrics/finance.ts`.
 *
 * Run: npx tsx scripts/finance-report.mts [--json] [--days=30] [--fixed-usd=45] [--usd-per-eur=1.08]
 * `--fixed-usd` is the monthly hosting/tools bill from FinancePlan §3 (default 0).
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
const flag = (name: string, fallback: number) => {
  const raw = process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
  const n = raw === undefined ? fallback : Number(raw);
  if (!Number.isFinite(n)) throw new Error(`--${name} must be a number`);
  return n;
};

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

const [subs, jobs] = await Promise.all([
  selectAll('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll('render_jobs', 'status, model_tier, created_at, api_cost_usd, charged_credits'),
]);

const report = computeFinance({
  now: new Date(),
  windowDays: flag('days', 30),
  fixedMonthlyUsd: flag('fixed-usd', 0),
  usdPerEur: flag('usd-per-eur', 1.08),
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  jobs: jobs.map((j) => ({
    status: String(j.status ?? ''),
    tier: String(j.model_tier ?? ''),
    createdAt: new Date(String(j.created_at ?? 0)),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    chargedCredits: Number(j.charged_credits ?? 0),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const pct = (n: number | null) => (n === null ? 'n/a' : `${n.toFixed(2)}x`);
console.log(`Shortcraft finance — as of ${report.asOf} (last ${report.windowDays}d)\n`);
console.log(
  `MRR (list, gross):        €${report.mrrEur} from ${report.payingSubscribers} subscribers`,
);
console.log(`Videos done / failed:     ${report.videos} / ${report.failedVideos}`);
console.log(`API cost (catalog est.):  $${report.apiCostUsd}`);
console.log(
  `Monthly burn:             $${report.monthlyBurnUsd} (API scaled to 30d + fixed $${report.fixedMonthlyUsd})`,
);
console.log(
  `Monthly margin:           ${report.monthlyMarginUsd === null ? 'n/a' : `$${report.monthlyMarginUsd}`}`,
);
console.log(`MRR ÷ burn:               ${pct(report.coverage)}\n`);
console.table(report.byPlan);
console.table(report.byTier);
