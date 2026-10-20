/**
 * Finance report: MRR, API spend, gross margin and cash coverage, read from the
 * Supabase project in `.env.local`. READ-ONLY: it only runs `select`s (service
 * role). Definitions live in `src/features/finance/unit-economics.ts`.
 *
 * Fixed monthly bills (hosting, ElevenLabs plan, ...) are not in the database:
 * pass them with `--fixed "Vercel=20,ElevenLabs=22,Supabase=0"` (USD / month) or
 * keep them in `FINANCE_FIXED_COSTS` in `.env.local` in the same format.
 *
 * Run: npx tsx scripts/finance-report.mts                 (table, 30-day window)
 *      npx tsx scripts/finance-report.mts --days 7 --json (raw report, for the digest)
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env.local into process.env BEFORE importing app modules (env validates on import).
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

const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const windowDays = Number(arg('--days') ?? 30);
if (!Number.isFinite(windowDays) || windowDays <= 0) throw new Error('--days must be > 0');

const fixedCosts = (arg('--fixed') ?? process.env.FINANCE_FIXED_COSTS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((pair) => {
    const [name = '', usd = ''] = pair.split('=');
    const usdPerMonth = Number(usd);
    if (!name || !Number.isFinite(usdPerMonth)) throw new Error(`Bad fixed cost "${pair}"`);
    return { name, usdPerMonth };
  });

const admin = createSupabaseAdminClient();
const PAGE = 1000;

/** Every row of a select, paged (PostgREST caps a response at 1,000 rows). */
async function selectAll<T>(table: string, columns: string, since?: Date): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const base = admin.from(table).select(columns);
    const filtered = since ? base.gte('created_at', since.toISOString()) : base;
    const { data, error } = await filtered.order('created_at').range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data as T[]));
    if (!data || data.length < PAGE) return rows;
  }
}

const now = new Date();
const since = new Date(now.getTime() - windowDays * 86_400_000);
type Row = Record<string, string | number>;
const [subs, jobs] = await Promise.all([
  selectAll<Row>('subscriptions', 'user_id, plan_id, status, created_at'),
  selectAll<Row>(
    'render_jobs',
    'user_id, status, model_tier, target_duration_sec, api_cost_usd, charged_credits, created_at',
    since,
  ),
]);

const report = computeFinance({
  now,
  windowDays,
  fixedCosts,
  subscriptions: subs.map((s) => ({
    userId: String(s.user_id ?? ''),
    planId: String(s.plan_id ?? ''),
    status: String(s.status ?? ''),
  })),
  jobs: jobs.map((j) => ({
    userId: String(j.user_id ?? ''),
    status: String(j.status ?? ''),
    modelTier: String(j.model_tier ?? 'standard'),
    targetDurationSec: Number(j.target_duration_sec ?? 0),
    apiCostUsd: Number(j.api_cost_usd ?? 0),
    chargedCredits: Number(j.charged_credits ?? 0),
    createdAt: new Date(String(j.created_at ?? 0)),
  })),
});

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

const usd = (n: number) => `$${n.toFixed(2)}`;
const pct = (n: number | null) => (n === null ? 'n/a' : `${(n * 100).toFixed(1)}%`);
console.log(`Shortcraft finance — as of ${report.asOf} (${windowDays}-day window)\n`);
console.log(`Paying subscribers: ${report.payingSubscribers}`);
console.log(`MRR: €${report.mrrGrossEur.toFixed(2)} gross · ${usd(report.mrrNetUsd)} net`);
console.table(report.byPlan);
console.log(
  `Jobs: ${report.jobs} (${report.failedJobs} failed, ${usd(report.failedCostUsd)} wasted)`,
);
console.log(
  `API cost: ${usd(report.apiCostUsd)} in window · ${usd(report.apiCostMonthlyUsd)} / month · ` +
    `${usd(report.freeBurnUsd)} on non-paying users`,
);
console.table(report.byTier);
console.log(`Fixed costs: ${usd(report.fixedMonthlyUsd)} / month`);
console.log(`Gross margin: ${pct(report.grossMargin)}`);
console.log(`Monthly profit: ${usd(report.monthlyProfitUsd)}`);
console.log(`Coverage (net MRR ÷ spend): ${report.coverage ?? 'n/a'}x`);
